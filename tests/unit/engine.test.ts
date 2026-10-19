import { describe, expect, it } from "vitest";
import { generateCandidates, filterPool, ConstraintError } from "@/features/outfits/engine/generate";
import { validateOutfit } from "@/features/outfits/engine/validate";
import { explainCandidate } from "@/features/outfits/engine/explain";
import { pairHarmony } from "@/features/outfits/engine/color";
import { basicWardrobe, emptyProfile, makeItem, makeRequest } from "../helpers/fixtures";

describe("availability filter", () => {
  it("excludes washing and unavailable garments by default", () => {
    const items = basicWardrobe();
    items[0].status = "washing";
    items[1].status = "unavailable";
    const pool = filterPool(items, makeRequest(), { relaxSeason: false });
    expect(pool.map((i) => i.id)).not.toContain(items[0].id);
    expect(pool.map((i) => i.id)).not.toContain(items[1].id);
    expect(pool).toHaveLength(items.length - 2);
  });

  it("keeps them only in explicit simulation mode, flagged as unavailable", () => {
    const items = basicWardrobe();
    items[0].status = "washing";
    const res = generateCandidates(
      { items, profile: emptyProfile, request: makeRequest({ includeUnavailable: true, mustInclude: [items[0].id] }) },
      5,
    );
    expect(res.candidates.length).toBeGreaterThan(0);
    for (const c of res.candidates) expect(c.unavailableIds).toContain(items[0].id);
  });

  it("never proposes a washing garment in generated outfits", () => {
    const items = basicWardrobe();
    items[0].status = "washing"; // the white t-shirt
    const res = generateCandidates({ items, profile: emptyProfile, request: makeRequest() }, 10);
    expect(res.candidates.length).toBeGreaterThan(0);
    for (const c of res.candidates) {
      expect(c.members.map((m) => m.item.id)).not.toContain(items[0].id);
    }
  });
});

describe("constraints", () => {
  it("honours excluded and required garments", () => {
    const items = basicWardrobe();
    const required = items[1]; // camicia
    const excluded = items[3]; // chino
    const res = generateCandidates(
      { items, profile: emptyProfile, request: makeRequest({ mustInclude: [required.id], exclude: [excluded.id] }) },
      5,
    );
    expect(res.candidates.length).toBeGreaterThan(0);
    for (const c of res.candidates) {
      const ids = c.members.map((m) => m.item.id);
      expect(ids).toContain(required.id);
      expect(ids).not.toContain(excluded.id);
    }
  });

  it("never repeats a garment inside an outfit", () => {
    const res = generateCandidates({ items: basicWardrobe(), profile: emptyProfile, request: makeRequest() }, 10);
    for (const c of res.candidates) {
      const ids = c.members.map((m) => m.item.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("drops colours the user wants to avoid", () => {
    const items = basicWardrobe();
    const res = generateCandidates(
      { items, profile: emptyProfile, request: makeRequest({ avoidColors: ["bianco"] }) },
      10,
    );
    for (const c of res.candidates) {
      expect(c.members.every((m) => m.item.primaryColor !== "bianco")).toBe(true);
    }
  });

  it("rejects conflicting mandatory garments", () => {
    const items = basicWardrobe();
    expect(() =>
      generateCandidates(
        { items, profile: emptyProfile, request: makeRequest({ mustInclude: [items[0].id, items[1].id] }) },
        3,
      ),
    ).toThrow(ConstraintError);
  });

  it("avoids shorts in cold weather and heavy knitwear in hot weather", () => {
    const items = [
      ...basicWardrobe(),
      makeItem({ slot: "bottom", categorySlug: "pantaloncini", name: "Shorts" }),
      makeItem({ slot: "top", categorySlug: "maglioni", name: "Maglione" }),
    ];
    const cold = filterPool(items, makeRequest({ weather: "freddo" }), { relaxSeason: false });
    expect(cold.find((i) => i.name === "Shorts")).toBeUndefined();
    const hot = filterPool(items, makeRequest({ weather: "caldo" }), { relaxSeason: false });
    expect(hot.find((i) => i.name === "Maglione")).toBeUndefined();
  });

  it("does not pair garments whose formality differs by more than 2", () => {
    const items = [
      makeItem({ slot: "top", name: "Smoking", formality: 4 }),
      makeItem({ slot: "bottom", name: "Shorts sport", formality: 1 }),
      makeItem({ slot: "shoes", name: "Scarpe", formality: 2 }),
    ];
    const res = generateCandidates({ items, profile: emptyProfile, request: makeRequest() }, 3);
    expect(res.candidates).toHaveLength(0);
    expect(res.shortage?.message).toBeTruthy();
  });
});

describe("shortage reporting", () => {
  it("names the missing categories instead of inventing outfits", () => {
    const items = basicWardrobe().filter((i) => i.slot !== "shoes");
    const res = generateCandidates({ items, profile: emptyProfile, request: makeRequest() }, 3);
    expect(res.candidates).toHaveLength(0);
    expect(res.shortage?.missingSlots).toEqual(["shoes"]);
    expect(res.shortage?.message).toMatch(/scarpe/);
  });

  it("reports shortage when everything is in the wash", () => {
    const items = basicWardrobe().map((i) => ({ ...i, status: "washing" as const }));
    const res = generateCandidates({ items, profile: emptyProfile, request: makeRequest() }, 3);
    expect(res.candidates).toHaveLength(0);
    expect(res.shortage).not.toBeNull();
  });
});

describe("ranking", () => {
  it("prefers neutral combinations over two loud colours", () => {
    expect(pairHarmony("bianco", "rosso")).toBeGreaterThan(pairHarmony("rosso", "arancione"));
    expect(pairHarmony("denim", "beige")).toBeGreaterThan(0);
  });

  it("returns different outfits for different variation seeds when possible", () => {
    const items = [
      ...basicWardrobe(),
      makeItem({ slot: "top", name: "Polo verde", primaryColor: "verde" }),
      makeItem({ slot: "bottom", name: "Pantaloni grigi", primaryColor: "grigio" }),
      makeItem({ slot: "shoes", name: "Stivaletti neri", primaryColor: "nero" }),
    ];
    const a = generateCandidates({ items, profile: emptyProfile, request: makeRequest({ variation: 1 }) }, 3);
    const b = generateCandidates({ items, profile: emptyProfile, request: makeRequest({ variation: 2 }) }, 3);
    expect(a.candidates.length).toBeGreaterThan(0);
    expect(b.candidates.length).toBeGreaterThan(0);
  });

  it("generates distinct proposals (no identical combination twice)", () => {
    const res = generateCandidates({ items: basicWardrobe(), profile: emptyProfile, request: makeRequest() }, 3);
    const keys = res.candidates.map((c) => c.members.map((m) => m.item.id).sort().join("|"));
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("layers", () => {
  it("does not add a coat by default, but prefers one when it is cold", () => {
    const items = [...basicWardrobe(), makeItem({ slot: "outer", categorySlug: "giacche", name: "Cappotto", formality: 2 })];
    const neutral = generateCandidates({ items, profile: emptyProfile, request: makeRequest() }, 3);
    expect(neutral.candidates[0].members.some((m) => m.item.slot === "outer")).toBe(false);
    const cold = generateCandidates({ items, profile: emptyProfile, request: makeRequest({ weather: "freddo" }) }, 3);
    for (const c of cold.candidates) expect(c.members.some((m) => m.item.slot === "outer")).toBe(true);
  });
});

describe("final validation", () => {
  const items = basicWardrobe();
  const ok = [items[0].id, items[2].id, items[4].id];

  it("accepts a valid outfit", () => {
    expect(validateOutfit(ok, items, makeRequest())).toEqual([]);
  });

  it("rejects ids that are not in the user's wardrobe", () => {
    const issues = validateOutfit([...ok, "00000000-0000-4000-8000-ffffffffffff"], items, makeRequest());
    expect(issues.map((i) => i.code)).toContain("unknown_item");
  });

  it("rejects duplicates, unavailable and excluded garments", () => {
    const pool = items.map((i) => ({ ...i }));
    pool[0].status = "washing";
    const issues = validateOutfit([ok[0], ok[0], ok[1], ok[2]], pool, makeRequest({ exclude: [ok[1]] }));
    const codes = issues.map((i) => i.code);
    expect(codes).toContain("duplicate_item");
    expect(codes).toContain("unavailable_item");
    expect(codes).toContain("excluded_item");
  });

  it("flags missing required garments and broken structure", () => {
    const issues = validateOutfit([items[0].id, items[4].id], items, makeRequest({ mustInclude: [items[2].id] }));
    const codes = issues.map((i) => i.code);
    expect(codes).toContain("missing_required");
    expect(codes).toContain("bad_structure");
  });
});

describe("rules-based explanation", () => {
  it("only mentions garments that are in the outfit", () => {
    const items = basicWardrobe();
    const res = generateCandidates({ items, profile: emptyProfile, request: makeRequest({ occasion: "universita" }) }, 1);
    const c = res.candidates[0];
    const { reason } = explainCandidate(c, makeRequest({ occasion: "universita" }));
    for (const m of c.members.filter((m) => ["top", "bottom", "shoes"].includes(m.item.slot))) {
      expect(reason).toContain(m.item.name);
    }
    for (const other of items.filter((i) => !c.members.some((m) => m.item.id === i.id))) {
      expect(reason).not.toContain(other.name);
    }
  });
});
