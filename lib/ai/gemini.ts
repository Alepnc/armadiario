import "server-only";
import { AiError, type GarmentAnalyzer, type OutfitLanguageModel, type ProviderUsage, type StructuredRequest } from "./types";
import { garmentAnalysisSchema } from "@/lib/validation/wardrobe";
import { garmentSystemPrompt } from "./prompts";
import { toJsonSchema } from "./anthropic";

const BASE = "https://generativelanguage.googleapis.com/v1beta/models";

export function geminiConfig() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  return {
    apiKey,
    // gemini-3.8-flash: free tier, multimodal, JSON-schema output. (2.5-flash is closed to new users.)
    stylistModel: process.env.GEMINI_STYLIST_MODEL || "gemini-3.8-flash",
    analysisModel: process.env.GEMINI_ANALYSIS_MODEL || "gemini-3.8-flash",
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
  system: string;
  parts: Array<Record<string, unknown>>;
  jsonSchema: Record<string, unknown>;
  maxTokens: number;
  timeoutMs: number;
}

/** One generateContent call with JSON-schema constrained output + controlled retries. */
async function callGemini(opts: GeminiCall): Promise<{ json: unknown; usage: ProviderUsage }> {
  const started = Date.now();
  let lastError: AiError | null = null;
  const generationConfig: Record<string, unknown> = {
    responseMimeType: "application/json",
    responseJsonSchema: opts.jsonSchema,
    temperature: 0.7,
  };
  if (/^gemini-2\.5-flash/.test(opts.model)) {
    // 2.5-flash "thinks" by default and would eat the token budget: not needed for this task.
    generationConfig.maxOutputTokens = opts.maxTokens;
    generationConfig.thinkingConfig = { thinkingBudget: 0 };
  } else {
    // Newer models always reason internally; leave room so the JSON answer is never truncated.
    generationConfig.maxOutputTokens = Math.max(opts.maxTokens, 4096);
  }

  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 1200 * attempt));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
    try {
      const res = await fetch(`${BASE}/${encodeURIComponent(opts.model)}:generateContent`, {
        method: "POST",
        signal: controller.signal,
        headers: { "content-type": "application/json", "x-goog-api-key": opts.apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: opts.system }] },
          contents: [{ role: "user", parts: opts.parts }],
          generationConfig,
        }),
      });
      if (res.status === 429 || res.status >= 500) {
        lastError = new AiError(res.status === 429 ? "rate_limited" : "provider_error", `Il provider AI ha risposto con stato ${res.status}`);
        continue;
      }
      if (!res.ok) throw new AiError("provider_error", `Il provider AI ha risposto con stato ${res.status}`);
      const json = (await res.json()) as GenerateResponse;
      if (json.promptFeedback?.blockReason) throw new AiError("invalid_output", "Richiesta bloccata dai filtri del provider");
      const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
      if (!text) throw new AiError("invalid_output", "Risposta AI vuota");
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new AiError("invalid_output", "Risposta AI non è JSON valido");
      }
      return {
        json: parsed,
        usage: {
          provider: "gemini",
          model: opts.model,
          durationMs: Date.now() - started,
          inputTokens: json.usageMetadata?.promptTokenCount,
          outputTokens: json.usageMetadata?.candidatesTokenCount,
        },
      };
    } catch (e) {
      if (e instanceof AiError) throw e;
      if (e instanceof Error && e.name === "AbortError") {
        lastError = new AiError("timeout", "Il provider AI non ha risposto in tempo");
        continue;
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
        system: req.system,
        parts: [{ text: req.user }],
        jsonSchema: req.jsonSchema,
        maxTokens: Math.max(req.maxTokens ?? 1500, 1500),
        timeoutMs: 30_000,
      });
      let value: T;
      try {
        value = req.parse(json);
      } catch {
        throw new AiError("invalid_output", "L'output del modello non rispetta il formato richiesto");
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
        system: garmentSystemPrompt(categorySlugs),
        parts: [
          { inline_data: { mime_type: mediaType, data: image.toString("base64") } },
          { text: "Analizza questo capo e proponi i metadati." },
        ],
        jsonSchema: schema,
        maxTokens: 800,
        timeoutMs: 25_000,
      });
      const parsed = garmentAnalysisSchema.safeParse(json);
      if (!parsed.success) throw new AiError("invalid_output", "L'analisi AI non è nel formato atteso");
      return { analysis: parsed.data, usage };
    },
  };
}
