import { colorLabel, FORMALITY_LABEL, OCCASIONS, SEASON_LABEL } from "@/lib/constants/wardrobe";
import { harmonyDescription } from "./color";
import type { Candidate, EngineRequest } from "./types";

/**
 * Rules-based explanation: every sentence is derived from the garment data
 * (name, colour, formality, season). It never mentions anything not in the data.
 */
export function explainCandidate(c: Candidate, req: EngineRequest): { reason: string; tips: string[] } {
  const parts: string[] = [];
  const tips: string[] = [];
  const pick = (slot: string) => c.members.find((m) => m.item.slot === slot)?.item;

  const dress = pick("dress");
  const top = pick("top");
  const bottom = pick("bottom");
  const shoes = pick("shoes");
  const outer = pick("outer");

  if (dress) {
    parts.push(`Ho scelto «${dress.name}» (${colorLabel(dress.primaryColor)}) come pezzo centrale`);
  } else if (top && bottom) {
    const h = harmonyDescription(top.primaryColor, bottom.primaryColor);
    const why =
      h === "tonale"
        ? "un abbinamento tono su tono"
        : h === "neutro"
          ? "un colore neutro che si abbina facilmente"
          : h === "terra"
            ? "due tonalità naturali che si accordano"
            : h === "forte"
              ? "un contrasto deciso"
              : "un contrasto equilibrato";
    parts.push(
      `«${top.name}» (${colorLabel(top.primaryColor)}) e «${bottom.name}» (${colorLabel(bottom.primaryColor)}) creano ${why}`,
    );
  }
  if (shoes) parts.push(`«${shoes.name}» (${colorLabel(shoes.primaryColor)}) completano il look`);
  if (outer) parts.push(`«${outer.name}» aggiunge un livello adatto al clima`);

  const occ = OCCASIONS.find((o) => o.value === req.occasion);
  const avgF = Math.round(c.members.reduce((a, m) => a + m.item.formality, 0) / c.members.length);
  if (occ) parts.push(`il livello di formalità (${FORMALITY_LABEL[avgF]?.toLowerCase()}) è coerente con «${occ.label}»`);
  else if (req.style) parts.push(`lo stile richiesto è «${req.style}»`);
  if (req.season) parts.push(`i capi sono compatibili con la stagione (${SEASON_LABEL[req.season].toLowerCase()})`);

  if (c.unavailableIds.length > 0) {
    tips.push("Contiene capi attualmente non disponibili: è solo una simulazione.");
  }
  const hasAccessory = c.members.some((m) => m.item.slot === "accessory" || m.item.slot === "bag");
  if (!hasAccessory) tips.push("Puoi aggiungere un accessorio dal tuo guardaroba per personalizzarlo.");
  if (!outer && (req.weather === "fresco" || req.weather === "freddo" || req.weather === "pioggia")) {
    tips.push("Non hai un capospalla disponibile adatto: portane uno se possibile.");
  }

  const sentence = parts.join("; ");
  return { reason: sentence.charAt(0).toUpperCase() + sentence.slice(1) + ".", tips: tips.slice(0, 3) };
}
