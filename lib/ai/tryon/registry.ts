import "server-only";
import { createReplicateTryOn } from "./replicate";
import type { TryOnProvider } from "./types";

export function getTryOnProvider(): TryOnProvider | null {
  const provider = process.env.TRYON_PROVIDER ?? "replicate";
  if (provider === "none") return null;
  if (provider === "replicate") return createReplicateTryOn();
  return null;
}

export function isTryOnConfigured(): boolean {
  return getTryOnProvider() !== null;
}
