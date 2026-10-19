import { isLoud, isNeutral, pairHarmony } from "./color";
import { effectiveWeather, targetFormality } from "./rules";
import type { EngineItem, EngineProfile, EngineRequest } from "./types";

export interface ScoringContext {
  request: EngineRequest;
  profile: EngineProfile;
  /** How many times each garment appeared in recent suggestions. */
  recentUse: Map<string, number>;
  /** Recently suggested combinations, as sorted-id keys. */
  recentCombos: Set<string>;
}

export function comboKey(ids: string[]): string {
  return [...ids].sort().join("|");
}

/** Score of one garment on its own (preferences, occasion fit, season). */
export function itemScore(item: EngineItem, ctx: ScoringContext): number {
  const { request: req, profile } = ctx;
  let s = 50;
  if (item.isFavorite) s += 4;

  if (req.season && item.seasons.length > 0 && item.seasons.includes(req.season)) s += 6;

  const target = targetFormality(req);
  if (target && ["top", "bottom", "dress", "shoes", "outer"].includes(item.slot)) {
    s -= 8 * Math.abs(item.formality - target);
  }

  if (req.style) {
    const wanted = req.style.toLowerCase();
    if (item.styles.some((x) => x.toLowerCase() === wanted)) s += 8;
    else if (item.styles.length > 0) s -= 3;
  }
  if (profile.styles.some((p) => item.styles.some((x) => x.toLowerCase() === p.toLowerCase()))) s += 3;

  if (req.desiredColors.includes(item.primaryColor)) s += 8;
  else if (item.secondaryColors.some((c) => req.desiredColors.includes(c))) s += 3;

  if (profile.favoriteColors.includes(item.primaryColor)) s += 4;
  if (profile.avoidedColors.includes(item.primaryColor)) s -= 12;
  if (profile.fitPreference && item.fit === profile.fitPreference) s += 2;

  const weather = effectiveWeather(req);
  if (weather === "caldo" && item.categorySlug === "t-shirt") s += 3;
  if (weather === "freddo" && ["maglioni", "felpe"].includes(item.categorySlug)) s += 4;

  s -= Math.min(10, (ctx.recentUse.get(item.id) ?? 0) * 2);
  return s;
}

/** Score of the whole combination: harmony, coherence, weather, variety. */
export function comboScore(items: EngineItem[], ctx: ScoringContext): number {
  const main = items.filter((i) => ["top", "bottom", "dress", "outer", "shoes"].includes(i.slot));
  let total = items.reduce((acc, i) => acc + itemScore(i, ctx), 0) / items.length;

  // Colour harmony across the visible garments.
  let pairs = 0;
  let harmony = 0;
  for (let a = 0; a < main.length; a++) {
    for (let b = a + 1; b < main.length; b++) {
      harmony += pairHarmony(main[a].primaryColor, main[b].primaryColor);
      pairs++;
    }
  }
  if (pairs > 0) total += (harmony / pairs) * 1.5;

  const colors = new Set(main.map((i) => i.primaryColor));
  const loud = [...colors].filter(isLoud);
  if (loud.length > 1) total -= 10 * (loud.length - 1);
  const nonNeutral = [...colors].filter((c) => !isNeutral(c));
  if (nonNeutral.length > 3) total -= 8;

  // Competing patterns.
  const patterned = main.filter((i) => i.pattern !== "solid");
  if (patterned.length > 1) total -= 6 * (patterned.length - 1);

  // Formality coherence (the hard cut-off lives in generate.ts).
  const f = main.map((i) => i.formality);
  total -= 4 * (Math.max(...f) - Math.min(...f));

  // Weather: layers.
  const weather = effectiveWeather(ctx.request);
  const hasOuter = items.some((i) => i.slot === "outer");
  if ((weather === "fresco" || weather === "pioggia") && hasOuter) total += 6;
  if (weather === "freddo" && hasOuter) total += 10;
  // Without any season/weather hint an extra layer is not a sensible default.
  if (!weather && hasOuter) total -= 8;

  if (ctx.recentCombos.has(comboKey(items.map((i) => i.id)))) total -= 20;
  return total;
}

/** Tiny seeded PRNG so "variant" requests are reproducible. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
