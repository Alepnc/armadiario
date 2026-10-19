import { COLOR_BY_VALUE, COLORS, FITS, PATTERNS, SEASONS, STYLES, type Fit, type Season } from "@/lib/constants/wardrobe";
import type { Category } from "@/types/db";
import type { GarmentAnalysis } from "@/lib/validation/wardrobe";

export interface ItemSuggestion {
  name: string;
  category_id: string | null;
  subcategory: string | null;
  primary_color: string | null;
  secondary_colors: string[];
  seasons: Season[];
  styles: string[];
  material: string | null;
  pattern: string;
  formality: number;
  fit: Fit | null;
}

function normalizeColor(raw: string): string | null {
  const v = raw.trim().toLowerCase();
  if (COLOR_BY_VALUE.has(v)) return v;
  const byLabel = COLORS.find((c) => c.label.toLowerCase() === v);
  return byLabel?.value ?? null;
}

/**
 * Turns raw model output into values the form accepts. Anything outside the
 * allowed vocabularies is dropped (the user fills it in) rather than guessed.
 */
export function normalizeAnalysis(a: GarmentAnalysis, categories: Category[]): ItemSuggestion {
  const slug = a.category_slug.trim().toLowerCase();
  const category = categories.find((c) => c.slug === slug) ?? null;
  const primary = normalizeColor(a.primary_color);
  const secondary = [...new Set(a.secondary_colors.map(normalizeColor).filter((c): c is string => Boolean(c)))].filter(
    (c) => c !== primary,
  );
  const styleSet = new Set<string>(STYLES);
  return {
    name: a.name.trim().slice(0, 120),
    category_id: category?.id ?? null,
    subcategory: a.subcategory?.trim() || null,
    primary_color: primary,
    secondary_colors: secondary.slice(0, 4),
    seasons: a.seasons.filter((s): s is Season => (SEASONS as readonly string[]).includes(s)),
    styles: a.styles.map((s) => s.toLowerCase()).filter((s) => styleSet.has(s)).slice(0, 6),
    material: a.material?.trim() || null,
    pattern: (PATTERNS as readonly string[]).includes(a.pattern) ? a.pattern : "solid",
    formality: a.formality,
    fit: a.fit && (FITS as readonly string[]).includes(a.fit) ? (a.fit as Fit) : null,
  };
}
