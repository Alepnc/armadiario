import "server-only";
import { createHash } from "node:crypto";
import { BUCKETS, TRYON_URL_TTL_SECONDS, SIGNED_URL_TTL_SECONDS } from "@/lib/config";
import { AiError } from "@/lib/ai/types";
import { getTryOnProvider } from "@/lib/ai/tryon/registry";
import type { TryOnCategory, TryOnProvider } from "@/lib/ai/tryon/types";
import { processImage } from "@/lib/images/process";
import { publicEnv } from "@/lib/env";
import { assertWithinQuota, recordUsage } from "@/lib/security/rate-limit";
import type { ServerSupabase } from "@/lib/supabase/server";
import { getOutfit } from "@/features/outfits/queries";
import type { GeneratedImageRow } from "@/types/db";
import { log } from "@/lib/utils/logger";
import { colorLabel } from "@/lib/constants/wardrobe";

export type TryOnErrorCode =
  | "not_configured"
  | "consent_required"
  | "no_photo"
  | "outfit_not_found"
  | "garment_deleted"
  | "nothing_renderable"
  | "rate_limited"
  | "provider_error"
  | "timeout";

export class TryOnError extends Error {
  constructor(
    public code: TryOnErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "TryOnError";
  }
}

const STALE_LOCK_MS = 60_000;
const JOB_TIMEOUT_MS = 10 * 60_000;
const MAX_OUTPUT_BYTES = 15 * 1024 * 1024;

interface Step {
  itemId: string;
  category: TryOnCategory;
  description: string;
  imagePath: string;
}
interface JobState {
  steps: Step[];
  index: number;
  jobId: string | null;
  /** Result of the previous step, used as the person image for the next one. */
  intermediateUrl: string | null;
  skipped: string[];
  lock: number | null;
}

const CATEGORY_BY_SLOT: Record<string, TryOnCategory | undefined> = {
  dress: "dresses",
  top: "upper_body",
  outer: "upper_body",
  bottom: "lower_body",
};

export function messageFor(code: TryOnErrorCode | string | null): string {
  switch (code) {
    case "not_configured":
      return "La prova virtuale non è configurata su questo server. Puoi comunque vedere l'outfit con le foto originali dei capi.";
    case "consent_required":
      return "Per la prova virtuale serve il tuo consenso all'invio delle foto al servizio esterno (Impostazioni → Privacy).";
    case "no_photo":
      return "Carica prima una tua fotografia nel profilo.";
    case "garment_deleted":
      return "Alcuni capi di questo outfit sono stati eliminati: sostituiscili prima di provare l'outfit.";
    case "nothing_renderable":
      return "Questo outfit non contiene capi che il servizio sappia applicare (servono parte superiore, inferiore o abito).";
    case "rate_limited":
      return "Hai raggiunto il limite giornaliero di prove virtuali.";
    case "timeout":
      return "Il servizio ha impiegato troppo tempo. Riprova più tardi.";
    default:
      return "Il servizio di prova virtuale non è riuscito a generare l'immagine. Riprova.";
  }
}

/** Picks the garments the provider can render: at most one per body region. */
export function planSteps(
  items: Array<{ id: string | null; name: string; slot: string | null; color: string | null; imagePath: string | null }>,
  supported: readonly TryOnCategory[],
): { steps: Step[]; skipped: string[] } {
  const byCategory = new Map<TryOnCategory, (typeof items)[number]>();
  const skipped: string[] = [];
  const hasDress = items.some((i) => i.slot === "dress");
  for (const it of items) {
    const cat = it.slot ? CATEGORY_BY_SLOT[it.slot] : undefined;
    if (!cat || !supported.includes(cat) || !it.id || !it.imagePath) {
      skipped.push(it.name);
      continue;
    }
    if (hasDress && cat !== "dresses") {
      skipped.push(it.name);
      continue;
    }
    const prev = byCategory.get(cat);
    // Outer layers hide the garment below: show the outermost one.
    if (prev && !(it.slot === "outer" && prev.slot !== "outer")) {
      skipped.push(it.name);
      continue;
    }
    if (prev) skipped.push(prev.name);
    byCategory.set(cat, it);
  }
  const order: TryOnCategory[] = ["lower_body", "upper_body", "dresses"];
  const steps = order.flatMap((cat) => {
    const it = byCategory.get(cat);
    if (!it?.id || !it.imagePath) return [];
    return [
      {
        itemId: it.id,
        category: cat,
        description: `${it.name}${it.color ? ` ${colorLabel(it.color).toLowerCase()}` : ""}`,
        imagePath: it.imagePath,
      },
    ];
  });
  return { steps, skipped };
}

function isLocalSupabase(): boolean {
  try {
    const host = new URL(publicEnv.supabaseUrl).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "::1" || host.endsWith(".local");
  } catch {
    return false;
  }
}

/**
 * Gives the provider access to a private image: a short-lived signed URL, or
 * (when Supabase is local and unreachable from the internet) a data URI.
 */
async function imageForProvider(supabase: ServerSupabase, bucket: string, path: string): Promise<string> {
  if (isLocalSupabase()) {
    const dl = await supabase.storage.from(bucket).download(path);
    if (dl.error || !dl.data) throw new TryOnError("provider_error", "Immagine non disponibile");
    const buf = Buffer.from(await dl.data.arrayBuffer());
    return `data:image/webp;base64,${buf.toString("base64")}`;
  }
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, TRYON_URL_TTL_SECONDS);
  if (error || !data) throw new TryOnError("provider_error", "Immagine non disponibile");
  return data.signedUrl;
}

export async function startTryOn(
  supabase: ServerSupabase,
  userId: string,
  outfitId: string,
): Promise<{ id: string; reused: boolean }> {
  const provider = getTryOnProvider();
  if (!provider) throw new TryOnError("not_configured", messageFor("not_configured"));

  const { data: profile } = await supabase
    .from("profiles")
    .select("tryon_photo_path,tryon_consent_at")
    .eq("id", userId)
    .maybeSingle();
  if (!profile?.tryon_consent_at) throw new TryOnError("consent_required", messageFor("consent_required"));
  if (!profile.tryon_photo_path) throw new TryOnError("no_photo", messageFor("no_photo"));

  const outfit = await getOutfit(supabase, outfitId);
  if (!outfit) throw new TryOnError("outfit_not_found", "Outfit non trovato");
  if (outfit.items.some((i) => i.status === "deleted")) throw new TryOnError("garment_deleted", messageFor("garment_deleted"));

  const ids = outfit.items.map((i) => i.id).filter((x): x is string => Boolean(x));
  const { data: rows } = await supabase.from("clothing_items").select("id,image_path").in("id", ids);
  const pathById = new Map((rows ?? []).map((r) => [r.id as string, r.image_path as string]));

  const { steps, skipped } = planSteps(
    outfit.items.map((i) => ({
      id: i.id,
      name: i.name,
      slot: i.slot,
      color: i.color,
      imagePath: i.id ? (pathById.get(i.id) ?? null) : null,
    })),
    provider.supportedCategories,
  );
  if (steps.length === 0) throw new TryOnError("nothing_renderable", messageFor("nothing_renderable"));

  const inputHash = createHash("sha256")
    .update([provider.name, profile.tryon_photo_path, ...steps.map((s) => `${s.category}:${s.imagePath}`)].join("|"))
    .digest("hex");

  // Duplicate protection: reuse an identical in-flight request.
  const { data: inflight } = await supabase
    .from("generated_images")
    .select("id")
    .eq("input_hash", inputHash)
    .in("generation_status", ["pending", "processing"])
    .maybeSingle();
  if (inflight) return { id: inflight.id as string, reused: true };

  try {
    await assertWithinQuota(supabase, userId, "try_on");
  } catch {
    throw new TryOnError("rate_limited", messageFor("rate_limited"));
  }

  const state: JobState = { steps, index: 0, jobId: null, intermediateUrl: null, skipped, lock: Date.now() };
  const { data: row, error } = await supabase
    .from("generated_images")
    .insert({
      user_id: userId,
      outfit_id: outfitId,
      source_photo_path: profile.tryon_photo_path,
      provider: provider.name,
      generation_status: "pending",
      job_state: state,
      input_hash: inputHash,
    })
    .select("id")
    .single();
  if (error || !row) {
    if (error?.code === "23505") {
      const { data: again } = await supabase
        .from("generated_images")
        .select("id")
        .eq("input_hash", inputHash)
        .in("generation_status", ["pending", "processing"])
        .maybeSingle();
      if (again) return { id: again.id as string, reused: true };
    }
    throw new TryOnError("provider_error", "Impossibile avviare la prova virtuale");
  }

  await submitStep(supabase, provider, row.id as string, profile.tryon_photo_path, state);
  return { id: row.id as string, reused: false };
}

async function submitStep(
  supabase: ServerSupabase,
  provider: TryOnProvider,
  rowId: string,
  photoPath: string,
  state: JobState,
) {
  const step = state.steps[state.index];
  try {
    const personImageUrl = state.intermediateUrl ?? (await imageForProvider(supabase, BUCKETS.personal, photoPath));
    const garmentUrl = await imageForProvider(supabase, BUCKETS.wardrobe, step.imagePath);
    const { jobId } = await provider.submit({
      personImageUrl,
      garment: { imageUrl: garmentUrl, category: step.category, description: step.description },
    });
    await supabase
      .from("generated_images")
      .update({ generation_status: "processing", job_state: { ...state, jobId, lock: null } })
      .eq("id", rowId);
  } catch (e) {
    const code = e instanceof AiError ? e.code : e instanceof TryOnError ? e.code : "provider_error";
    log.warn("tryon_submit_failed", { code });
    await supabase
      .from("generated_images")
      .update({ generation_status: "failed", error_code: code, job_state: { ...state, lock: null } })
      .eq("id", rowId);
  }
}

/** Polls the provider and moves the job forward (idempotent, safe to call repeatedly). */
export async function advanceTryOn(supabase: ServerSupabase, userId: string, id: string): Promise<GeneratedImageRow | null> {
  const { data } = await supabase.from("generated_images").select("*").eq("id", id).maybeSingle();
  let row = data as GeneratedImageRow | null;
  if (!row) return null;
  if (row.generation_status === "completed" || row.generation_status === "failed") return row;

  const provider = getTryOnProvider();
  const fail = async (code: string) => {
    await recordUsage(supabase, userId, {
      operation: "try_on",
      provider: row!.provider,
      success: false,
      durationMs: Date.now() - new Date(row!.created_at).getTime(),
    });
    const { data: upd } = await supabase
      .from("generated_images")
      .update({ generation_status: "failed", error_code: code })
      .eq("id", id)
      .select("*")
      .single();
    return upd as GeneratedImageRow;
  };

  if (Date.now() - new Date(row.created_at).getTime() > JOB_TIMEOUT_MS) return fail("timeout");
  if (!provider || provider.name !== row.provider) return fail("not_configured");

  const state = row.job_state as unknown as JobState;
  if (!state.jobId) return row; // still being submitted
  if (state.lock && Date.now() - state.lock < STALE_LOCK_MS) return row;

  // Compare-and-set lock so concurrent polls don't double-advance.
  const { data: locked } = await supabase
    .from("generated_images")
    .update({ job_state: { ...state, lock: Date.now() } })
    .eq("id", id)
    .eq("updated_at", row.updated_at)
    .select("*");
  if (!locked?.length) return row;
  row = locked[0] as GeneratedImageRow;

  try {
    const status = await provider.poll(state.jobId);
    if (status.status === "processing") {
      await supabase.from("generated_images").update({ job_state: { ...state, lock: null } }).eq("id", id);
      return { ...row, job_state: { ...state, lock: null } };
    }
    if (status.status === "failed") return fail("provider_error");

    const isLast = state.index >= state.steps.length - 1;
    if (!isLast) {
      const next: JobState = { ...state, index: state.index + 1, jobId: null, intermediateUrl: status.outputUrl, lock: Date.now() };
      await supabase.from("generated_images").update({ job_state: next }).eq("id", id);
      await submitStep(supabase, provider, id, row.source_photo_path, next);
      const { data: fresh } = await supabase.from("generated_images").select("*").eq("id", id).single();
      return fresh as GeneratedImageRow;
    }

    // Final step: store the result privately (provider URLs expire).
    const image = await downloadOutput(status.outputUrl);
    const processed = await processImage(image);
    const path = `${userId}/tryon/${id}.webp`;
    const up = await supabase.storage.from(BUCKETS.generated).upload(path, processed.main, {
      contentType: "image/webp",
      upsert: true,
    });
    if (up.error) throw new TryOnError("provider_error", "Salvataggio del risultato non riuscito");
    const duration = Date.now() - new Date(row.created_at).getTime();
    const { data: done } = await supabase
      .from("generated_images")
      .update({
        generation_status: "completed",
        image_path: path,
        duration_ms: duration,
        completed_at: new Date().toISOString(),
        job_state: { ...state, intermediateUrl: null, lock: null },
      })
      .eq("id", id)
      .select("*")
      .single();
    await recordUsage(supabase, userId, { operation: "try_on", provider: row.provider, success: true, durationMs: duration });
    return done as GeneratedImageRow;
  } catch (e) {
    log.warn("tryon_advance_failed", { code: e instanceof AiError ? e.code : "unknown" }, e);
    return fail(e instanceof AiError || e instanceof TryOnError ? e.code : "provider_error");
  }
}

async function downloadOutput(url: string): Promise<Buffer> {
  const u = new URL(url);
  // The URL comes from the provider's response: accept only public https hosts (no SSRF to internal addresses).
  const host = u.hostname;
  const internal = /^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?$|0\.0\.0\.0)/i.test(host) || !host.includes(".");
  if (u.protocol !== "https:" || internal) throw new TryOnError("provider_error", "URL risultato non valido");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const res = await fetch(u, { signal: controller.signal });
    if (!res.ok) throw new TryOnError("provider_error", "Download del risultato non riuscito");
    const len = Number(res.headers.get("content-length") ?? 0);
    if (len > MAX_OUTPUT_BYTES) throw new TryOnError("provider_error", "Risultato troppo grande");
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength > MAX_OUTPUT_BYTES) throw new TryOnError("provider_error", "Risultato troppo grande");
    return buf;
  } finally {
    clearTimeout(timer);
  }
}

export function publicJobView(row: GeneratedImageRow) {
  const state = row.job_state as unknown as Partial<JobState>;
  return {
    id: row.id,
    outfitId: row.outfit_id,
    status: row.generation_status,
    errorCode: row.error_code,
    errorMessage: row.generation_status === "failed" ? messageFor(row.error_code) : null,
    step: (state.index ?? 0) + 1,
    totalSteps: state.steps?.length ?? 1,
    skipped: state.skipped ?? [],
    isSaved: row.is_saved,
    createdAt: row.created_at,
  };
}

export { SIGNED_URL_TTL_SECONDS };
