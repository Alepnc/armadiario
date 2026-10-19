/** Product name: provisional, change it here (or via NEXT_PUBLIC_APP_NAME). */
export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME ?? "Wardrobe AI";
export const APP_TAGLINE = "Il tuo armadio, con un occhio di stile.";

/** Buckets are created by supabase/migrations/*_rls_and_storage.sql */
export const BUCKETS = {
  wardrobe: "wardrobe",
  personal: "personal",
  generated: "generated",
} as const;
export type BucketName = (typeof BUCKETS)[keyof typeof BUCKETS];

export const SIGNED_URL_TTL_SECONDS = 60 * 60;
export const TRYON_URL_TTL_SECONDS = 60 * 10;

export const UPLOAD_LIMITS = {
  /** Raw upload accepted by the API before server-side re-encoding. */
  maxBytes: 12 * 1024 * 1024,
  maxPixels: 40_000_000,
  mainEdge: 1400,
  thumbEdge: 420,
} as const;

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  const n = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Per-user quotas for costly AI operations (rolling window). */
export function aiLimits() {
  return {
    analyze_item: { max: intEnv("AI_LIMIT_ANALYZE_PER_HOUR", 60), windowMinutes: 60 },
    compose_outfit: { max: intEnv("AI_LIMIT_OUTFIT_PER_HOUR", 30), windowMinutes: 60 },
    try_on: { max: intEnv("AI_LIMIT_TRYON_PER_DAY", 10), windowMinutes: 60 * 24 },
  } as const;
}
