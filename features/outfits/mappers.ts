import type { ClothingItem, Profile } from "@/types/db";
import type { StylistRequest } from "@/lib/validation/outfit";
import type { EngineItem, EngineProfile, EngineRequest } from "./engine/types";
import type { OutfitItemView } from "./types";

export function toEngineItem(i: ClothingItem): EngineItem {
  return {
    id: i.id,
    name: i.name,
    slot: i.category.slot,
    categorySlug: i.category.slug,
    categoryLabel: i.category.label,
    primaryColor: i.primary_color,
    secondaryColors: i.secondary_colors,
    seasons: i.seasons,
    styles: i.styles,
    formality: i.formality,
    pattern: i.pattern,
    fit: i.fit,
    status: i.availability_status,
    isFavorite: i.is_favorite,
  };
}

export function toEngineProfile(p: Profile | null): EngineProfile {
  return {
    styles: p?.style_preferences ?? [],
    favoriteColors: p?.favorite_colors ?? [],
    avoidedColors: p?.avoided_colors ?? [],
    fitPreference: p?.fit_preference ?? null,
  };
}

export function toEngineRequest(r: StylistRequest): EngineRequest {
  return {
    occasion: r.occasion || undefined,
    style: r.style || undefined,
    season: r.season,
    weather: r.weather || undefined,
    timeOfDay: r.timeOfDay || undefined,
    note: r.note || undefined,
    formality: r.formality,
    desiredColors: r.desiredColors,
    avoidColors: r.avoidColors,
    mustInclude: r.mustInclude,
    exclude: r.exclude,
    count: r.count,
    includeUnavailable: r.includeUnavailable,
    variation: r.variation,
  };
}

export function toItemView(
  item: ClothingItem,
  role: string,
  thumbs: Map<string, string>,
): OutfitItemView {
  return {
    id: item.id,
    name: item.name,
    role,
    slot: item.category.slot,
    color: item.primary_color,
    categoryLabel: item.category.label,
    thumbUrl: thumbs.get(item.thumb_path ?? item.image_path) ?? null,
    status: item.availability_status,
    expectedAvailableAt: item.expected_available_at,
  };
}
