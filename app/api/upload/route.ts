import { NextResponse } from "next/server";
import { z } from "zod";
import { BUCKETS } from "@/lib/config";
import { AuthError, getUserOrThrow } from "@/lib/security/auth";
import { ImageError, processImage } from "@/lib/images/process";
import { hammingDistance } from "@/lib/images/detect";
import { log } from "@/lib/utils/logger";

export const runtime = "nodejs";

const kindSchema = z.enum(["item", "avatar", "tryon-photo"]);

/**
 * POST multipart/form-data { file, kind }
 * Validates the content, re-encodes it and stores it under the caller's own
 * folder using their session (so storage RLS applies as well).
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

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Richiesta non valida" }, { status: 400 });
  }
  const kind = kindSchema.safeParse(form.get("kind"));
  const file = form.get("file");
  if (!kind.success || !(file instanceof File)) {
    return NextResponse.json({ error: "Richiesta non valida" }, { status: 400 });
  }

  try {
    const processed = await processImage(Buffer.from(await file.arrayBuffer()));
    const id = crypto.randomUUID();
    const bucket = kind.data === "item" ? BUCKETS.wardrobe : BUCKETS.personal;
    const folder = kind.data === "item" ? "items" : kind.data;
    const path = `${user.id}/${folder}/${id}.webp`;
    const thumbPath = `${user.id}/${folder}/${id}.thumb.webp`;

    const up = await supabase.storage.from(bucket).upload(path, processed.main, {
      contentType: "image/webp",
      upsert: false,
      cacheControl: "3600",
    });
    if (up.error) throw up.error;

    let storedThumb: string | null = null;
    if (kind.data === "item") {
      const t = await supabase.storage.from(bucket).upload(thumbPath, processed.thumb, {
        contentType: "image/webp",
        upsert: false,
        cacheControl: "3600",
      });
      if (!t.error) storedThumb = thumbPath;
    }

    let duplicates: Array<{ id: string; name: string }> = [];
    if (kind.data === "item") {
      const { data } = await supabase
        .from("clothing_items")
        .select("id,name,image_hash")
        .not("image_hash", "is", null)
        .limit(2000);
      duplicates = (data ?? [])
        .filter((r) => r.image_hash && hammingDistance(r.image_hash, processed.hash) <= 4)
        .slice(0, 3)
        .map((r) => ({ id: r.id as string, name: r.name as string }));
    }

    return NextResponse.json({
      path,
      thumbPath: storedThumb,
      hash: processed.hash,
      bucket,
      duplicates,
    });
  } catch (e) {
    if (e instanceof ImageError) {
      return NextResponse.json({ error: e.message, code: e.code }, { status: e.code === "too_large" ? 413 : 422 });
    }
    log.error("upload_failed", { userId: user.id }, e);
    return NextResponse.json({ error: "Caricamento non riuscito. Riprova." }, { status: 500 });
  }
}
