import "server-only";
import { AiError, type GarmentAnalyzer, type OutfitLanguageModel, type ProviderUsage, type StructuredRequest } from "./types";
import { garmentAnalysisSchema } from "@/lib/validation/wardrobe";
import { garmentSystemPrompt } from "./prompts";
import { toJsonSchema } from "./anthropic";
import { log } from "@/lib/utils/logger";

const BASE = "https://generativelanguage.googleapis.com/v1beta/models";

export function geminiConfig() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  return {
    apiKey,
    // gemini-3.8-flash: free tier, multimodal, JSON-schema output. (2.5-flash is closed to new users.)
    stylistModel: process.env.GEMINI_STYLIST_MODEL || "gemini-3.8-flash",
    analysisModel: process.env.GEMINI_ANALYSIS_MODEL || "gemini-3.8-flash",
    // Used when the main model keeps answering 429/5xx (the free tier is often overloaded).
    fallbackModel: process.env.GEMINI_FALLBACK_MODEL || "gemini-3.5-flash-lite",
  };
}

interface GenerateResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }>;
  promptFeedback?: { blockReason?: string };
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
}

interface GeminiCall {
  apiKey: string;
  model: string;
  fallbackModel?: string;
  system: string;
  parts: Array<Record<string, unknown>>;
  jsonSchema: Record<string, unknown>;
  maxTokens: number;
  /** Overall time budget for the primary model (the fallback gets ~70% of it). */
  budgetMs: number;
}

/** One generateContent call with JSON-schema constrained output, controlled retries and a fallback model. */
async function callGemini(opts: GeminiCall): Promise<{ json: unknown; usage: ProviderUsage }> {
  const models = [opts.model, ...(opts.fallbackModel && opts.fallbackModel !== opts.model ? [opts.fallbackModel] : [])];
  let lastError: AiError | null = null;
  for (const [i, model] of models.entries()) {
    const budget = i === 0 ? opts.budgetMs : Math.round(opts.budgetMs * 0.7);
    try {
      return await callGeminiModel(opts, model, budget);
    } catch (e) {
      // Only overload/network-type failures justify switching model; bad output or auth errors do not.
      if (e instanceof AiError && (e.code === "rate_limited" || e.code === "timeout" || e.code === "provider_error" && /HTTP 5\d\d|HTTP 429|rete/.test(e.message))) {
        lastError = e;
        continue;
      }
      throw e;
    }
  }
  throw lastError ?? new AiError("provider_error", "Errore sconosciuto del provider AI");
}

async function callGeminiModel(opts: GeminiCall, model: string, budgetMs: number): Promise<{ json: unknown; usage: ProviderUsage }> {
  const started = Date.now();
  const deadline = started + budgetMs;
  let useThinkingConfig = true;
  let lastError: AiError | null = null;
  const generationConfig: Record<string, unknown> = {
    responseMimeType: "application/json",
    responseJsonSchema: opts.jsonSchema,
    temperature: 0.7,
  };
  if (/^gemini-2\.5-flash/.test(model)) {
    // 2.5-flash "thinks" by default and would eat the token budget: not needed for this task.
    generationConfig.maxOutputTokens = opts.maxTokens;
    generationConfig.thinkingConfig = { thinkingBudget: 0 };
  } else {
    // Newer models reason internally: keep it minimal (this task is a simple selection) and leave room for the JSON.
    generationConfig.maxOutputTokens = Math.max(opts.maxTokens, 4096);
  }

  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 1500 * attempt));
    const remaining = deadline - Date.now();
    if (remaining < 2000) {
      lastError = new AiError("timeout", `Gemini (${model}): tempo massimo esaurito`);
      break;
    }
    const gc = { ...generationConfig };
    if (useThinkingConfig && !/^gemini-2\.5-flash/.test(model)) gc.thinkingConfig = { thinkingLevel: "minimal" };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), remaining);
    try {
      const res = await fetch(`${BASE}/${encodeURIComponent(model)}:generateContent`, {
        method: "POST",
        signal: controller.signal,
        headers: { "content-type": "application/json", "x-goog-api-key": opts.apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: opts.system }] },
          contents: [{ role: "user", parts: opts.parts }],
          generationConfig: gc,
        }),
      });
      if (!res.ok) {
        // Google's error text never contains our key; it is the quickest way to debug a 400/403/404/503.
        const detail = ((await res.json().catch(() => ({}))) as { error?: { message?: string } }).error?.message ?? "";
        const err = new AiError(
          res.status === 429 ? "rate_limited" : "provider_error",
          `Gemini HTTP ${res.status} (${model}): ${detail.slice(0, 160)}`,
        );
        if (res.status === 400 && useThinkingConfig && /thinking/i.test(detail)) {
          useThinkingConfig = false; // this model does not accept the thinking hint: retry without it
          attempt--;
          continue;
        }
        if (res.status === 429 || res.status >= 500) {
          lastError = err; // transient: retry
          continue;
        }
        throw err;
      }
      const json = (await res.json()) as GenerateResponse;
      if (json.promptFeedback?.blockReason) throw new AiError("invalid_output", "Richiesta bloccata dai filtri del provider");
      const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
      if (!text) throw new AiError("invalid_output", `Risposta AI vuota (finishReason: ${json.candidates?.[0]?.finishReason ?? "n/d"})`);
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new AiError("invalid_output", "Risposta AI non è JSON valido");
      }
      log.info("gemini_call", { model, ms: Date.now() - started, attempts: attempt + 1, outTokens: json.usageMetadata?.candidatesTokenCount });
      return {
        json: parsed,
        usage: {
          provider: "gemini",
          model,
          durationMs: Date.now() - started,
          inputTokens: json.usageMetadata?.promptTokenCount,
          outputTokens: json.usageMetadata?.candidatesTokenCount,
        },
      };
    } catch (e) {
      if (e instanceof AiError) throw e;
      if (e instanceof Error && e.name === "AbortError") {
        // A slow model will not get faster by retrying: hand over to the fallback model.
        lastError = new AiError("timeout", `Gemini (${model}) non ha risposto entro ${Math.round(budgetMs / 1000)}s`);
        break;
      }
      lastError = new AiError("provider_error", "Errore di rete verso il provider AI");
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError ?? new AiError("provider_error", "Errore sconosciuto del provider AI");
}

export function createGeminiLanguageModel(): OutfitLanguageModel | null {
  const cfg = geminiConfig();
  if (!cfg) return null;
  return {
    name: "gemini",
    async complete<T>(req: StructuredRequest<T>) {
      const { json, usage } = await callGemini({
        apiKey: cfg.apiKey,
        model: cfg.stylistModel,
        fallbackModel: cfg.fallbackModel,
        system: req.system,
        parts: [{ text: req.user }],
        jsonSchema: req.jsonSchema,
        maxTokens: Math.max(req.maxTokens ?? 1500, 1500),
        budgetMs: 15_000,
      });
      let value: T;
      try {
        value = req.parse(json);
      } catch (e) {
        const why = e instanceof Error ? e.message.replace(/\s+/g, " ").slice(0, 220) : "";
        throw new AiError("invalid_output", `L'output del modello non rispetta il formato richiesto: ${why}`);
      }
      return { value, usage };
    },
  };
}

export function createGeminiAnalyzer(): GarmentAnalyzer | null {
  const cfg = geminiConfig();
  if (!cfg) return null;
  const schema = toJsonSchema(garmentAnalysisSchema);
  return {
    name: "gemini",
    async analyze({ image, mediaType, categorySlugs }) {
      const { json, usage } = await callGemini({
        apiKey: cfg.apiKey,
        model: cfg.analysisModel,
        fallbackModel: cfg.fallbackModel,
        system: garmentSystemPrompt(categorySlugs),
        parts: [
          { inline_data: { mime_type: mediaType, data: image.toString("base64") } },
          { text: "Analizza questo capo e proponi i metadati." },
        ],
        jsonSchema: schema,
        maxTokens: 800,
        budgetMs: 25_000,
      });
      const parsed = garmentAnalysisSchema.safeParse(json);
      if (!parsed.success) throw new AiError("invalid_output", "L'analisi AI non è nel formato atteso");
      return { analysis: parsed.data, usage };
    },
  };
}
