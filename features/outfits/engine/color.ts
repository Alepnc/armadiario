import { COLOR_BY_VALUE, type ColorFamily } from "@/lib/constants/wardrobe";

function family(color: string): ColorFamily {
  return COLOR_BY_VALUE.get(color)?.family ?? "neutral";
}

/**
 * Harmony between two colours, roughly -10 … +10.
 * Neutrals combine with everything, earth tones with each other and with
 * denim, loud colours should not compete.
 */
export function pairHarmony(a: string, b: string): number {
  if (a === b) return a === "multicolore" ? -4 : 5; // tonal / monochrome
  if (a === "multicolore" || b === "multicolore") {
    const other = a === "multicolore" ? b : a;
    return family(other) === "neutral" ? 4 : -6;
  }
  const fa = family(a);
  const fb = family(b);
  if (fa === "neutral" || fb === "neutral") return 8;
  if ((a === "denim" && fb === "earth") || (b === "denim" && fa === "earth")) return 7;
  if (fa === "earth" && fb === "earth") return 6;
  if (fa === "bright" && fb === "bright") return -8;
  if (fa === "bright" || fb === "bright") return fa === "earth" || fb === "earth" ? 1 : -3;
  if (fa === "cool" && fb === "cool") return 3;
  if (fa === "warm" && fb === "warm") return 3;
  if (fa === "earth" || fb === "earth") return 4;
  return 0; // warm vs cool
}

export function isLoud(color: string): boolean {
  return family(color) === "bright";
}

export function isNeutral(color: string): boolean {
  return family(color) === "neutral";
}

export function harmonyDescription(a: string, b: string): "tonale" | "neutro" | "terra" | "contrasto" | "forte" {
  if (a === b) return "tonale";
  const fa = family(a);
  const fb = family(b);
  if (fa === "neutral" || fb === "neutral") return "neutro";
  if (fa === "earth" && fb === "earth") return "terra";
  if (fa === "bright" && fb === "bright") return "forte";
  return "contrasto";
}
