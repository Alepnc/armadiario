import "server-only";
import sharp from "sharp";
import { UPLOAD_LIMITS } from "@/lib/config";
import { detectImageMime } from "./detect";

export class ImageError extends Error {
  constructor(
    public code: "too_large" | "bad_type" | "corrupt" | "too_many_pixels",
    message: string,
  ) {
    super(message);
    this.name = "ImageError";
  }
}

export interface ProcessedImage {
  main: Buffer;
  thumb: Buffer;
  width: number;
  height: number;
  /** 64-bit difference hash (16 hex chars) for near-duplicate detection. */
  hash: string;
}

/**
 * Validates the file *content*, normalises orientation, strips metadata (EXIF,
 * GPS) and re-encodes to WebP at bounded sizes. Re-encoding also neutralises
 * polyglot/malformed files.
 */
export async function processImage(input: Buffer): Promise<ProcessedImage> {
  if (input.byteLength > UPLOAD_LIMITS.maxBytes) {
    throw new ImageError("too_large", "L'immagine supera la dimensione massima consentita (12 MB).");
  }
  if (!detectImageMime(input)) {
    throw new ImageError("bad_type", "Formato non supportato. Usa JPEG, PNG o WebP.");
  }
  try {
    const base = sharp(input, { limitInputPixels: UPLOAD_LIMITS.maxPixels, failOn: "error" }).rotate();

    const { data: main, info } = await base
      .clone()
      .resize(UPLOAD_LIMITS.mainEdge, UPLOAD_LIMITS.mainEdge, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer({ resolveWithObject: true });

    const thumb = await sharp(main)
      .resize(UPLOAD_LIMITS.thumbEdge, UPLOAD_LIMITS.thumbEdge, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 75 })
      .toBuffer();

    const hash = await differenceHash(main);
    return { main, thumb, width: info.width, height: info.height, hash };
  } catch (err) {
    if (err instanceof ImageError) throw err;
    const msg = err instanceof Error ? err.message : "";
    if (/pixel limit/i.test(msg)) {
      throw new ImageError("too_many_pixels", "L'immagine ha una risoluzione troppo alta.");
    }
    throw new ImageError("corrupt", "Impossibile leggere l'immagine: il file potrebbe essere danneggiato.");
  }
}

async function differenceHash(image: Buffer): Promise<string> {
  const { data } = await sharp(image)
    .greyscale()
    .resize(9, 8, { fit: "fill" })
    .raw()
    .toBuffer({ resolveWithObject: true });
  let bits = "";
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      bits += data[y * 9 + x] < data[y * 9 + x + 1] ? "1" : "0";
    }
  }
  let hex = "";
  for (let i = 0; i < 64; i += 4) hex += Number.parseInt(bits.slice(i, i + 4), 2).toString(16);
  return hex;
}
