import { NextResponse } from "next/server";
import { z } from "zod";
import { AuthError, getUserOrThrow } from "@/lib/security/auth";
import { messageFor, startTryOn, TryOnError } from "@/features/virtual-try-on/service";
import { log } from "@/lib/utils/logger";

export const runtime = "nodejs";
export const maxDuration = 60;

const STATUS_BY_CODE: Record<string, number> = {
  not_configured: 501,
  consent_required: 403,
  no_photo: 400,
  outfit_not_found: 404,
  garment_deleted: 409,
  nothing_renderable: 422,
  rate_limited: 429,
};

/** POST { outfitId } → starts an asynchronous virtual try-on job. */
export async function POST(request: Request) {
  let ctx;
  try {
    ctx = await getUserOrThrow();
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
    return NextResponse.json({ error: "Servizio non configurato" }, { status: 503 });
  }
  const body = z.object({ outfitId: z.string().uuid() }).safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Richiesta non valida" }, { status: 400 });
  try {
    const { id, reused } = await startTryOn(ctx.supabase, ctx.user.id, body.data.outfitId);
    return NextResponse.json({ id, reused }, { status: 202 });
  } catch (e) {
    if (e instanceof TryOnError) {
      return NextResponse.json({ error: messageFor(e.code), code: e.code }, { status: STATUS_BY_CODE[e.code] ?? 502 });
    }
    log.error("tryon_start_failed", { userId: ctx.user.id }, e);
    return NextResponse.json({ error: "Operazione non riuscita. Riprova." }, { status: 500 });
  }
}
