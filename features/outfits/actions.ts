"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { AuthError, getUserOrThrow } from "@/lib/security/auth";
import { RateLimitError } from "@/lib/security/rate-limit";
import { saveOutfitSchema, stylistRequestSchema, type SaveOutfitInput } from "@/lib/validation/outfit";
import { fail, ok, zodMessage, type ActionResult } from "@/lib/utils/action";
import { log } from "@/lib/utils/logger";
import { alternativesFor, generateOutfits, rebuildProposal, UserFacingError } from "./service";
import type { GenerationResponse, ProposalView } from "./types";

async function guard<T>(fn: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof AuthError) return fail("Sessione scaduta: accedi di nuovo.");
    if (e instanceof UserFacingError || e instanceof RateLimitError) return fail(e.message);
    log.error("outfit_action_failed", {}, e);
    return fail("Operazione non riuscita. Riprova.");
  }
}

const uuid = z.string().uuid();

export async function generateOutfitsAction(
  request: z.input<typeof stylistRequestSchema>,
  avoidCombo?: string[],
): Promise<ActionResult<GenerationResponse>> {
  return guard(async () => {
    const { user, supabase } = await getUserOrThrow();
    const parsed = stylistRequestSchema.safeParse(request);
    if (!parsed.success) return fail(zodMessage(parsed.error));
    const avoid = z.array(uuid).max(10).optional().safeParse(avoidCombo);
    const res = await generateOutfits(supabase, user.id, parsed.data, { avoidCombo: avoid.success ? avoid.data : undefined });
    return ok(res);
  });
}

export async function alternativesAction(
  request: z.input<typeof stylistRequestSchema>,
  itemIds: string[],
  replaceId: string,
): Promise<ActionResult<{ alternatives: ProposalView["items"] }>> {
  return guard(async () => {
    const { user, supabase } = await getUserOrThrow();
    const parsed = stylistRequestSchema.safeParse(request);
    const ids = z.array(uuid).min(2).max(10).safeParse(itemIds);
    if (!parsed.success || !ids.success || !uuid.safeParse(replaceId).success) return fail("Richiesta non valida");
    return ok(await alternativesFor(supabase, user.id, parsed.data, ids.data, replaceId));
  });
}

export async function rebuildProposalAction(
  request: z.input<typeof stylistRequestSchema>,
  itemIds: string[],
  title?: string,
): Promise<ActionResult<ProposalView>> {
  return guard(async () => {
    const { user, supabase } = await getUserOrThrow();
    const parsed = stylistRequestSchema.safeParse(request);
    const ids = z.array(uuid).min(2).max(10).safeParse(itemIds);
    if (!parsed.success || !ids.success) return fail("Richiesta non valida");
    return ok(await rebuildProposal(supabase, user.id, parsed.data, ids.data, title ? { title: title.slice(0, 80) } : undefined));
  });
}

/** Persists an outfit by garment ids (+ a name snapshot for deleted garments). */
export async function saveOutfitAction(input: z.input<typeof saveOutfitSchema>): Promise<ActionResult<{ id: string }>> {
  return guard(async () => {
    const { user, supabase } = await getUserOrThrow();
    const parsed = saveOutfitSchema.safeParse(input);
    if (!parsed.success) return fail(zodMessage(parsed.error));
    const data: SaveOutfitInput = parsed.data;

    const ids = data.items.map((i) => i.item_id);
    if (new Set(ids).size !== ids.length) return fail("Capo ripetuto nell'outfit");
    // RLS only returns the caller's garments: anything else is rejected.
    const { data: owned } = await supabase.from("clothing_items").select("id,name").in("id", ids);
    const names = new Map((owned ?? []).map((r) => [r.id as string, r.name as string]));
    if (names.size !== ids.length) return fail("Uno dei capi non è nel tuo guardaroba");

    const { data: outfit, error } = await supabase
      .from("outfits")
      .insert({
        user_id: user.id,
        name: data.name,
        occasion: data.occasion ?? null,
        style: data.style ?? null,
        season: data.season ?? null,
        description: data.description ?? null,
        tips: data.tips,
        notes: data.notes ?? null,
        is_favorite: data.is_favorite,
        source: data.source,
      })
      .select("id")
      .single();
    if (error || !outfit) return fail("Impossibile salvare l'outfit");

    const { error: itemsError } = await supabase.from("outfit_items").insert(
      data.items.map((i, idx) => ({
        outfit_id: outfit.id,
        clothing_item_id: i.item_id,
        role: i.role,
        position: idx,
        item_name_snapshot: names.get(i.item_id) ?? "Capo",
      })),
    );
    if (itemsError) {
      await supabase.from("outfits").delete().eq("id", outfit.id);
      return fail("Impossibile salvare l'outfit");
    }
    revalidatePath("/outfits");
    revalidatePath("/dashboard");
    return ok({ id: outfit.id as string });
  });
}

const updateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
  is_favorite: z.boolean().optional(),
});

export async function updateOutfitAction(id: string, patch: z.input<typeof updateSchema>): Promise<ActionResult> {
  return guard(async () => {
    const { supabase } = await getUserOrThrow();
    const parsed = updateSchema.safeParse(patch);
    if (!uuid.safeParse(id).success || !parsed.success) return fail("Richiesta non valida");
    const { data, error } = await supabase.from("outfits").update(parsed.data).eq("id", id).select("id");
    if (error || !data?.length) return fail("Impossibile aggiornare l'outfit");
    revalidatePath("/outfits");
    revalidatePath(`/outfits/${id}`);
    return ok();
  });
}

export async function deleteOutfitAction(id: string): Promise<ActionResult> {
  return guard(async () => {
    const { supabase } = await getUserOrThrow();
    if (!uuid.safeParse(id).success) return fail("Richiesta non valida");
    // Generated try-on images are removed by the cascade; their files are cleaned up first.
    const { data: images } = await supabase.from("generated_images").select("image_path").eq("outfit_id", id);
    const paths = (images ?? []).map((i) => i.image_path as string | null).filter((p): p is string => Boolean(p));
    if (paths.length) await supabase.storage.from("generated").remove(paths);
    const { error } = await supabase.from("outfits").delete().eq("id", id);
    if (error) return fail("Impossibile eliminare l'outfit");
    revalidatePath("/outfits");
    revalidatePath("/dashboard");
    return ok();
  });
}

/** Creates an editable copy ("variant") of an outfit. Deleted garments are skipped. */
export async function duplicateOutfitAction(id: string): Promise<ActionResult<{ id: string }>> {
  return guard(async () => {
    const { user, supabase } = await getUserOrThrow();
    if (!uuid.safeParse(id).success) return fail("Richiesta non valida");
    const { data: src } = await supabase
      .from("outfits")
      .select("*, outfit_items(clothing_item_id,role,position,item_name_snapshot)")
      .eq("id", id)
      .maybeSingle();
    if (!src) return fail("Outfit non trovato");
    const items = (src.outfit_items as Array<{ clothing_item_id: string | null; role: string; position: number; item_name_snapshot: string }>).filter(
      (i) => i.clothing_item_id,
    );
    if (items.length === 0) return fail("I capi di questo outfit non esistono più");
    const { data: copy, error } = await supabase
      .from("outfits")
      .insert({
        user_id: user.id,
        name: `${src.name} (variante)`.slice(0, 120),
        occasion: src.occasion,
        style: src.style,
        season: src.season,
        description: src.description,
        tips: src.tips,
        notes: src.notes,
        source: "duplicate",
      })
      .select("id")
      .single();
    if (error || !copy) return fail("Impossibile duplicare l'outfit");
    const { error: e2 } = await supabase.from("outfit_items").insert(
      items.map((i) => ({
        outfit_id: copy.id,
        clothing_item_id: i.clothing_item_id,
        role: i.role,
        position: i.position,
        item_name_snapshot: i.item_name_snapshot,
      })),
    );
    if (e2) {
      await supabase.from("outfits").delete().eq("id", copy.id);
      return fail("Impossibile duplicare l'outfit");
    }
    revalidatePath("/outfits");
    return ok({ id: copy.id as string });
  });
}
