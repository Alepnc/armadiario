"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { BUCKETS } from "@/lib/config";
import { createAdminClient, isAdminConfigured } from "@/lib/supabase/admin";
import { AuthError, getUserOrThrow } from "@/lib/security/auth";
import { removePaths } from "@/lib/storage";
import { ownedPathSchema } from "@/lib/validation/wardrobe";
import { profileInputSchema, type ProfileInput } from "@/lib/validation/profile";
import { fail, ok, zodMessage, type ActionResult } from "@/lib/utils/action";
import { log } from "@/lib/utils/logger";

async function guard<T>(fn: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof AuthError) return fail("Sessione scaduta: accedi di nuovo.");
    log.error("profile_action_failed", {}, e);
    return fail("Operazione non riuscita. Riprova.");
  }
}

export async function updateProfileAction(input: z.input<typeof profileInputSchema>): Promise<ActionResult> {
  return guard(async () => {
    const { user, supabase } = await getUserOrThrow();
    const parsed = profileInputSchema.safeParse(input);
    if (!parsed.success) return fail(zodMessage(parsed.error));
    const { error } = await supabase.from("profiles").update(parsed.data satisfies ProfileInput).eq("id", user.id);
    if (error) return fail("Impossibile salvare il profilo");
    revalidatePath("/profile");
    revalidatePath("/dashboard");
    return ok();
  });
}

type PhotoKind = "avatar" | "tryon";

/** Points the profile at an already-uploaded personal image (and drops the old one). */
export async function setProfilePhotoAction(kind: PhotoKind, path: string | null): Promise<ActionResult> {
  return guard(async () => {
    const { user, supabase } = await getUserOrThrow();
    const column = kind === "avatar" ? "avatar_path" : "tryon_photo_path";
    if (path !== null && !ownedPathSchema(user.id).safeParse(path).success) return fail("Immagine non valida");
    const { data: before } = await supabase.from("profiles").select(column).eq("id", user.id).maybeSingle();
    const old = (before as Record<string, string | null> | null)?.[column] ?? null;
    const { error } = await supabase.from("profiles").update({ [column]: path }).eq("id", user.id);
    if (error) return fail("Impossibile aggiornare la foto");
    if (old && old !== path) await removePaths(supabase, BUCKETS.personal, [old]);
    revalidatePath("/profile");
    revalidatePath("/settings");
    return ok();
  });
}

const consentSchema = z.object({ ai: z.boolean().optional(), vision: z.boolean().optional(), tryon: z.boolean().optional() });

export async function setConsentAction(input: z.input<typeof consentSchema>): Promise<ActionResult> {
  return guard(async () => {
    const { user, supabase } = await getUserOrThrow();
    const parsed = consentSchema.safeParse(input);
    if (!parsed.success) return fail("Richiesta non valida");
    const patch: Record<string, string | null> = {};
    const now = new Date().toISOString();
    if (parsed.data.ai !== undefined) patch.ai_consent_at = parsed.data.ai ? now : null;
    // Photos need the base AI consent: withdrawing it withdraws the photo consent too.
    if (parsed.data.ai === false) patch.ai_vision_consent_at = null;
    if (parsed.data.vision !== undefined) patch.ai_vision_consent_at = parsed.data.vision ? now : null;
    if (parsed.data.tryon !== undefined) patch.tryon_consent_at = parsed.data.tryon ? now : null;
    if (Object.keys(patch).length === 0) return ok();
    const { error } = await supabase.from("profiles").update(patch).eq("id", user.id);
    if (error) return fail("Impossibile salvare il consenso");
    revalidatePath("/settings");
    revalidatePath("/profile");
    return ok();
  });
}

/**
 * Permanently deletes the account: every storage object under "<uid>/" and the
 * auth user (all tables cascade). Requires the service role key server-side.
 */
export async function deleteAccountAction(confirmation: string): Promise<ActionResult> {
  return guard(async () => {
    const { user, supabase } = await getUserOrThrow();
    if (confirmation !== "ELIMINA") return fail("Scrivi ELIMINA per confermare");
    if (!isAdminConfigured()) {
      return fail("L'eliminazione account non è configurata sul server (SUPABASE_SERVICE_ROLE_KEY).");
    }
    const admin = createAdminClient();
    for (const bucket of Object.values(BUCKETS)) {
      await removeFolder(admin, bucket, user.id);
    }
    const { error } = await admin.auth.admin.deleteUser(user.id);
    if (error) return fail("Impossibile eliminare l'account");
    await supabase.auth.signOut();
    log.info("account_deleted", { userId: user.id });
    return ok();
  });
}

async function removeFolder(admin: ReturnType<typeof createAdminClient>, bucket: string, prefix: string) {
  const { data } = await admin.storage.from(bucket).list(prefix, { limit: 1000 });
  for (const entry of data ?? []) {
    const full = `${prefix}/${entry.name}`;
    if (entry.id === null) await removeFolder(admin, bucket, full); // sub-folder
    else await admin.storage.from(bucket).remove([full]);
  }
}
