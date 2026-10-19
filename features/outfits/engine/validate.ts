import type { Slot } from "@/lib/constants/wardrobe";
import type { EngineItem, EngineRequest } from "./types";

export interface ValidationIssue {
  code:
    | "unknown_item"
    | "duplicate_item"
    | "unavailable_item"
    | "excluded_item"
    | "missing_required"
    | "bad_structure"
    | "too_many_in_slot";
  itemId?: string;
  message: string;
}

/**
 * D. Final validation. `pool` is the list of garments fetched from the DB
 * *as the authenticated user*, so an id outside it is unknown or foreign.
 */
export function validateOutfit(
  itemIds: string[],
  pool: EngineItem[],
  request: Pick<EngineRequest, "mustInclude" | "exclude" | "includeUnavailable">,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const byId = new Map(pool.map((i) => [i.id, i]));
  const seen = new Set<string>();
  const slotCount = new Map<Slot, number>();

  for (const id of itemIds) {
    if (seen.has(id)) {
      issues.push({ code: "duplicate_item", itemId: id, message: "Capo ripetuto nello stesso outfit." });
      continue;
    }
    seen.add(id);
    const item = byId.get(id);
    if (!item) {
      issues.push({ code: "unknown_item", itemId: id, message: "Capo non presente nel tuo guardaroba." });
      continue;
    }
    if (request.exclude.includes(id)) {
      issues.push({ code: "excluded_item", itemId: id, message: `"${item.name}" era stato escluso.` });
    }
    if (item.status !== "available" && !request.includeUnavailable) {
      issues.push({ code: "unavailable_item", itemId: id, message: `"${item.name}" non è disponibile.` });
    }
    slotCount.set(item.slot, (slotCount.get(item.slot) ?? 0) + 1);
  }

  for (const must of request.mustInclude) {
    if (!seen.has(must)) {
      issues.push({ code: "missing_required", itemId: must, message: "Manca un capo obbligatorio." });
    }
  }

  const has = (s: Slot) => (slotCount.get(s) ?? 0) > 0;
  const single: Slot[] = ["top", "bottom", "dress", "outer", "shoes", "bag"];
  for (const s of single) {
    if ((slotCount.get(s) ?? 0) > 1) {
      issues.push({ code: "too_many_in_slot", message: "Più capi nello stesso ruolo." });
    }
  }
  const structureOk = (has("dress") && !has("top") && !has("bottom")) || (!has("dress") && has("top") && has("bottom"));
  if (!structureOk || !has("shoes")) {
    issues.push({
      code: "bad_structure",
      message: "L'outfit deve avere un abito oppure parte superiore + inferiore, più le scarpe.",
    });
  }
  return issues;
}
