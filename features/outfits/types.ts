import type { Availability, Slot } from "@/lib/constants/wardrobe";

/** Serializable garment info shown inside a proposal or saved outfit. */
export interface OutfitItemView {
  /** null when the garment was deleted after the outfit was saved. */
  id: string | null;
  name: string;
  role: string;
  slot: Slot | null;
  color: string | null;
  categoryLabel: string | null;
  thumbUrl: string | null;
  status: Availability | "deleted";
  expectedAvailableAt: string | null;
}

export interface ProposalView {
  /** Client-side key; proposals are not persisted until saved. */
  key: string;
  title: string;
  reason: string;
  tips: string[];
  /** 'ai' = model chose/explained among backend-validated candidates. */
  source: "ai" | "rules";
  items: OutfitItemView[];
  hasUnavailable: boolean;
}

export interface GenerationResponse {
  proposals: ProposalView[];
  mode: "ai" | "rules";
  /** Why AI was not used, when relevant (not configured, no consent, quota…). */
  modeNote: string | null;
  /** True when the model was shown the garment photos while choosing. */
  usedPhotos: boolean;
  shortage: { message: string; missing: string[] } | null;
  notes: string[];
}
