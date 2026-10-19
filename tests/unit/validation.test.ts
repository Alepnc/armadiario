import { describe, expect, it } from "vitest";
import { clothingItemInputSchema, garmentAnalysisSchema, ownedPathSchema, wardrobeFilterSchema } from "@/lib/validation/wardrobe";
import { llmSelectionSchema, saveOutfitSchema, stylistRequestSchema } from "@/lib/validation/outfit";
import { profileInputSchema } from "@/lib/validation/profile";
import { normalizeAnalysis } from "@/features/wardrobe/analysis";
import { detectImageMime, hammingDistance } from "@/lib/images/detect";
import type { Category } from "@/types/db";

const uuid = "11111111-1111-4111-8111-111111111111";

describe("garment metadata validation", () => {
  const valid = { name: "Jeans", category_id: uuid, primary_color: "denim" };

  it("accepts a minimal garment and applies safe defaults", () => {
    const r = clothingItemInputSchema.parse(valid);
    expect(r).toMatchObject({ availability_status: "available", pattern: "solid", formality: 2, seasons: [], is_favorite: false, fit: null });
  });

  it.each([
    ["empty name", { ...valid, name: "   " }],
    ["unknown colour", { ...valid, primary_color: "fucsia-neon" }],
    ["bad category id", { ...valid, category_id: "jeans" }],
    ["unknown status", { ...valid, availability_status: "lost" }],
    ["unknown season", { ...valid, seasons: ["monsoon"] }],
    ["formality out of range", { ...valid, formality: 9 }],
    ["bad return date", { ...valid, expected_available_at: "domani" }],
    ["too many secondary colours", { ...valid, secondary_colors: ["nero", "bianco", "grigio", "beige", "rosso"] }],
  ])("rejects %s", (_label, input) => {
    expect(clothingItemInputSchema.safeParse(input).success).toBe(false);
  });

  it("only accepts storage paths inside the caller's own folder", () => {
    const schema = ownedPathSchema("user-1");
    expect(schema.safeParse("user-1/items/a.webp").success).toBe(true);
    expect(schema.safeParse("user-2/items/a.webp").success).toBe(false);
    expect(schema.safeParse("user-1/../user-2/a.webp").success).toBe(false);
    expect(schema.safeParse("user-1//x").success).toBe(false);
  });

  it("clamps wardrobe filters to sane values", () => {
    expect(wardrobeFilterSchema.parse({}).limit).toBe(24);
    expect(wardrobeFilterSchema.safeParse({ limit: "100000" }).success).toBe(false);
    expect(wardrobeFilterSchema.safeParse({ status: "washing", sort: "name" }).success).toBe(true);
    expect(wardrobeFilterSchema.safeParse({ status: "x" }).success).toBe(false);
  });
});

describe("AI output validation", () => {
  const categories = [{ id: uuid, slug: "jeans", label: "Jeans", slot: "bottom", user_id: null, sort_order: 1 }] as Category[];

  it("drops vocabulary the app does not know instead of trusting it", () => {
    const raw = garmentAnalysisSchema.parse({
      name: "Jeans blu",
      category_slug: "jeans",
      primary_color: "Denim",
      secondary_colors: ["Blu elettrico", "bianco", "denim"],
      seasons: ["winter", "monsoon"],
      styles: ["casual", "futurista"],
      pattern: "tartan-spaziale",
      formality: 2,
      fit: "super-skinny",
    });
    const s = normalizeAnalysis(raw, categories);
    expect(s.category_id).toBe(uuid);
    expect(s.primary_color).toBe("denim");
    expect(s.secondary_colors).toEqual(["bianco"]); // unknown dropped, duplicate of primary dropped
    expect(s.seasons).toEqual(["winter"]);
    expect(s.styles).toEqual(["casual"]);
    expect(s.pattern).toBe("solid");
    expect(s.fit).toBeNull();
  });

  it("leaves an unknown category/colour empty so the user must choose", () => {
    const s = normalizeAnalysis(garmentAnalysisSchema.parse({ name: "?", category_slug: "teletrasporto", primary_color: "ultravioletto" }), categories);
    expect(s.category_id).toBeNull();
    expect(s.primary_color).toBeNull();
  });

  it("rejects structurally invalid model responses", () => {
    expect(garmentAnalysisSchema.safeParse({ name: "x" }).success).toBe(false);
    expect(garmentAnalysisSchema.safeParse({ name: "x", category_slug: "a", primary_color: "b", formality: 10 }).success).toBe(false);
    expect(llmSelectionSchema.safeParse({ outfits: [] }).success).toBe(false);
    expect(llmSelectionSchema.safeParse({ outfits: [{ candidate_id: "c1", title: "", reason: "x" }] }).success).toBe(false);
    expect(llmSelectionSchema.safeParse({ outfits: [{ candidate_id: "c1", title: "ok", reason: "x".repeat(1201) }] }).success).toBe(false);
    expect(llmSelectionSchema.safeParse({ outfits: [{ candidate_id: "c1", title: "ok", reason: "bene", tips: [] }] }).success).toBe(true);
  });
});

describe("outfit request / save validation", () => {
  it("every stylist parameter is optional", () => {
    expect(stylistRequestSchema.parse({})).toMatchObject({ count: 3, includeUnavailable: false, mustInclude: [], exclude: [] });
  });
  it("limits proposals and rejects foreign-looking ids", () => {
    expect(stylistRequestSchema.safeParse({ count: 50 }).success).toBe(false);
    expect(stylistRequestSchema.safeParse({ mustInclude: ["../etc/passwd"] }).success).toBe(false);
  });
  it("requires a name and at least one garment to save an outfit", () => {
    expect(saveOutfitSchema.safeParse({ name: "", items: [{ item_id: uuid, role: "x" }] }).success).toBe(false);
    expect(saveOutfitSchema.safeParse({ name: "ok", items: [] }).success).toBe(false);
    expect(saveOutfitSchema.safeParse({ name: "ok", items: [{ item_id: uuid, role: "x" }] }).success).toBe(true);
  });
});

describe("profile validation", () => {
  it("treats everything as optional and normalises empty strings", () => {
    const p = profileInputSchema.parse({ display_name: "", height_cm: "", notes: "" });
    expect(p).toMatchObject({ display_name: null, height_cm: null, notes: null, style_preferences: [] });
  });
  it("bounds height and colour lists", () => {
    expect(profileInputSchema.safeParse({ height_cm: 20 }).success).toBe(false);
    expect(profileInputSchema.safeParse({ favorite_colors: ["nero", "inesistente"] }).success).toBe(false);
    expect(profileInputSchema.parse({ height_cm: "178" }).height_cm).toBe(178);
  });
});

describe("image content detection", () => {
  it("identifies images from magic bytes, not names", () => {
    const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
    const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
    const webp = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
    expect(detectImageMime(jpeg)).toBe("image/jpeg");
    expect(detectImageMime(png)).toBe("image/png");
    expect(detectImageMime(webp)).toBe("image/webp");
    expect(detectImageMime(new TextEncoder().encode("<html><script>alert(1)</script></html>"))).toBeNull();
    expect(detectImageMime(new TextEncoder().encode("GIF89a......"))).toBeNull();
  });
  it("measures near-duplicate distance", () => {
    expect(hammingDistance("0000000000000000", "0000000000000000")).toBe(0);
    expect(hammingDistance("000000000000000f", "0000000000000000")).toBe(4);
    expect(hammingDistance("00", "0000")).toBe(Number.POSITIVE_INFINITY);
  });
});
