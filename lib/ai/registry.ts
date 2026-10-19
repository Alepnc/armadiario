import "server-only";
import { createAnthropicAnalyzer, createAnthropicLanguageModel } from "./anthropic";
import { createGeminiAnalyzer, createGeminiLanguageModel } from "./gemini";
import type { GarmentAnalyzer, OutfitLanguageModel } from "./types";

/**
 * Provider registry. Each capability is configured independently, so the app
 * can run with any subset of them (see README → "Funzionalità senza credenziali").
 * To add a provider, implement the interface in ./types and branch on AI_*_PROVIDER.
 */
export function getGarmentAnalyzer(): GarmentAnalyzer | null {
  const provider = process.env.AI_ANALYSIS_PROVIDER ?? defaultProvider();
  if (provider === "none") return null;
  if (provider === "gemini") return createGeminiAnalyzer();
  if (provider === "anthropic") return createAnthropicAnalyzer();
  return null;
}

export function getLanguageModel(): OutfitLanguageModel | null {
  const provider = process.env.AI_STYLIST_PROVIDER ?? defaultProvider();
  if (provider === "none") return null;
  if (provider === "gemini") return createGeminiLanguageModel();
  if (provider === "anthropic") return createAnthropicLanguageModel();
  return null;
}

/** With no explicit choice: use whichever provider has a key (Anthropic first). */
function defaultProvider(): string {
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (process.env.GEMINI_API_KEY) return "gemini";
  return "none";
}
