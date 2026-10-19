import "server-only";
import { createAnthropicAnalyzer, createAnthropicLanguageModel } from "./anthropic";
import type { GarmentAnalyzer, OutfitLanguageModel } from "./types";

/**
 * Provider registry. Each capability is configured independently, so the app
 * can run with any subset of them (see README → "Funzionalità senza credenziali").
 * To add a provider, implement the interface in ./types and branch on AI_*_PROVIDER.
 */
export function getGarmentAnalyzer(): GarmentAnalyzer | null {
  const provider = process.env.AI_ANALYSIS_PROVIDER ?? "anthropic";
  if (provider === "none") return null;
  if (provider === "anthropic") return createAnthropicAnalyzer();
  return null;
}

export function getLanguageModel(): OutfitLanguageModel | null {
  const provider = process.env.AI_STYLIST_PROVIDER ?? "anthropic";
  if (provider === "none") return null;
  if (provider === "anthropic") return createAnthropicLanguageModel();
  return null;
}
