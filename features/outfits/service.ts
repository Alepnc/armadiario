import "server-only";
import { BUCKETS } from "@/lib/config";
import { getLanguageModel } from "@/lib/ai/registry";
import { AiError } from "@/lib/ai/types";
import { assertWithinQuota, RateLimitError, recordUsage } from "@/lib/security/rate-limit";
import { signPaths } from "@/lib/storage";
import type { ServerSupabase } from "@/lib/supabase/server";
import type { StylistRequest } from "@/lib/validation/outfit";
import { SLOT_LABEL } from "@/lib/constants/wardrobe";
import { listAllItems } from "@/features/wardrobe/queries";
import { getProfile } from "@/features/profile/queries";
import type { ClothingItem } from "@/types/db";
import { log } from "@/lib/utils/logger";
import { explainCandidate } from "./engine/explain";
import { comboKey, comboScore, type ScoringContext } from "./engine/scoring";
import { ConstraintError, filterPool, generateCandidates } from "./engine/generate";
import { ROLE_BY_SLOT } from "./engine/rules";
import { validateOutfit } from "./engine/validate";
import type { Candidate, EngineItem, EngineProfile, EngineRequest } from "./engine/types";
import { extractIntent, mergeIntent, selectAndExplain, type StylistPhoto } from "./llm";
import { detectImageMime } from "@/lib/images/detect";
import { toEngineItem, toEngineProfile, toEngineRequest, toItemView } from "./mappers";
import type { GenerationResponse, ProposalView } from "./types";

/** Error whose message is safe to show to the end user. */
export class UserFacingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserFacingError";
  }
}

interface Loaded {
  items: ClothingItem[];
  byId: Map<string, ClothingItem>;
  engineItems: EngineItem[];
  profile: EngineProfile;
  consent: boolean;
  /** Separate consent: garment photos may be sent to the stylist model. */
  visionConsent: boolean;
}

async function load(supabase: ServerSupabase, userId: string): Promise<Loaded> {
  const [items, profileRow] = await Promise.all([listAllItems(supabase), getProfile(supabase, userId)]);
  return {
    items,
    byId: new Map(items.map((i) => [i.id, i])),
    engineItems: items.map(toEngineItem),
    profile: toEngineProfile(profileRow),
    consent: Boolean(profileRow?.ai_consent_at),
    visionConsent: Boolean(profileRow?.ai_vision_consent_at),
  };
}

async function recentHistory(supabase: ServerSupabase) {
  const { data } = await supabase
    .from("recommendation_log")
    .select("item_ids")
    .order("created_at", { ascending: false })
    .limit(30);
  const recentUse = new Map<string, number>();
  const recentCombos = new Set<string>();
  for (const row of data ?? []) {
    const ids = row.item_ids as string[];
    recentCombos.add(comboKey(ids));
    for (const id of ids) recentUse.set(id, (recentUse.get(id) ?? 0) + 1);
  }
  return { recentUse, recentCombos };
}

function assertMustIncludeUsable(loaded: Loaded, req: EngineRequest) {
  for (const id of req.mustInclude) {
    const item = loaded.byId.get(id);
    if (!item) throw new UserFacingError("Uno dei capi obbligatori non esiste più nel tuo guardaroba.");
    if (item.availability_status !== "available" && !req.includeUnavailable) {
      throw new UserFacingError(`«${item.name}» non è disponibile: non posso includerlo nell'outfit.`);
    }
    if (req.exclude.includes(id)) throw new UserFacingError(`«${item.name}» è sia obbligatorio sia escluso.`);
  }
}

async function buildViews(
  supabase: ServerSupabase,
  loaded: Loaded,
  entries: Array<{
    key: string;
    title: string;
    reason: string;
    tips: string[];
    source: "ai" | "rules";
    members: Array<{ id: string; role: string }>;
  }>,
): Promise<ProposalView[]> {
  const used = entries.flatMap((e) => e.members.map((m) => loaded.byId.get(m.id)).filter((x): x is ClothingItem => !!x));
  const thumbs = await signPaths(
    supabase,
    BUCKETS.wardrobe,
    used.map((i) => i.thumb_path ?? i.image_path),
  );
  return entries.map((e) => {
    const items = e.members.flatMap((m) => {
      const it = loaded.byId.get(m.id);
      return it ? [toItemView(it, m.role, thumbs)] : [];
    });
    return {
      key: e.key,
      title: e.title,
      reason: e.reason,
      tips: e.tips,
      source: e.source,
      items,
      hasUnavailable: items.some((i) => i.status !== "available"),
    };
  });
}

function candidateEntry(c: Candidate, req: EngineRequest, idx: number, key: string) {
  const ex = explainCandidate(c, req);
  return {
    key,
    title: `Proposta ${idx + 1}`,
    reason: ex.reason,
    tips: ex.tips,
    source: "rules" as const,
    members: c.members.map((m) => ({ id: m.item.id, role: m.role })),
  };
}

const MAX_PHOTOS = 20;
const MAX_CANDIDATES_WITH_PHOTOS = 8;

/** AI_STYLIST_VISION=off lets an operator turn photo evaluation off for everyone. */
function visionEnabledByOperator(): boolean {
  return !["off", "0", "false", "no"].includes((process.env.AI_STYLIST_VISION ?? "on").toLowerCase());
}

/**
 * Downloads the small thumbnails of the garments in the candidates (as the user, so RLS applies).
 * Photos that cannot be read are simply skipped: the model still has the text data for them.
 */
async function loadPhotos(supabase: ServerSupabase, loaded: Loaded, candidates: Candidate[]): Promise<StylistPhoto[]> {
  const order: string[] = [];
  for (const c of candidates) for (const m of c.members) if (!order.includes(m.item.id)) order.push(m.item.id);
  const wanted = order.slice(0, MAX_PHOTOS);
  const got = await Promise.all(
    wanted.map(async (id, i): Promise<StylistPhoto | null> => {
      const item = loaded.byId.get(id);
      if (!item) return null;
      const dl = await supabase.storage.from(BUCKETS.wardrobe).download(item.thumb_path ?? item.image_path);
      if (dl.error || !dl.data) return null;
      const data = Buffer.from(await dl.data.arrayBuffer());
      const mediaType = detectImageMime(data);
      if (!mediaType) return null;
      return { itemId: id, tag: `K${i + 1}`, label: `${item.name} (${item.category.label})`, mediaType, data };
    }),
  );
  return got.filter((p): p is StylistPhoto => p !== null);
}

export interface GenerateOptions {
  /** Combination (item ids) to steer away from, used for "variant" requests. */
  avoidCombo?: string[];
}

/**
 * The full recommendation pipeline:
 *  A. deterministic filters → B. ranking → C. (optional) model chooses/explains
 *  among backend candidates → D. final validation against the live wardrobe.
 */
export async function generateOutfits(
  supabase: ServerSupabase,
  userId: string,
  request: StylistRequest,
  opts: GenerateOptions = {},
): Promise<GenerationResponse> {
  const loaded = await load(supabase, userId);
  let req = toEngineRequest(request);
  assertMustIncludeUsable(loaded, req);

  const model = getLanguageModel();
  let modeNote: string | null = null;
  let useModel = false;
  let photosSent = 0;
  if (!model) {
    modeNote = "L'AI non è configurata: gli outfit sono composti dalle regole di abbinamento dell'app.";
  } else if (!loaded.consent) {
    modeNote =
      "Per usare l'AI nella scelta degli outfit serve il tuo consenso (Impostazioni → Privacy). Intanto uso le regole di abbinamento dell'app.";
  } else {
    try {
      await assertWithinQuota(supabase, userId, "compose_outfit");
      useModel = true;
    } catch (e) {
      if (e instanceof RateLimitError) modeNote = "Limite AI raggiunto: uso le regole di abbinamento dell'app.";
      else throw e;
    }
  }

  // C1. Free-text note → structured constraints (fills gaps only).
  if (useModel && model && req.note) {
    const started = Date.now();
    try {
      const { intent, usage } = await extractIntent(model, req.note);
      req = mergeIntent(req, intent);
      await recordUsage(supabase, userId, { operation: "compose_outfit", success: true, provider: usage.provider, model: usage.model, durationMs: usage.durationMs, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens });
    } catch (e) {
      log.warn("intent_failed", { userId, code: e instanceof AiError ? e.code : "unknown" }, e);
      await recordUsage(supabase, userId, { operation: "compose_outfit", success: false, provider: model.name, durationMs: Date.now() - started });
    }
  }

  const history = await recentHistory(supabase);
  if (opts.avoidCombo) history.recentCombos.add(comboKey(opts.avoidCombo));

  let result;
  try {
    result = generateCandidates(
      { items: loaded.engineItems, profile: loaded.profile, request: req, ...history },
      useModel ? Math.max(req.count * 3, 9) : req.count,
    );
  } catch (e) {
    if (e instanceof ConstraintError) throw new UserFacingError(e.message);
    throw e;
  }

  if (result.candidates.length === 0) {
    return {
      proposals: [],
      mode: "rules",
      modeNote,
      usedPhotos: false,
      shortage: result.shortage
        ? { message: result.shortage.message, missing: result.shortage.missingSlots.map((s) => SLOT_LABEL[s]) }
        : null,
      notes: result.relaxed,
    };
  }

  let entries: Parameters<typeof buildViews>[2] = [];
  let mode: "ai" | "rules" = "rules";
  if (useModel && model) {
    const started = Date.now();
    try {
      // Show the model the garment photos only with the user\'s separate consent (and if the operator allows it).
      const withPhotos = loaded.visionConsent && visionEnabledByOperator();
      const forModel = withPhotos ? result.candidates.slice(0, MAX_CANDIDATES_WITH_PHOTOS) : result.candidates;
      const photos = withPhotos ? await loadPhotos(supabase, loaded, forModel) : [];
      photosSent = photos.length;
      const { selection, usage } = await selectAndExplain(model, {
        candidates: forModel,
        request: req,
        profile: loaded.profile,
        count: req.count,
        photos,
      });
      const byCand = new Map(result.candidates.map((c) => [c.id, c]));
      entries = selection.outfits.flatMap((o, idx) => {
        const cand = byCand.get(o.candidate_id);
        if (!cand) return [];
        return [
          {
            key: crypto.randomUUID(),
            title: o.title || `Proposta ${idx + 1}`,
            reason: o.reason,
            tips: o.tips,
            source: "ai" as const,
            members: cand.members.map((m) => ({ id: m.item.id, role: m.role })),
          },
        ];
      });
      mode = "ai";
      await recordUsage(supabase, userId, { operation: "compose_outfit", success: true, provider: usage.provider, model: usage.model, durationMs: usage.durationMs, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens });
      // Top up with rule-based outfits if the model returned fewer than requested.
      if (entries.length < req.count) {
        const used = new Set(selection.outfits.map((o) => o.candidate_id));
        for (const c of result.candidates) {
          if (entries.length >= req.count) break;
          if (!used.has(c.id)) entries.push({ ...candidateEntry(c, req, entries.length, crypto.randomUUID()) });
        }
      }
    } catch (e) {
      log.warn("selection_failed", { userId, code: e instanceof AiError ? e.code : "unknown" }, e);
      await recordUsage(supabase, userId, { operation: "compose_outfit", success: false, provider: model.name, durationMs: Date.now() - started });
      modeNote = "L'AI non ha risposto correttamente: ti mostro gli abbinamenti calcolati dalle regole dell'app.";
    }
  }
  if (entries.length === 0) {
    entries = result.candidates
      .slice(0, req.count)
      .map((c, idx) => candidateEntry(c, req, idx, crypto.randomUUID()));
  }

  // D. Final validation against the live wardrobe (never trust model/client output).
  const valid = entries.filter((e) => {
    const issues = validateOutfit(
      e.members.map((m) => m.id),
      loaded.engineItems,
      req,
    );
    if (issues.length > 0) log.warn("proposal_rejected", { userId, issues: issues.map((i) => i.code).join(",") });
    return issues.length === 0;
  });

  if (valid.length > 0) {
    await supabase.from("recommendation_log").insert(
      valid.map((e) => ({ user_id: userId, item_ids: e.members.map((m) => m.id) })),
    );
  }

  return {
    proposals: await buildViews(supabase, loaded, valid),
    mode: valid.some((e) => e.source === "ai") ? mode : "rules",
    modeNote,
    usedPhotos: mode === "ai" && photosSent > 0,
    shortage: null,
    notes: result.relaxed,
  };
}

/** Garments that could replace `replaceId` keeping the rest of the outfit. */
export async function alternativesFor(
  supabase: ServerSupabase,
  userId: string,
  request: StylistRequest,
  itemIds: string[],
  replaceId: string,
): Promise<{ alternatives: ProposalView["items"]; }> {
  const loaded = await load(supabase, userId);
  const req = toEngineRequest(request);
  const target = loaded.byId.get(replaceId);
  if (!target || !itemIds.includes(replaceId)) throw new UserFacingError("Capo non valido");
  const rest = itemIds.filter((id) => id !== replaceId);
  if (!rest.every((id) => loaded.byId.has(id))) throw new UserFacingError("Outfit non valido");

  const history = await recentHistory(supabase);
  const ctx: ScoringContext = { request: req, profile: loaded.profile, ...history };
  const restItems = rest.map((id) => toEngineItem(loaded.byId.get(id)!));
  const pool = filterPool(loaded.engineItems, { ...req, exclude: [...req.exclude, replaceId, ...rest] }, { relaxSeason: true });

  const ranked = pool
    .filter((p) => p.slot === target.category.slot)
    .map((p) => ({ p, s: comboScore([...restItems, p], ctx) }))
    .filter(({ p }) => validateOutfit([...rest, p.id], loaded.engineItems, req).length === 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, 8);

  const thumbs = await signPaths(supabase, BUCKETS.wardrobe, ranked.map(({ p }) => {
    const it = loaded.byId.get(p.id)!;
    return it.thumb_path ?? it.image_path;
  }));
  return {
    alternatives: ranked.map(({ p }) => toItemView(loaded.byId.get(p.id)!, ROLE_BY_SLOT[p.slot], thumbs)),
  };
}

/** Re-validates and re-describes an outfit after the user swapped a garment. */
export async function rebuildProposal(
  supabase: ServerSupabase,
  userId: string,
  request: StylistRequest,
  itemIds: string[],
  prev?: { title: string },
): Promise<ProposalView> {
  const loaded = await load(supabase, userId);
  const req = toEngineRequest({ ...request, mustInclude: [] });
  const issues = validateOutfit(itemIds, loaded.engineItems, req);
  if (issues.length > 0) throw new UserFacingError(issues[0].message);

  const members = itemIds.map((id) => {
    const item = loaded.engineItems.find((i) => i.id === id)!;
    return { item, role: ROLE_BY_SLOT[item.slot] };
  });
  const candidate: Candidate = {
    id: "x",
    members,
    score: 0,
    unavailableIds: members.filter((m) => m.item.status !== "available").map((m) => m.item.id),
    warnings: [],
  };
  const entry = candidateEntry(candidate, req, 0, crypto.randomUUID());
  const [view] = await buildViews(supabase, loaded, [{ ...entry, title: prev?.title ?? entry.title }]);
  return view;
}
