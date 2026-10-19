import { NextResponse } from "next/server";
import { z } from "zod";
import { BUCKETS } from "@/lib/config";
import { getGarmentAnalyzer } from "@/lib/ai/registry";
import { AiError } from "@/lib/ai/types";
import { AuthError, getUserOrThrow } from "@/lib/security/auth";
import { assertWithinQuota, RateLimitError, recordUsage } from "@/lib/security/rate-limit";
import { ownedPathSchema, type GarmentAnalysis } from "@/lib/validation/wardrobe";
import { listCategories } from "@/features/wardrobe/queries";
import { normalizeAnalysis } from "@/features/wardrobe/analysis";
import { detectImageMime } from "@/lib/images/detect";
import { log } from "@/lib/utils/logger";

export const runtime = "nodejs";
export const maxDuration = 60;

const bodySchema = z.object({
  path: z.string().max(300),
  hash: z.string().regex(/^[0-9a-f]{16}$/).optional(),
});

/**
 * POST { path, hash? } → suggested metadata for an already-uploaded garment
 * photo. Suggestions are never authoritative: the user reviews them in the form.
 */
export async function POST(request: Request) {
  let ctx;
  try {
    ctx = await getUserOrThrow();
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
    return NextResponse.json({ error: "Servizio non configurato" }, { status: 503 });
  }
  const { user, supabase } = ctx;

  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success || !ownedPathSchema(user.id).safeParse(body.data.path).success) {
    return NextResponse.json({ error: "Richiesta non valida" }, { status: 400 });
  }

  const analyzer = getGarmentAnalyzer();
  if (!analyzer) {
    return NextResponse.json(
      { error: "L'analisi AI non è configurata: compila i dati a mano.", code: "not_configured" },
      { status: 501 },
    );
  }

  const { data: profile } = await supabase.from("profiles").select("ai_consent_at").eq("id", user.id).maybeSingle();
  if (!profile?.ai_consent_at) {
    return NextResponse.json(
      { error: "Per l'analisi AI serve il tuo consenso (Impostazioni → Privacy).", code: "consent_required" },
      { status: 403 },
    );
  }

  const categories = await listCategories(supabase);

  // Avoid paying twice for the same image.
  if (body.data.hash) {
    const { data: cached } = await supabase
      .from("clothing_items")
      .select("ai_analysis")
      .eq("image_hash", body.data.hash)
      .not("ai_analysis", "is", null)
      .limit(1)
      .maybeSingle();
    const prev = cached?.ai_analysis as GarmentAnalysis | undefined;
    if (prev) return NextResponse.json({ suggestion: normalizeAnalysis(prev, categories), cached: true });
  }

  try {
    await assertWithinQuota(supabase, user.id, "analyze_item");
  } catch (e) {
    if (e instanceof RateLimitError) return NextResponse.json({ error: e.message, code: "rate_limited" }, { status: 429 });
    return NextResponse.json({ error: "Errore interno" }, { status: 500 });
  }

  const dl = await supabase.storage.from(BUCKETS.wardrobe).download(body.data.path);
  if (dl.error || !dl.data) return NextResponse.json({ error: "Immagine non trovata" }, { status: 404 });
  const bytes = Buffer.from(await dl.data.arrayBuffer());
  const mime = detectImageMime(bytes);
  if (!mime) return NextResponse.json({ error: "Immagine non valida" }, { status: 422 });

  const started = Date.now();
  try {
    const { analysis, usage } = await analyzer.analyze({
      image: bytes,
      mediaType: mime,
      categorySlugs: categories.map((c) => c.slug),
    });
    await recordUsage(supabase, user.id, {
      operation: "analyze_item",
      provider: usage.provider,
      model: usage.model,
      success: true,
      durationMs: usage.durationMs,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
    });
    return NextResponse.json({
      suggestion: normalizeAnalysis(analysis, categories),
      raw: analysis,
      cached: false,
    });
  } catch (e) {
    await recordUsage(supabase, user.id, {
      operation: "analyze_item",
      provider: analyzer.name,
      success: false,
      durationMs: Date.now() - started,
    });
    const code = e instanceof AiError ? e.code : "provider_error";
    log.warn("analyze_failed", { userId: user.id, code }, e);
    return NextResponse.json(
      { error: "Analisi AI non riuscita: puoi compilare i dati a mano.", code },
      { status: code === "rate_limited" ? 429 : 502 },
    );
  }
}
