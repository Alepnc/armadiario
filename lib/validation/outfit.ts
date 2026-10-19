import { z } from "zod";
import { SEASONS } from "@/lib/constants/wardrobe";

const uuid = z.string().uuid();
const colorList = z.array(z.string().max(30)).max(12).default([]);

/** Parameters of a stylist request: everything is optional. */
export const stylistRequestSchema = z.object({
  occasion: z.string().trim().max(60).optional(),
  style: z.string().trim().max(40).optional(),
  season: z.enum(SEASONS).optional(),
  weather: z.string().trim().max(30).optional(),
  timeOfDay: z.string().trim().max(30).optional(),
  desiredColors: colorList,
  avoidColors: colorList,
  formality: z.coerce.number().int().min(1).max(4).optional(),
  mustInclude: z.array(uuid).max(6).default([]),
  exclude: z.array(uuid).max(100).default([]),
  count: z.coerce.number().int().min(1).max(5).default(3),
  note: z.string().trim().max(500).optional(),
  /** Explicit "what if" mode: unavailable garments may appear, flagged. */
  includeUnavailable: z.boolean().default(false),
  /** Changes between "variant" requests so results differ. */
  variation: z.coerce.number().int().min(0).max(1000).default(0),
});
export type StylistRequest = z.infer<typeof stylistRequestSchema>;

/** The model must choose among candidate ids prepared by the backend. */
export const llmSelectionSchema = z.object({
  outfits: z
    .array(
      z.object({
        candidate_id: z.string().min(1).max(20),
        title: z.string().trim().min(1).max(120),
        reason: z.string().trim().min(1).max(1200),
        tips: z.array(z.string().trim().min(1).max(300)).max(4).default([]),
      }),
    )
    .min(1)
    .max(10),
});
export type LlmSelection = z.infer<typeof llmSelectionSchema>;

export const llmIntentSchema = z.object({
  occasion: z.string().max(60).nullable().optional(),
  style: z.string().max(40).nullable().optional(),
  formality: z.number().int().min(1).max(4).nullable().optional(),
  weather: z.string().max(30).nullable().optional(),
  desired_colors: z.array(z.string().max(30)).max(6).default([]),
  avoid_colors: z.array(z.string().max(30)).max(6).default([]),
});
export type LlmIntent = z.infer<typeof llmIntentSchema>;

export const saveOutfitSchema = z.object({
  name: z.string().trim().min(1, "Dai un nome all'outfit").max(120),
  occasion: z.string().trim().max(60).nullable().optional(),
  style: z.string().trim().max(60).nullable().optional(),
  season: z.enum(SEASONS).nullable().optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  tips: z.array(z.string().trim().max(200)).max(5).default([]),
  notes: z.string().trim().max(1000).nullable().optional(),
  is_favorite: z.boolean().default(false),
  source: z.enum(["ai", "rules", "manual"]).default("rules"),
  items: z
    .array(
      z.object({
        item_id: uuid,
        role: z.string().trim().min(1).max(60),
      }),
    )
    .min(1)
    .max(10),
});
export type SaveOutfitInput = z.infer<typeof saveOutfitSchema>;
