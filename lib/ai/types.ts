import type { GarmentAnalysis } from "@/lib/validation/wardrobe";

export interface ProviderUsage {
  provider: string;
  model: string;
  durationMs: number;
  inputTokens?: number;
  outputTokens?: number;
}

export type AiErrorCode =
  | "not_configured"
  | "timeout"
  | "rate_limited"
  | "provider_error"
  | "invalid_output";

export class AiError extends Error {
  constructor(
    public code: AiErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AiError";
  }
}

/** 1. Multimodal model: looks at a garment photo and suggests metadata. */
export interface GarmentAnalyzer {
  readonly name: string;
  analyze(input: {
    image: Buffer;
    mediaType: "image/webp" | "image/jpeg" | "image/png";
    categorySlugs: string[];
  }): Promise<{ analysis: GarmentAnalysis; usage: ProviderUsage }>;
}

/** 2. Text model: interprets free text and explains/ranks backend candidates. */
export interface OutfitLanguageModel {
  readonly name: string;
  complete<T>(input: StructuredRequest<T>): Promise<{ value: T; usage: ProviderUsage }>;
}

export interface StructuredRequest<T> {
  system: string;
  user: string;
  toolName: string;
  toolDescription: string;
  /** JSON schema describing the tool input. */
  jsonSchema: Record<string, unknown>;
  parse: (raw: unknown) => T;
  maxTokens?: number;
}
