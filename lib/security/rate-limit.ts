import "server-only";
import type { ServerSupabase } from "@/lib/supabase/server";
import { aiLimits } from "@/lib/config";

export type AiOperation = "analyze_item" | "compose_outfit" | "try_on";

export class RateLimitError extends Error {
  constructor(public operation: AiOperation) {
    super("Hai raggiunto il limite di richieste AI. Riprova più tardi.");
    this.name = "RateLimitError";
  }
}

/** Counts the user's recent operations (DB-backed so it works across instances). */
export async function assertWithinQuota(
  supabase: ServerSupabase,
  userId: string,
  operation: AiOperation,
) {
  const { max, windowMinutes } = aiLimits()[operation];
  const since = new Date(Date.now() - windowMinutes * 60_000).toISOString();
  const { count, error } = await supabase
    .from("ai_usage")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("operation", operation)
    .gte("created_at", since);
  if (error) throw new Error("Impossibile verificare la quota AI");
  if ((count ?? 0) >= max) throw new RateLimitError(operation);
}

export interface UsageRecord {
  operation: AiOperation;
  provider: string;
  model?: string | null;
  success: boolean;
  durationMs: number;
  inputTokens?: number | null;
  outputTokens?: number | null;
}

/** Records cost/latency. Never stores prompts, images or personal data. */
export async function recordUsage(supabase: ServerSupabase, userId: string, usage: UsageRecord) {
  await supabase.from("ai_usage").insert({
    user_id: userId,
    operation: usage.operation,
    provider: usage.provider,
    model: usage.model ?? null,
    success: usage.success,
    duration_ms: Math.round(usage.durationMs),
    input_tokens: usage.inputTokens ?? null,
    output_tokens: usage.outputTokens ?? null,
  });
}
