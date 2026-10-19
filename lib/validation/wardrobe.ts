import { z } from "zod";
import { AVAILABILITY, COLOR_VALUES, FITS, SEASONS } from "@/lib/constants/wardrobe";

const trimmed = (max: number) => z.string().trim().max(max);
const optionalText = (max: number) =>
  trimmed(max)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional()
    .transform((v) => v ?? null);

export const colorSchema = z.string().refine((c) => COLOR_VALUES.includes(c), "Colore non valido");

/** Storage paths must live in the caller's own folder: "<uid>/<file>". */
export function ownedPathSchema(userId: string) {
  return z
    .string()
    .max(300)
    .refine(
      (p) => p.startsWith(`${userId}/`) && !p.includes("..") && !p.includes("//"),
      "Percorso immagine non valido",
    );
}

export const clothingItemInputSchema = z.object({
  name: trimmed(120).min(1, "Inserisci un nome"),
  category_id: z.string().uuid("Seleziona una categoria"),
  subcategory: optionalText(60),
  primary_color: colorSchema,
  secondary_colors: z.array(colorSchema).max(4).default([]),
  seasons: z.array(z.enum(SEASONS)).default([]),
  styles: z.array(trimmed(30).min(1)).max(6).default([]),
  material: optionalText(60),
  pattern: trimmed(30).min(1).default("solid"),
  formality: z.coerce.number().int().min(1).max(4).default(2),
  fit: z.enum(FITS).nullable().optional().transform((v) => v ?? null),
  availability_status: z.enum(AVAILABILITY).default("available"),
  expected_available_at: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional()
    .transform((v) => v ?? null),
  is_favorite: z.boolean().default(false),
  notes: optionalText(1000),
});
export type ClothingItemInput = z.infer<typeof clothingItemInputSchema>;

export const availabilityUpdateSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(AVAILABILITY),
  expected_available_at: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
});

export const wardrobeFilterSchema = z.object({
  q: z.string().trim().max(80).optional(),
  category: z.string().uuid().optional(),
  color: colorSchema.optional(),
  season: z.enum(SEASONS).optional(),
  style: z.string().max(30).optional(),
  status: z.enum(AVAILABILITY).optional(),
  sort: z.enum(["recent", "name", "favorites"]).default("recent"),
  view: z.enum(["grid", "list"]).default("grid"),
  limit: z.coerce.number().int().min(12).max(240).default(24),
});
export type WardrobeFilters = z.infer<typeof wardrobeFilterSchema>;

/** What the multimodal model is allowed to suggest about a garment. */
export const garmentAnalysisSchema = z.object({
  name: trimmed(120),
  category_slug: trimmed(40),
  subcategory: trimmed(60).nullable().optional(),
  primary_color: trimmed(30),
  secondary_colors: z.array(trimmed(30)).max(4).default([]),
  seasons: z.array(z.string()).default([]),
  styles: z.array(z.string()).default([]),
  material: trimmed(60).nullable().optional(),
  pattern: trimmed(30).default("solid"),
  formality: z.number().int().min(1).max(4).default(2),
  fit: z.string().nullable().optional(),
  confidence: z.number().min(0).max(1).optional(),
});
export type GarmentAnalysis = z.infer<typeof garmentAnalysisSchema>;
