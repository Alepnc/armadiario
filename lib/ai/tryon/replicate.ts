import "server-only";
import { AiError } from "../types";
import type { TryOnJobStatus, TryOnProvider } from "./types";

const BASE = "https://api.replicate.com/v1";

interface Prediction {
  id: string;
  status: "starting" | "processing" | "succeeded" | "failed" | "canceled";
  output?: string | string[] | null;
  error?: string | null;
}

async function replicate(path: string, token: string, init?: RequestInit): Promise<Prediction> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const res = await fetch(`${BASE}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        ...init?.headers,
      },
    });
    if (res.status === 429) throw new AiError("rate_limited", "Provider try-on: troppe richieste");
    if (!res.ok) throw new AiError("provider_error", `Provider try-on: stato ${res.status}`);
    return (await res.json()) as Prediction;
  } catch (e) {
    if (e instanceof AiError) throw e;
    if (e instanceof Error && e.name === "AbortError") throw new AiError("timeout", "Provider try-on non raggiungibile");
    throw new AiError("provider_error", "Errore di rete verso il provider try-on");
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Replicate-hosted IDM-VTON style model (inputs: human_img, garm_img,
 * garment_des, category). Requires REPLICATE_API_TOKEN and
 * REPLICATE_TRYON_VERSION (the model version hash). Input names can be
 * overridden if you pick a different compatible model.
 */
export function createReplicateTryOn(): TryOnProvider | null {
  const token = process.env.REPLICATE_API_TOKEN;
  const version = process.env.REPLICATE_TRYON_VERSION;
  if (!token || !version) return null;
  const humanKey = process.env.REPLICATE_TRYON_HUMAN_FIELD || "human_img";
  const garmentKey = process.env.REPLICATE_TRYON_GARMENT_FIELD || "garm_img";

  return {
    name: "replicate",
    supportedCategories: ["upper_body", "lower_body", "dresses"],
    async submit({ personImageUrl, garment }) {
      const p = await replicate("/predictions", token, {
        method: "POST",
        body: JSON.stringify({
          version,
          input: {
            [humanKey]: personImageUrl,
            [garmentKey]: garment.imageUrl,
            garment_des: garment.description.slice(0, 120),
            category: garment.category,
            crop: false,
            steps: 30,
          },
        }),
      });
      return { jobId: p.id };
    },
    async poll(jobId): Promise<TryOnJobStatus> {
      const p = await replicate(`/predictions/${encodeURIComponent(jobId)}`, token);
      if (p.status === "succeeded") {
        const out = Array.isArray(p.output) ? p.output[0] : p.output;
        if (!out) return { status: "failed", message: "Il provider non ha restituito un'immagine" };
        return { status: "succeeded", outputUrl: out };
      }
      if (p.status === "failed" || p.status === "canceled") {
        return { status: "failed", message: "Il provider non è riuscito a generare l'immagine" };
      }
      return { status: "processing" };
    },
  };
}
