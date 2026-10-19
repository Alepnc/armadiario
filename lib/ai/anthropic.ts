import "server-only";
import { z } from "zod";
import { AiError, type GarmentAnalyzer, type OutfitLanguageModel, type ProviderUsage, type StructuredRequest } from "./types";
import { garmentAnalysisSchema } from "@/lib/validation/wardrobe";
import { garmentSystemPrompt } from "./prompts";

const API_URL = "https://api.anthropic.com/v1/messages";
const API_VERSION = "2023-06-01";

export function anthropicConfig() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  return {
    apiKey,
    analysisModel: process.env.ANTHROPIC_ANALYSIS_MODEL || "claude-haiku-5-5",
    stylistModel: process.env.ANTHROPIC_STYLIST_MODEL || "claude-sonnet-5-5",
  };
}

interface ToolCall {
  model: string;
  apiKey: string;
  system: string;
  content: Array<Record<string, unknown>>;
  toolName: string;
  toolDescription: string;
  jsonSchema: Record<string, unknown>;
  maxTokens: number;
  timeoutMs: number;
}

interface MessagesResponse {
  content?: Array<{ type: string; input?: unknown }>;
  usage?: { input_tokens?: number; output_tokens?: number };
}

/** One Messages API call forcing a single tool call = structured JSON output. */
async function callTool(opts: ToolCall): Promise<{ input: unknown; usage: ProviderUsage }> {
  const started = Date.now();
  let lastError: AiError | null = null;

  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 600 * attempt));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
    try {
      const res = await fetch(API_URL, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "content-type": "application/json",
          "x-api-key": opts.apiKey,
          "anthropic-version": API_VERSION,
        },
        body: JSON.stringify({
          model: opts.model,
          max_tokens: opts.maxTokens,
          system: opts.system,
          messages: [{ role: "user", content: opts.content }],
          tools: [
            {
              name: opts.toolName,
              description: opts.toolDescription,
              input_schema: opts.jsonSchema,
            },
          ],
          tool_choice: { type: "tool", name: opts.toolName },
        }),
      });

      if (res.status === 429 || res.status >= 500) {
        lastError = new AiError(
          res.status === 429 ? "rate_limited" : "provider_error",
          `Il provider AI ha risposto con stato ${res.status}`,
        );
        continue; // controlled retry
      }
      if (!res.ok) throw new AiError("provider_error", `Il provider AI ha risposto con stato ${res.status}`);

      const json = (await res.json()) as MessagesResponse;
      const block = json.content?.find((b) => b.type === "tool_use");
      if (!block?.input) throw new AiError("invalid_output", "Risposta AI priva di output strutturato");
      return {
        input: block.input,
        usage: {
          provider: "anthropic",
          model: opts.model,
          durationMs: Date.now() - started,
          inputTokens: json.usage?.input_tokens,
          outputTokens: json.usage?.output_tokens,
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

function toJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const { $schema: _ignored, ...rest } = z.toJSONSchema(schema) as Record<string, unknown>;
  void _ignored;
  return rest;
}

export function createAnthropicLanguageModel(): OutfitLanguageModel | null {
  const cfg = anthropicConfig();
  if (!cfg) return null;
  return {
    name: "anthropic",
    async complete<T>(req: StructuredRequest<T>) {
      const { input, usage } = await callTool({
        model: cfg.stylistModel,
        apiKey: cfg.apiKey,
        system: req.system,
        content: [
          ...(req.images ?? []).flatMap((img) => [
            { type: "text", text: img.label },
            { type: "image", source: { type: "base64", media_type: img.mediaType, data: img.data.toString("base64") } },
          ]),
          { type: "text", text: req.user },
        ],
        toolName: req.toolName,
        toolDescription: req.toolDescription,
        jsonSchema: req.jsonSchema,
        maxTokens: req.maxTokens ?? 1500,
        timeoutMs: req.images?.length ? 45_000 : 30_000,
      });
      let value: T;
      try {
        value = req.parse(input);
      } catch {
        throw new AiError("invalid_output", "L'output del modello non rispetta il formato richiesto");
      }
      return { value, usage };
    },
  };
}

export function createAnthropicAnalyzer(): GarmentAnalyzer | null {
  const cfg = anthropicConfig();
  if (!cfg) return null;
  const schema = toJsonSchema(garmentAnalysisSchema);
  return {
    name: "anthropic",
    async analyze({ image, mediaType, categorySlugs }) {
      const system = garmentSystemPrompt(categorySlugs);
      const { input, usage } = await callTool({
        model: cfg.analysisModel,
        apiKey: cfg.apiKey,
        system,
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: mediaType, data: image.toString("base64") },
          },
          { type: "text", text: "Analizza questo capo e proponi i metadati." },
        ],
        toolName: "describe_garment",
        toolDescription: "Registra i metadati stimati del capo fotografato.",
        jsonSchema: schema,
        maxTokens: 700,
        timeoutMs: 25_000,
      });
      const parsed = garmentAnalysisSchema.safeParse(input);
      if (!parsed.success) throw new AiError("invalid_output", "L'analisi AI non è nel formato atteso");
      return { analysis: parsed.data, usage };
    },
  };
}

export { toJsonSchema };
