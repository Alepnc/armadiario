export const AVAILABILITY = ["available", "washing", "unavailable"] as const;
export type Availability = (typeof AVAILABILITY)[number];

export const AVAILABILITY_LABEL: Record<Availability, string> = {
  available: "Disponibile",
  washing: "In lavaggio",
  unavailable: "Non disponibile",
};

export const SEASONS = ["spring", "summer", "autumn", "winter"] as const;
export type Season = (typeof SEASONS)[number];
export const SEASON_LABEL: Record<Season, string> = {
  spring: "Primavera",
  summer: "Estate",
  autumn: "Autunno",
  winter: "Inverno",
};

export const STYLES = [
  "casual",
  "streetwear",
  "elegante",
  "sportivo",
  "minimal",
  "smart casual",
  "classico",
  "boho",
] as const;

export const FITS = ["slim", "regular", "relaxed", "oversize"] as const;
export type Fit = (typeof FITS)[number];
export const FIT_LABEL: Record<Fit, string> = {
  slim: "Aderente",
  regular: "Regolare",
  relaxed: "Comoda",
  oversize: "Oversize",
};

export const PATTERNS = [
  "solid",
  "righe",
  "quadri",
  "fantasia",
  "pois",
  "floreale",
  "stampa",
  "mimetico",
] as const;
export const PATTERN_LABEL: Record<string, string> = {
  solid: "Tinta unita",
  righe: "Righe",
  quadri: "Quadri",
  fantasia: "Fantasia",
  pois: "Pois",
  floreale: "Floreale",
  stampa: "Stampa",
  mimetico: "Mimetico",
};

export const FORMALITY_LEVELS = [1, 2, 3, 4] as const;
export const FORMALITY_LABEL: Record<number, string> = {
  1: "Molto informale",
  2: "Informale",
  3: "Smart / business",
  4: "Formale",
};

/**
 * Fixed colour palette. `family` drives the colour-compatibility rules in the
 * outfit engine; `hex` is used only for swatches.
 */
export type ColorFamily = "neutral" | "earth" | "warm" | "cool" | "bright";
export interface ColorDef {
  value: string;
  label: string;
  hex: string;
  family: ColorFamily;
}

export const COLORS: readonly ColorDef[] = [
  { value: "nero", label: "Nero", hex: "#1c1b1a", family: "neutral" },
  { value: "bianco", label: "Bianco", hex: "#f7f5f0", family: "neutral" },
  { value: "grigio", label: "Grigio", hex: "#9a9a96", family: "neutral" },
  { value: "antracite", label: "Antracite", hex: "#44464a", family: "neutral" },
  { value: "beige", label: "Beige", hex: "#d9c9ae", family: "earth" },
  { value: "panna", label: "Panna", hex: "#efe6d2", family: "neutral" },
  { value: "cammello", label: "Cammello", hex: "#b88a54", family: "earth" },
  { value: "marrone", label: "Marrone", hex: "#6b4a34", family: "earth" },
  { value: "kaki", label: "Kaki", hex: "#a79a6b", family: "earth" },
  { value: "oliva", label: "Oliva", hex: "#6b6f3a", family: "earth" },
  { value: "navy", label: "Blu navy", hex: "#1f2d4d", family: "neutral" },
  { value: "denim", label: "Denim", hex: "#4b6a93", family: "cool" },
  { value: "azzurro", label: "Azzurro", hex: "#8fb4d9", family: "cool" },
  { value: "verde", label: "Verde", hex: "#3f7a52", family: "cool" },
  { value: "turchese", label: "Turchese", hex: "#2f9aa0", family: "cool" },
  { value: "viola", label: "Viola", hex: "#6c4a8a", family: "cool" },
  { value: "rosso", label: "Rosso", hex: "#b52b2b", family: "bright" },
  { value: "bordeaux", label: "Bordeaux", hex: "#6d1f2f", family: "warm" },
  { value: "arancione", label: "Arancione", hex: "#d9702b", family: "bright" },
  { value: "giallo", label: "Giallo", hex: "#e2bd36", family: "bright" },
  { value: "rosa", label: "Rosa", hex: "#e3a2b3", family: "warm" },
  { value: "multicolore", label: "Multicolore", hex: "#c9a0dc", family: "bright" },
] as const;

export const COLOR_BY_VALUE = new Map(COLORS.map((c) => [c.value, c]));
export const COLOR_VALUES = COLORS.map((c) => c.value);

export function colorLabel(value: string): string {
  return COLOR_BY_VALUE.get(value)?.label ?? value;
}

export const OCCASIONS = [
  { value: "universita", label: "Università", formality: 1 },
  { value: "lavoro", label: "Lavoro", formality: 3 },
  { value: "uscita", label: "Uscita informale", formality: 2 },
  { value: "appuntamento", label: "Appuntamento", formality: 3 },
  { value: "festa", label: "Festa", formality: 2 },
  { value: "evento", label: "Evento elegante", formality: 4 },
  { value: "sport", label: "Sport", formality: 1 },
] as const;

export const TIMES_OF_DAY = [
  { value: "mattina", label: "Mattina" },
  { value: "pomeriggio", label: "Pomeriggio" },
  { value: "sera", label: "Sera" },
] as const;

export const WEATHER = [
  { value: "caldo", label: "Caldo (>25°)" },
  { value: "mite", label: "Mite (15–25°)" },
  { value: "fresco", label: "Fresco (8–15°)" },
  { value: "freddo", label: "Freddo (<8°)" },
  { value: "pioggia", label: "Pioggia" },
] as const;

export type Slot = "top" | "bottom" | "dress" | "outer" | "shoes" | "accessory" | "bag" | "other";
export const SLOT_LABEL: Record<Slot, string> = {
  top: "Parte superiore",
  bottom: "Parte inferiore",
  dress: "Abito",
  outer: "Capospalla",
  shoes: "Scarpe",
  accessory: "Accessorio",
  bag: "Borsa",
  other: "Altro",
};
