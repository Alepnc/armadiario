import "server-only";
import type { BucketName } from "@/lib/config";
import { SIGNED_URL_TTL_SECONDS } from "@/lib/config";
import type { ServerSupabase } from "@/lib/supabase/server";

/**
 * Creates short-lived signed URLs for private objects, in one round trip.
 * Returns a map path → url; paths that fail to sign are simply absent.
 */
export async function signPaths(
  supabase: ServerSupabase,
  bucket: BucketName,
  paths: Array<string | null | undefined>,
  ttl: number = SIGNED_URL_TTL_SECONDS,
): Promise<Map<string, string>> {
  const unique = [...new Set(paths.filter((p): p is string => Boolean(p)))];
  const out = new Map<string, string>();
  if (unique.length === 0) return out;
  const { data } = await supabase.storage.from(bucket).createSignedUrls(unique, ttl);
  for (const entry of data ?? []) {
    if (entry.path && entry.signedUrl) out.set(entry.path, entry.signedUrl);
  }
  return out;
}

export async function removePaths(
  supabase: ServerSupabase,
  bucket: BucketName,
  paths: Array<string | null | undefined>,
) {
  const list = paths.filter((p): p is string => Boolean(p));
  if (list.length === 0) return;
  await supabase.storage.from(bucket).remove(list);
}
