import type { Availability, Season, Slot } from "@/lib/constants/wardrobe";

/** Minimal garment view used by the engine (pure data, no I/O). */
export interface EngineItem {
  id: string;
  name: string;
  slot: Slot;
  categorySlug: string;
  categoryLabel: string;
  primaryColor: string;
  secondaryColors: string[];
  seasons: Season[];
  styles: string[];
  formality: number;
  pattern: string;
  fit: string | null;
  status: Availability;
  isFavorite: boolean;
}

export interface EngineProfile {
  styles: string[];
  favoriteColors: string[];
  avoidedColors: string[];
  fitPreference: string | null;
}

export interface EngineRequest {
  occasion?: string;
  style?: string;
  season?: Season;
  weather?: string;
  timeOfDay?: string;
  note?: string;
  formality?: number;
  desiredColors: string[];
  avoidColors: string[];
  mustInclude: string[];
  exclude: string[];
  count: number;
  includeUnavailable: boolean;
  variation: number;
}

export interface OutfitMember {
  item: EngineItem;
  role: string;
}

export interface Candidate {
  id: string;
  members: OutfitMember[];
  score: number;
  /** Items that are not currently available (only in "simulation" mode). */
  unavailableIds: string[];
  warnings: string[];
}

export interface Shortage {
  missingSlots: Slot[];
  message: string;
}

export interface GenerationResult {
  candidates: Candidate[];
  shortage: Shortage | null;
  /** True when a soft constraint (season) had to be relaxed to find outfits. */
  relaxed: string[];
  poolSize: number;
}
