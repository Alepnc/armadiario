import type { Slot } from "@/lib/constants/wardrobe";
import type { EngineItem, EngineProfile, EngineRequest } from "@/features/outfits/engine/types";

let n = 0;
export function makeItem(partial: Partial<EngineItem> & { slot: Slot }): EngineItem {
  n += 1;
  return {
    id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    name: `Capo ${n}`,
    categorySlug: partial.slot,
    categoryLabel: partial.slot,
    primaryColor: "nero",
    secondaryColors: [],
    seasons: [],
    styles: [],
    formality: 2,
    pattern: "solid",
    fit: null,
    status: "available",
    isFavorite: false,
    ...partial,
  };
}

export const emptyProfile: EngineProfile = { styles: [], favoriteColors: [], avoidedColors: [], fitPreference: null };

export function makeRequest(partial: Partial<EngineRequest> = {}): EngineRequest {
  return {
    desiredColors: [],
    avoidColors: [],
    mustInclude: [],
    exclude: [],
    count: 3,
    includeUnavailable: false,
    variation: 0,
    ...partial,
  };
}

export function basicWardrobe(): EngineItem[] {
  return [
    makeItem({ slot: "top", categorySlug: "t-shirt", name: "T-shirt bianca", primaryColor: "bianco" }),
    makeItem({ slot: "top", categorySlug: "camicie", name: "Camicia azzurra", primaryColor: "azzurro", formality: 3 }),
    makeItem({ slot: "bottom", categorySlug: "jeans", name: "Jeans scuri", primaryColor: "denim" }),
    makeItem({ slot: "bottom", categorySlug: "pantaloni", name: "Chino beige", primaryColor: "beige" }),
    makeItem({ slot: "shoes", categorySlug: "scarpe", name: "Sneakers bianche", primaryColor: "bianco" }),
    makeItem({ slot: "shoes", categorySlug: "scarpe", name: "Mocassini marroni", primaryColor: "marrone", formality: 3 }),
  ];
}
