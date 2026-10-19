export interface UploadedImage {
  path: string;
  thumbPath: string | null;
  hash: string;
  duplicates: Array<{ id: string; name: string }>;
}

/** Downscales large photos in the browser before upload (saves bandwidth on mobile). */
export async function compressImage(file: File, maxEdge = 1600, quality = 0.86): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/gif") return file;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size < 1.5 * 1024 * 1024) {
      bitmap.close();
      return file;
    }
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", quality));
    if (!blob) return file;
    return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file; // e.g. unsupported format: let the server decide
  }
}

export class ApiError extends Error {
  constructor(
    message: string,
    public code?: string,
    public status?: number,
  ) {
    super(message);
  }
}

export async function uploadImage(file: File, kind: "item" | "avatar" | "tryon-photo"): Promise<UploadedImage> {
  const form = new FormData();
  form.set("file", file);
  form.set("kind", kind);
  let res: Response;
  try {
    res = await fetch("/api/upload", { method: "POST", body: form });
  } catch {
    throw new ApiError("Connessione assente. Controlla la rete e riprova.");
  }
  const json = (await res.json().catch(() => ({}))) as Partial<UploadedImage> & { error?: string; code?: string };
  if (!res.ok || !json.path) throw new ApiError(json.error ?? "Caricamento non riuscito", json.code, res.status);
  return {
    path: json.path,
    thumbPath: json.thumbPath ?? null,
    hash: json.hash ?? "",
    duplicates: json.duplicates ?? [],
  };
}

export interface Suggestion {
  name: string;
  category_id: string | null;
  subcategory: string | null;
  primary_color: string | null;
  secondary_colors: string[];
  seasons: string[];
  styles: string[];
  material: string | null;
  pattern: string;
  formality: number;
  fit: string | null;
}

export async function analyzeImage(path: string, hash: string): Promise<{ suggestion: Suggestion; raw?: unknown }> {
  let res: Response;
  try {
    res = await fetch("/api/ai/analyze", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path, hash: hash || undefined }),
    });
  } catch {
    throw new ApiError("Connessione assente durante l'analisi.");
  }
  const json = (await res.json().catch(() => ({}))) as { suggestion?: Suggestion; raw?: unknown; error?: string; code?: string };
  if (!res.ok || !json.suggestion) throw new ApiError(json.error ?? "Analisi non riuscita", json.code, res.status);
  return { suggestion: json.suggestion, raw: json.raw };
}
