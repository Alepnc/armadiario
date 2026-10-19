import { z } from "zod";
import { COLOR_VALUES, FITS } from "@/lib/constants/wardrobe";

const colorList = z
  .array(z.string().refine((c) => COLOR_VALUES.includes(c), "Colore non valido"))
  .max(12)
  .default([]);

export const profileInputSchema = z.object({
  display_name: z
    .string()
    .trim()
    .max(60)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional()
    .transform((v) => v ?? null),
  height_cm: z
    .union([z.coerce.number().int().min(80).max(250), z.literal(""), z.null()])
    .optional()
    .transform((v) => (v === "" || v === null || v === undefined ? null : v)),
  style_preferences: z.array(z.string().trim().min(1).max(30)).max(8).default([]),
  sizes: z.record(z.string().max(20), z.string().trim().max(20)).default({}),
  favorite_colors: colorList,
  avoided_colors: colorList,
  fit_preference: z
    .enum(FITS)
    .nullable()
    .optional()
    .transform((v) => v ?? null),
  notes: z
    .string()
    .trim()
    .max(1000)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional()
    .transform((v) => v ?? null),
});
export type ProfileInput = z.infer<typeof profileInputSchema>;

export const authCredentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email("Email non valida"),
  password: z.string().min(8, "La password deve avere almeno 8 caratteri").max(72),
});

export const registerSchema = authCredentialsSchema.extend({
  display_name: z.string().trim().max(60).optional(),
});
