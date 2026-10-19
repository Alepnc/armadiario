import { NextResponse } from "next/server";
import { z } from "zod";
import { BUCKETS } from "@/lib/config";
import { AuthError, getUserOrThrow } from "@/lib/security/auth";
import { advanceTryOn, publicJobView } from "@/features/virtual-try-on/service";
import { signPaths } from "@/lib/storage";
import { log } from "@/lib/utils/logger";

export const runtime = "nodejs";
export const maxDuration = 60;

const idSchema = z.string().uuid();

/** GET → current status; each call also nudges the job forward (polling). */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!idSchema.safeParse(id).success) return NextResponse.json({ error: "Richiesta non valida" }, { status: 400 });
  let auth;
  try {
    auth = await getUserOrThrow();
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
    return NextResponse.json({ error: "Servizio non configurato" }, { status: 503 });
  }
  try {
    const row = await advanceTryOn(auth.supabase, auth.user.id, id);
    if (!row) return NextResponse.json({ error: "Non trovato" }, { status: 404 });
    const view = publicJobView(row);
    let imageUrl: string | null = null;
    if (row.generation_status === "completed" && row.image_path) {
      imageUrl = (await signPaths(auth.supabase, BUCKETS.generated, [row.image_path])).get(row.image_path) ?? null;
    }
    return NextResponse.json({ ...view, imageUrl });
  } catch (e) {
    log.error("tryon_status_failed", { userId: auth.user.id }, e);
    return NextResponse.json({ error: "Operazione non riuscita. Riprova." }, { status: 500 });
  }
}

/** DELETE → removes the generated image and its record. */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!idSchema.safeParse(id).success) return NextResponse.json({ error: "Richiesta non valida" }, { status: 400 });
  try {
    const { supabase } = await getUserOrThrow();
    const { data: row } = await supabase.from("generated_images").select("image_path").eq("id", id).maybeSingle();
    if (!row) return NextResponse.json({ error: "Non trovato" }, { status: 404 });
    if (row.image_path) await supabase.storage.from(BUCKETS.generated).remove([row.image_path as string]);
    const { error } = await supabase.from("generated_images").delete().eq("id", id);
    if (error) return NextResponse.json({ error: "Eliminazione non riuscita" }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
    return NextResponse.json({ error: "Operazione non riuscita. Riprova." }, { status: 500 });
  }
}

/** PATCH { saved } → keep/remove the result in the user's gallery. */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = z.object({ saved: z.boolean() }).safeParse(await req.json().catch(() => null));
  if (!idSchema.safeParse(id).success || !body.success) return NextResponse.json({ error: "Richiesta non valida" }, { status: 400 });
  try {
    const { supabase } = await getUserOrThrow();
    const { data, error } = await supabase.from("generated_images").update({ is_saved: body.data.saved }).eq("id", id).select("id");
    if (error || !data?.length) return NextResponse.json({ error: "Non trovato" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
    return NextResponse.json({ error: "Operazione non riuscita. Riprova." }, { status: 500 });
  }
}
