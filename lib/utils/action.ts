import type { ZodError } from "zod";

/** Consistent shape for every Server Action / API result. */
export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export function ok(): ActionResult<undefined>;
export function ok<T>(data: T): ActionResult<T>;
export function ok<T>(data?: T): ActionResult<T | undefined> {
  return { ok: true, data };
}

export function fail(error: string): { ok: false; error: string } {
  return { ok: false, error };
}

export function zodMessage(err: ZodError): string {
  return err.issues[0]?.message ?? "Dati non validi";
}
