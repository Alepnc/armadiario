import type { Availability, Fit, Season, Slot } from "@/lib/constants/wardrobe";

export interface Category {
  id: string;
  user_id: string | null;
  slug: string;
  label: string;
  slot: Slot;
  sort_order: number;
}

export interface Profile {
  id: string;
  display_name: string | null;
  avatar_path: string | null;
  tryon_photo_path: string | null;
  height_cm: number | null;
  style_preferences: string[];
  sizes: Record<string, string>;
  favorite_colors: string[];
  avoided_colors: string[];
  fit_preference: Fit | null;
  notes: string | null;
  ai_consent_at: string | null;
  tryon_consent_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ClothingItemRow {
  id: string;
  user_id: string;
  name: string;
  category_id: string;
  subcategory: string | null;
  primary_color: string;
  secondary_colors: string[];
  seasons: Season[];
  styles: string[];
  material: string | null;
  pattern: string;
  formality: number;
  fit: Fit | null;
  image_path: string;
  thumb_path: string | null;
  image_hash: string | null;
  availability_status: Availability;
  expected_available_at: string | null;
  is_favorite: boolean;
  notes: string | null;
  ai_analysis: unknown;
  created_at: string;
  updated_at: string;
}

/** Item joined with its category (what the app mostly works with). */
export interface ClothingItem extends ClothingItemRow {
  category: Pick<Category, "id" | "slug" | "label" | "slot">;
}

export interface OutfitRow {
  id: string;
  user_id: string;
  name: string;
  occasion: string | null;
  style: string | null;
  season: Season | null;
  description: string | null;
  tips: string[];
  notes: string | null;
  is_favorite: boolean;
  source: "ai" | "rules" | "manual" | "duplicate";
  created_at: string;
  updated_at: string;
}

export interface OutfitItemRow {
  id: string;
  outfit_id: string;
  clothing_item_id: string | null;
  role: string;
  position: number;
  item_name_snapshot: string;
}

export type GenerationStatus = "pending" | "processing" | "completed" | "failed";

export interface GeneratedImageRow {
  id: string;
  user_id: string;
  outfit_id: string;
  image_path: string | null;
  source_photo_path: string;
  provider: string;
  generation_status: GenerationStatus;
  error_code: string | null;
  job_state: Record<string, unknown>;
  input_hash: string;
  duration_ms: number | null;
  is_saved: boolean;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}
