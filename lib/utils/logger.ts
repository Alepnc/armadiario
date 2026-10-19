/**
 * Minimal server logger. Callers must pass only non-sensitive context
 * (ids, codes, durations) — never passwords, tokens or image data.
 */
type Ctx = Record<string, string | number | boolean | null | undefined>;

function emit(level: "info" | "warn" | "error", event: string, ctx?: Ctx, err?: unknown) {
  const line = {
    t: new Date().toISOString(),
    level,
    event,
    ...ctx,
    ...(err instanceof Error ? { error: err.name, message: err.message.slice(0, 300) } : {}),
  };
  const out = JSON.stringify(line);
  if (level === "error") console.error(out);
  else if (level === "warn") console.warn(out);
  else console.log(out);
}

export const log = {
  info: (event: string, ctx?: Ctx) => emit("info", event, ctx),
  warn: (event: string, ctx?: Ctx, err?: unknown) => emit("warn", event, ctx, err),
  error: (event: string, ctx?: Ctx, err?: unknown) => emit("error", event, ctx, err),
};
