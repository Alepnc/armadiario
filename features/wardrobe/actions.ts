"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { BUCKETS } from "@/lib/config";
import { AuthError, getUserOrThrow } from "@/lib/security/auth";
import { removePaths } from "@/lib/storage";
import {
  availabilityUpdateSchema,
  clothingItemInputSchema,
  ownedPathSchema,
  type ClothingItemInput,
} from "@/lib/validation/wardrobe";
import { log } from "@/lib/utils/logger";
import type { ActionResult } from "@/lib/utils/action";
import { fail, ok, zodMessage } from "@/lib/utils/action";

const imageRefSchema = z.object({
  image_path: z.string(),
  thumb_path: z.string().nullable().optional(),
  image_hash: z.string().regex(/^[0-9a-f]{16}$/).nullable().optional(),
});

function revalidateWardrobe() {
  revalidatePath("/wardrobe");
  revalidatePath("/dashboard");
}

async function guard<T>(fn: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof AuthError) return fail("Sessione scaduta: accedi di nuovo.");
    log.error("wardrobe_action_failed", {}, e);
    return fail("Operazione non riuscita. Riprova.");
  }
}

export async function createItemAction(
  input: ClothingItemInput,
  image: z.input<typeof imageRefSchema>,
  analysis?: unknown,
): Promise<ActionResult<{ id: string }>> {
  return guard(async () => {
    const { user, supabase } = await getUserOrThrow();
    const data = clothingItemInputSchema.safeParse(input);
    const img = imageRefSchema.safeParse(image);
    if (!data.success) return fail(zodMessage(data.error));
    if (!img.success) return fail("Immagine non valida");
    const owned = ownedPathSchema(user.id);
    if (!owned.safeParse(img.data.image_path).success) return fail("Immagine non valida");
    if (img.data.thumb_path && !owned.safeParse(img.data.thumb_path).success) return fail("Immagine non valida");

    const { data: row, error } = await supabase
      .from("clothing_items")
      .insert({
        ...data.data,
        user_id: user.id,
        image_path: img.data.image_path,
        thumb_path: img.data.thumb_path ?? null,
        image_hash: img.data.image_hash ?? null,
        ai_analysis: analysis ?? null,
      })
      .select("id")
      .single();
    if (error || !row) return fail("Impossibile salvare il capo");
    revalidateWardrobe();
    return ok({ id: row.id as string });
  });
}

export async function updateItemAction(
  id: string,
  input: ClothingItemInput,
  newImage?: z.input<typeof imageRefSchema>,
): Promise<ActionResult> {
  return guard(async () => {
    const { user, supabase } = await getUserOrThrow();
    if (!z.string().uuid().safeParse(id).success) return fail("Capo non valido");
    const data = clothingItemInputSchema.safeParse(input);
    if (!data.success) return fail(zodMessage(data.error));

    const { data: existing } = await supabase
      .from("clothing_items")
      .select("image_path,thumb_path")
      .eq("id", id)
      .maybeSingle();
    if (!existing) return fail("Capo non trovato");

    const patch: Record<string, unknown> = { ...data.data };
    let toRemove: string[] = [];
    if (newImage) {
      const img = imageRefSchema.safeParse(newImage);
      const owned = ownedPathSchema(user.id);
      if (!img.success || !owned.safeParse(img.data.image_path).success) return fail("Immagine non valida");
      if (img.data.thumb_path && !owned.safeParse(img.data.thumb_path).success) return fail("Immagine non valida");
      patch.image_path = img.data.image_path;
      patch.thumb_path = img.data.thumb_path ?? null;
      patch.image_hash = img.data.image_hash ?? null;
      patch.ai_analysis = null;
      toRemove = [existing.image_path, existing.thumb_path].filter(Boolean) as string[];
    }
    const { error } = await supabase.from("clothing_items").update(patch).eq("id", id);
    if (error) return fail("Impossibile aggiornare il capo");
    await removePaths(supabase, BUCKETS.wardrobe, toRemove);
    revalidateWardrobe();
    revalidatePath(`/wardrobe/${id}`);
    revalidatePath("/outfits");
    return ok();
  });
}

export async function setAvailabilityAction(input: z.input<typeof availabilityUpdateSchema>): Promise<ActionResult> {
  return guard(async () => {
    const { supabase } = await getUserOrThrow();
    const parsed = availabilityUpdateSchema.safeParse(input);
    if (!parsed.success) return fail("Stato non valido");
    const { id, status, expected_available_at } = parsed.data;
    const { data, error } = await supabase
      .from("clothing_items")
      .update({
        availability_status: status,
        // The return date is informational and only meaningful while unavailable.
        expected_available_at: status === "available" ? null : (expected_available_at ?? null),
      })
      .eq("id", id)
      .select("id");
    if (error || !data?.length) return fail("Impossibile aggiornare lo stato");
    revalidateWardrobe();
    revalidatePath(`/wardrobe/${id}`);
    revalidatePath("/outfits");
    return ok();
  });
}

export async function toggleFavoriteAction(id: string, value: boolean): Promise<ActionResult> {
  return guard(async () => {
    const { supabase } = await getUserOrThrow();
    if (!z.string().uuid().safeParse(id).success) return fail("Capo non valido");
    const { data, error } = await supabase.from("clothing_items").update({ is_favorite: value }).eq("id", id).select("id");
    if (error || !data?.length) return fail("Impossibile aggiornare i preferiti");
    revalidateWardrobe();
    revalidatePath(`/wardrobe/${id}`);
    return ok();
  });
}

/**
 * Deletes the garment and its images. Saved outfits keep existing: the FK is
 * ON DELETE SET NULL and each outfit_item keeps the garment name snapshot.
 */
export async function deleteItemAction(id: string): Promise<ActionResult> {
  return guard(async () => {
    const { supabase } = await getUserOrThrow();
    if (!z.string().uuid().safeParse(id).success) return fail("Capo non valido");
    const { data: existing } = await supabase
      .from("clothing_items")
      .select("image_path,thumb_path")
      .eq("id", id)
      .maybeSingle();
    if (!existing) return fail("Capo non trovato");
    const { error } = await supabase.from("clothing_items").delete().eq("id", id);
    if (error) return fail("Impossibile eliminare il capo");
    await removePaths(supabase, BUCKETS.wardrobe, [existing.image_path, existing.thumb_path]);
    revalidateWardrobe();
    revalidatePath("/outfits");
    return ok();
  });
}

/** Removes an uploaded-but-unsaved image (e.g. the user dismissed it from the queue). */
export async function discardUploadAction(paths: string[]): Promise<ActionResult> {
  return guard(async () => {
    const { user, supabase } = await getUserOrThrow();
    const owned = ownedPathSchema(user.id);
    const safe = paths.filter((p) => owned.safeParse(p).success).slice(0, 4);
    await removePaths(supabase, BUCKETS.wardrobe, safe);
    return ok();
  });
}

const categorySchema = z.object({
  label: z.string().trim().min(1).max(60),
  slot: z.enum(["top", "bottom", "dress", "outer", "shoes", "accessory", "bag", "other"]),
});

/** Custom categories: the engine only needs the `slot`, so no code change is needed. */
export async function createCategoryAction(input: z.input<typeof categorySchema>): Promise<ActionResult<{ id: string }>> {
  return guard(async () => {
    const { user, supabase } = await getUserOrThrow();
    const parsed = categorySchema.safeParse(input);
    if (!parsed.success) return fail(zodMessage(parsed.error));
    const slug = parsed.data.label
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40);
    if (!slug) return fail("Nome categoria non valido");
    const { data, error } = await supabase
      .from("categories")
      .insert({ user_id: user.id, slug, label: parsed.data.label, slot: parsed.data.slot, sort_order: 200 })
      .select("id")
      .single();
    if (error || !data) return fail("Categoria già esistente o non valida");
    revalidatePath("/wardrobe");
    return ok({ id: data.id as string });
  });
}
