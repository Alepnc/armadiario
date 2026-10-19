"use server";

import { revalidatePath } from "next/cache";
import { BUCKETS } from "@/lib/config";
import { AuthError, getUserOrThrow } from "@/lib/security/auth";
import { removePaths } from "@/lib/storage";
import { fail, ok, type ActionResult } from "@/lib/utils/action";

/** Deletes every generated try-on image (files + records) of the current user. */
export async function deleteAllGeneratedImagesAction(): Promise<ActionResult<{ count: number }>> {
  try {
    const { user, supabase } = await getUserOrThrow();
    const { data } = await supabase.from("generated_images").select("id,image_path").eq("user_id", user.id);
    const rows = data ?? [];
    await removePaths(supabase, BUCKETS.generated, rows.map((r) => r.image_path as string | null));
    const { error } = await supabase.from("generated_images").delete().eq("user_id", user.id);
    if (error) return fail("Impossibile eliminare le immagini");
    revalidatePath("/settings");
    return ok({ count: rows.length });
  } catch (e) {
    if (e instanceof AuthError) return fail("Sessione scaduta: accedi di nuovo.");
    return fail("Operazione non riuscita. Riprova.");
  }
}
