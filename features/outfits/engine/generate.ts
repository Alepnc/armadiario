import { SLOT_LABEL, type Slot } from "@/lib/constants/wardrobe";
import { comboKey, comboScore, itemScore, mulberry32, type ScoringContext } from "./scoring";
import { effectiveWeather, isSeasonIncompatible, isWeatherIncompatible, ROLE_BY_SLOT } from "./rules";
import type {
  Candidate,
  EngineItem,
  EngineProfile,
  EngineRequest,
  GenerationResult,
  OutfitMember,
  Shortage,
} from "./types";

const PER_SLOT_LIMIT = 10;
const MAX_FORMALITY_SPREAD = 2;

export interface EngineInput {
  items: EngineItem[];
  profile: EngineProfile;
  request: EngineRequest;
  recentUse?: Map<string, number>;
  recentCombos?: Set<string>;
}

export class ConstraintError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConstraintError";
  }
}

/** A. Deterministic filters: ownership is guaranteed by the caller's query. */
export function filterPool(
  items: EngineItem[],
  req: EngineRequest,
  opts: { relaxSeason: boolean },
): EngineItem[] {
  const weather = effectiveWeather(req);
  const must = new Set(req.mustInclude);
  const excluded = new Set(req.exclude);
  return items.filter((item) => {
    if (excluded.has(item.id)) return false;
    if (!req.includeUnavailable && item.status !== "available") return false;
    if (must.has(item.id)) return true; // explicit user choice overrides soft rules
    if (req.avoidColors.includes(item.primaryColor)) return false;
    if (isWeatherIncompatible(item, weather)) return false;
    if (!opts.relaxSeason && isSeasonIncompatible(item, req.season)) return false;
    return true;
  });
}

function bySlot(pool: EngineItem[]): Record<Slot, EngineItem[]> {
  const out = { top: [], bottom: [], dress: [], outer: [], shoes: [], accessory: [], bag: [], other: [] } as Record<
    Slot,
    EngineItem[]
  >;
  for (const i of pool) out[i.slot].push(i);
  return out;
}

function topN(list: EngineItem[], ctx: ScoringContext, n: number, jitter: () => number): EngineItem[] {
  return [...list]
    .map((i) => ({ i, s: itemScore(i, ctx) + jitter() * 4 }))
    .sort((a, b) => b.s - a.s)
    .slice(0, n)
    .map((x) => x.i);
}

function restrictToMust(list: EngineItem[], must: EngineItem[]): EngineItem[] {
  return must.length > 0 ? must : list;
}

function spreadOk(items: EngineItem[]): boolean {
  const f = items.filter((i) => ["top", "bottom", "dress", "outer", "shoes"].includes(i.slot)).map((i) => i.formality);
  return f.length === 0 || Math.max(...f) - Math.min(...f) <= MAX_FORMALITY_SPREAD;
}

function toMembers(items: EngineItem[]): OutfitMember[] {
  const order: Slot[] = ["dress", "top", "bottom", "outer", "shoes", "bag", "accessory", "other"];
  return [...items]
    .sort((a, b) => order.indexOf(a.slot) - order.indexOf(b.slot))
    .map((item) => ({ item, role: ROLE_BY_SLOT[item.slot] ?? SLOT_LABEL[item.slot] }));
}

function describeShortage(pool: EngineItem[]): Shortage | null {
  const s = bySlot(pool);
  const missing: Slot[] = [];
  if (s.dress.length === 0) {
    if (s.top.length === 0) missing.push("top");
    if (s.bottom.length === 0) missing.push("bottom");
  }
  if (s.shoes.length === 0) missing.push("shoes");
  if (missing.length === 0) return null;
  const labels = missing.map((m) => SLOT_LABEL[m].toLowerCase()).join(", ");
  return {
    missingSlots: missing,
    message: `Non ci sono abbastanza capi disponibili per comporre un outfit: mancano ${labels}.`,
  };
}

function generateFromPool(input: EngineInput, pool: EngineItem[]): Candidate[] {
  const { request: req, profile } = input;
  const ctx: ScoringContext = {
    request: req,
    profile,
    recentUse: input.recentUse ?? new Map(),
    recentCombos: input.recentCombos ?? new Set(),
  };
  const rng = mulberry32(req.variation * 7919 + 13);
  const jitter = () => (rng() - 0.5) * 2; // −1 … +1
  const slots = bySlot(pool);
  const must = req.mustInclude
    .map((id) => pool.find((p) => p.id === id))
    .filter((x): x is EngineItem => Boolean(x));

  const mustBySlot = (slot: Slot) => must.filter((m) => m.slot === slot);
  const mustDress = mustBySlot("dress");
  const mustTop = mustBySlot("top");
  const mustBottom = mustBySlot("bottom");
  if (mustDress.length > 1 || mustTop.length > 1 || mustBottom.length > 1 || mustBySlot("shoes").length > 1 || mustBySlot("outer").length > 1) {
    throw new ConstraintError("I capi obbligatori scelti occupano lo stesso ruolo nell'outfit.");
  }
  if (mustDress.length > 0 && (mustTop.length > 0 || mustBottom.length > 0)) {
    throw new ConstraintError("Un abito non può essere abbinato a una parte superiore o inferiore obbligatoria.");
  }

  const weather = effectiveWeather(req);
  const needsOuter = weather === "freddo";

  const shoes = restrictToMust(topN(slots.shoes, ctx, PER_SLOT_LIMIT, jitter), mustBySlot("shoes"));
  const outerPool = mustBySlot("outer").length ? mustBySlot("outer") : topN(slots.outer, ctx, 6, jitter);
  // `null` = no outer layer; forced out when cold and an outer exists.
  const outerOptions: Array<EngineItem | null> =
    mustBySlot("outer").length || (needsOuter && outerPool.length > 0) ? outerPool : [null, ...outerPool];

  const bases: EngineItem[][] = [];
  if (mustTop.length === 0 && mustBottom.length === 0 && (mustDress.length > 0 || slots.dress.length > 0)) {
    for (const d of restrictToMust(topN(slots.dress, ctx, PER_SLOT_LIMIT, jitter), mustDress)) bases.push([d]);
  }
  if (mustDress.length === 0) {
    const tops = restrictToMust(topN(slots.top, ctx, PER_SLOT_LIMIT, jitter), mustTop);
    const bottoms = restrictToMust(topN(slots.bottom, ctx, PER_SLOT_LIMIT, jitter), mustBottom);
    for (const t of tops) for (const b of bottoms) bases.push([t, b]);
  }

  const extras = [
    ...mustBySlot("accessory"),
    ...mustBySlot("bag"),
    ...mustBySlot("other"),
  ];
  const optionalAccessory = topN(slots.accessory.filter((a) => !must.includes(a)), ctx, 3, jitter);
  const optionalBag = topN(slots.bag.filter((a) => !must.includes(a)), ctx, 2, jitter);

  const scored: Candidate[] = [];
  const seen = new Set<string>();
  for (const base of bases) {
    for (const sh of shoes) {
      for (const outer of outerOptions) {
        const items = [...base, sh, ...(outer ? [outer] : []), ...extras];
        if (!spreadOk(items)) continue;
        let best = items;
        let bestScore = comboScore(items, ctx) + jitter() * 2;
        // Optionally add one accessory / bag when it improves the look.
        for (const acc of [...optionalAccessory, ...optionalBag]) {
          if (items.some((i) => i.slot === acc.slot) && acc.slot !== "accessory") continue;
          const withAcc = [...items, acc];
          const s = comboScore(withAcc, ctx) + jitter() * 2;
          if (s > bestScore + 0.5) {
            best = withAcc;
            bestScore = s;
          }
        }
        const key = comboKey(best.map((i) => i.id));
        if (seen.has(key)) continue;
        seen.add(key);
        scored.push({
          id: "",
          members: toMembers(best),
          score: bestScore,
          unavailableIds: best.filter((i) => i.status !== "available").map((i) => i.id),
          warnings: [],
        });
      }
    }
  }
  return scored.sort((a, b) => b.score - a.score);
}

/** Greedy selection that favours variety: penalises shared garments. */
export function selectDiverse(candidates: Candidate[], count: number): Candidate[] {
  const picked: Candidate[] = [];
  const pool = [...candidates];
  while (picked.length < count && pool.length > 0) {
    let bestIdx = 0;
    let bestVal = Number.NEGATIVE_INFINITY;
    pool.forEach((c, idx) => {
      const overlap = picked.reduce(
        (acc, p) =>
          acc + c.members.filter((m) => p.members.some((pm) => pm.item.id === m.item.id && m.item.slot !== "shoes")).length,
        0,
      );
      const val = c.score - overlap * 9;
      if (val > bestVal) {
        bestVal = val;
        bestIdx = idx;
      }
    });
    picked.push(pool.splice(bestIdx, 1)[0]);
  }
  return picked;
}

/**
 * Generates up to `maxCandidates` valid combinations. Never uses garments that
 * the filters exclude, so any list returned already satisfies the constraints.
 */
export function generateCandidates(input: EngineInput, maxCandidates: number): GenerationResult {
  const relaxed: string[] = [];
  let pool = filterPool(input.items, input.request, { relaxSeason: false });
  let list: Candidate[] = [];
  let shortage = describeShortage(pool);

  if (!shortage) list = generateFromPool(input, pool);

  if (list.length === 0 && input.request.season) {
    const relaxedPool = filterPool(input.items, input.request, { relaxSeason: true });
    const relaxedShortage = describeShortage(relaxedPool);
    if (!relaxedShortage) {
      const attempt = generateFromPool(input, relaxedPool);
      if (attempt.length > 0) {
        list = attempt;
        pool = relaxedPool;
        shortage = null;
        relaxed.push(
          "Pochi capi sono indicati per la stagione scelta: ho incluso anche capi non specifici per quella stagione.",
        );
      } else shortage = relaxedShortage;
    } else shortage = relaxedShortage;
  }

  const chosen = selectDiverse(list, maxCandidates).map((c, idx) => ({ ...c, id: `c${idx + 1}` }));
  if (chosen.length === 0 && !shortage) {
    shortage = {
      missingSlots: [],
      message:
        "Con i vincoli scelti non esiste una combinazione coerente. Prova ad allentare formalità, colori o capi obbligatori.",
    };
  }
  return { candidates: chosen, shortage, relaxed, poolSize: pool.length };
}
