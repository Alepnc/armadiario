import type { Season } from "@/lib/constants/wardrobe";
import { OCCASIONS } from "@/lib/constants/wardrobe";
import type { EngineItem, EngineRequest } from "./types";

export type Weather = "caldo" | "mite" | "fresco" | "freddo" | "pioggia";

export function seasonToWeather(season: Season | undefined): Weather | undefined {
  switch (season) {
    case "summer":
      return "caldo";
    case "winter":
      return "freddo";
    case "autumn":
      return "fresco";
    case "spring":
      return "mite";
    default:
      return undefined;
  }
}

export function effectiveWeather(req: EngineRequest): Weather | undefined {
  const w = req.weather as Weather | undefined;
  if (w && ["caldo", "mite", "fresco", "freddo", "pioggia"].includes(w)) return w;
  return seasonToWeather(req.season);
}

/** Target formality: explicit request > occasion default > undefined. */
export function targetFormality(req: EngineRequest): number | undefined {
  if (req.formality) return req.formality;
  const occ = OCCASIONS.find((o) => o.value === req.occasion);
  return occ?.formality;
}

const HEAVY = new Set(["maglioni", "felpe"]);

/**
 * Hard "obviously wrong" rules for built-in categories (custom categories
 * are only governed by the season/formality data the user provided).
 */
export function isWeatherIncompatible(item: EngineItem, weather: Weather | undefined): boolean {
  if (!weather) return false;
  if (weather === "freddo" && item.categorySlug === "pantaloncini") return true;
  if (weather === "caldo" && (HEAVY.has(item.categorySlug) || item.slot === "outer")) return true;
  return false;
}

export function isSeasonIncompatible(item: EngineItem, season: Season | undefined): boolean {
  if (!season || item.seasons.length === 0) return false;
  return !item.seasons.includes(season);
}

/** Human-readable role of a garment inside an outfit. */
export const ROLE_BY_SLOT: Record<string, string> = {
  top: "Parte superiore",
  bottom: "Parte inferiore",
  dress: "Abito",
  outer: "Capospalla",
  shoes: "Scarpe",
  accessory: "Accessorio",
  bag: "Borsa",
  other: "Complemento",
};
