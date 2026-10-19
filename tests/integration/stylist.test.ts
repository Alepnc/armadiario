import sharp from "sharp";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { OutfitLanguageModel, StructuredRequest } from "@/lib/ai/types";
import { addItem, createTestUser, deleteTestUser, integrationEnabled, type TestUser } from "../helpers/supabase";

// Provider and Next.js request-scoped APIs are replaced with controllable fakes.
const state: { model: OutfitLanguageModel | null; client: TestUser["client"] | null; userId: string } = {
  model: null,
  client: null,
  userId: "",
};
vi.mock("@/lib/ai/registry", () => ({
  getLanguageModel: () => state.model,
  getGarmentAnalyzer: () => null,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/security/auth", () => ({
  AuthError: class AuthError extends Error {},
  getUserOrThrow: async () => ({ user: { id: state.userId }, supabase: state.client }),
  requireUser: async () => ({ user: { id: state.userId }, supabase: state.client }),
}));

import { stylistRequestSchema } from "@/lib/validation/outfit";
import { generateOutfits } from "@/features/outfits/service";
import { saveOutfitAction, duplicateOutfitAction, deleteOutfitAction } from "@/features/outfits/actions";
import { deleteItemAction, setAvailabilityAction } from "@/features/wardrobe/actions";
import { getOutfit } from "@/features/outfits/queries";
import type { ServerSupabase } from "@/lib/supabase/server";

const req = (over: Record<string, unknown> = {}) => stylistRequestSchema.parse({ count: 2, ...over });

describe.skipIf(!integrationEnabled)("outfit pipeline with a real database and fake AI providers", () => {
  let u: TestUser;
  let other: TestUser;
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    u = await createTestUser("stylist");
    other = await createTestUser("other");
    state.client = u.client;
    state.userId = u.id;
    ids.tee = await addItem(u, "t-shirt", "T-shirt bianca", { primary_color: "bianco" });
    ids.shirt = await addItem(u, "camicie", "Camicia azzurra", { primary_color: "azzurro", formality: 3 });
    ids.jeans = await addItem(u, "jeans", "Jeans denim", { primary_color: "denim" });
    ids.chino = await addItem(u, "pantaloni", "Chino beige", { primary_color: "beige" });
    ids.sneakers = await addItem(u, "scarpe", "Sneakers bianche", { primary_color: "bianco" });
    ids.loafers = await addItem(u, "scarpe", "Mocassini", { primary_color: "marrone", formality: 3 });
    ids.foreign = await addItem(other, "jeans", "Jeans di un altro", { primary_color: "nero" });
  });

  afterAll(async () => {
    await Promise.all([u && deleteTestUser(u), other && deleteTestUser(other)]);
  });

  beforeEach(async () => {
    state.model = null;
    state.client = u.client;
    state.userId = u.id;
    await u.client.from("clothing_items").update({ availability_status: "available" }).eq("user_id", u.id);
    await u.client.from("profiles").update({ ai_consent_at: null, ai_vision_consent_at: null }).eq("id", u.id);
    vi.unstubAllEnvs();
  });

  const asServer = () => u.client as unknown as ServerSupabase;
  const idsOf = (p: { items: Array<{ id: string | null }> }) => p.items.map((i) => i.id);

  it("rules mode: proposes only the user's available garments and says AI is not used", async () => {
    const res = await generateOutfits(asServer(), u.id, req());
    expect(res.mode).toBe("rules");
    expect(res.modeNote).toMatch(/non è configurata/);
    expect(res.proposals.length).toBeGreaterThan(0);
    for (const p of res.proposals) {
      expect(idsOf(p)).not.toContain(ids.foreign);
      expect(p.reason.length).toBeGreaterThan(10);
    }
  });

  it("never proposes a garment set to 'washing', and reflects the change immediately", async () => {
    await setAvailabilityAction({ id: ids.tee, status: "washing" });
    await setAvailabilityAction({ id: ids.shirt, status: "washing" });
    const res = await generateOutfits(asServer(), u.id, req({ count: 5 }));
    expect(res.proposals.length).toBe(0);
    expect(res.shortage?.message).toMatch(/superiore/);
    await setAvailabilityAction({ id: ids.shirt, status: "available" });
    const again = await generateOutfits(asServer(), u.id, req({ count: 5 }));
    for (const p of again.proposals) expect(idsOf(p)).not.toContain(ids.tee);
    expect(again.proposals.length).toBeGreaterThan(0);
  });

  it("reports missing categories when no shoes are available", async () => {
    await setAvailabilityAction({ id: ids.sneakers, status: "washing" });
    await setAvailabilityAction({ id: ids.loafers, status: "unavailable" });
    const res = await generateOutfits(asServer(), u.id, req());
    expect(res.proposals).toHaveLength(0);
    expect(res.shortage?.missing).toContain("Scarpe");
  });

  it("refuses a mandatory garment that is not available, and one owned by someone else", async () => {
    await setAvailabilityAction({ id: ids.chino, status: "washing" });
    await expect(generateOutfits(asServer(), u.id, req({ mustInclude: [ids.chino] }))).rejects.toThrow(/non è disponibile/);
    await expect(generateOutfits(asServer(), u.id, req({ mustInclude: [ids.foreign] }))).rejects.toThrow(/non esiste/);
  });

  it("simulation mode includes unavailable garments but flags them", async () => {
    await setAvailabilityAction({ id: ids.chino, status: "washing" });
    const res = await generateOutfits(asServer(), u.id, req({ includeUnavailable: true, mustInclude: [ids.chino] }));
    expect(res.proposals.length).toBeGreaterThan(0);
    for (const p of res.proposals) {
      expect(p.hasUnavailable).toBe(true);
      expect(p.items.find((i) => i.id === ids.chino)?.status).toBe("washing");
    }
  });

  it("AI mode: model only chooses among validated candidates and explains", async () => {
    await u.client.from("profiles").update({ ai_consent_at: new Date().toISOString() }).eq("id", u.id);
    const seen: StructuredRequest<unknown>[] = [];
    state.model = {
      name: "fake",
      async complete<T>(r: StructuredRequest<T>) {
        seen.push(r as StructuredRequest<unknown>);
        const value = r.parse({ outfits: [{ candidate_id: "c1", title: "Look università", reason: "Scelta coerente con i dati.", tips: [] }] });
        return { value, usage: { provider: "fake", model: "fake-1", durationMs: 1 } };
      },
    };
    const res = await generateOutfits(asServer(), u.id, req({ count: 1 }));
    expect(res.mode).toBe("ai");
    expect(res.proposals[0].title).toBe("Look università");
    expect(res.proposals[0].source).toBe("ai");
    // The prompt carries candidate ids and garment data, never database ids.
    const prompt = seen.at(-1)!.user;
    expect(prompt).toContain('"id":"c1"');
    for (const real of Object.values(ids)) expect(prompt).not.toContain(real);
    // Quota/cost tracking recorded without personal content.
    const { data } = await u.client.from("ai_usage").select("operation,provider,success").eq("operation", "compose_outfit");
    expect(data?.some((r) => r.provider === "fake" && r.success)).toBe(true);
  });

  it("AI mode: invalid model output (unknown candidate) falls back to rules after a controlled retry", async () => {
    await u.client.from("profiles").update({ ai_consent_at: new Date().toISOString() }).eq("id", u.id);
    let calls = 0;
    state.model = {
      name: "fake",
      async complete<T>(r: StructuredRequest<T>) {
        calls++;
        const value = r.parse({ outfits: [{ candidate_id: "c999", title: "Inventato", reason: "x", tips: [] }] });
        return { value, usage: { provider: "fake", model: "fake-1", durationMs: 1 } };
      },
    };
    const res = await generateOutfits(asServer(), u.id, req({ count: 1 }));
    expect(calls).toBe(2);
    expect(res.mode).toBe("rules");
    expect(res.proposals.length).toBe(1);
    expect(res.modeNote).toMatch(/regole/);
  });

  it("AI mode: malformed JSON from the model is rejected, not trusted", async () => {
    await u.client.from("profiles").update({ ai_consent_at: new Date().toISOString() }).eq("id", u.id);
    state.model = {
      name: "fake",
      async complete<T>(r: StructuredRequest<T>) {
        const value = r.parse({ outfits: "banana" });
        return { value, usage: { provider: "fake", model: "x", durationMs: 1 } };
      },
    };
    const res = await generateOutfits(asServer(), u.id, req({ count: 1 }));
    expect(res.mode).toBe("rules");
    expect(res.proposals.length).toBe(1);
  });

  it("without consent the model is never called", async () => {
    let called = false;
    state.model = {
      name: "fake",
      async complete() {
        called = true;
        throw new Error("must not be called");
      },
    };
    const res = await generateOutfits(asServer(), u.id, req({ count: 1 }));
    expect(called).toBe(false);
    expect(res.modeNote).toMatch(/consenso/);
  });

  describe("photos for the stylist model", () => {
    const fake = (log: StructuredRequest<unknown>[]): OutfitLanguageModel => ({
      name: "fake",
      async complete<T>(r: StructuredRequest<T>) {
        log.push(r as StructuredRequest<unknown>);
        const value = r.parse({ outfits: [{ candidate_id: "c1", title: "Con foto", reason: "Guardando le foto i colori si accordano.", tips: [] }] });
        return { value, usage: { provider: "fake", model: "fake-1", durationMs: 1 } };
      },
    });

    beforeAll(async () => {
      const { data } = await u.client.from("clothing_items").select("image_path").eq("user_id", u.id);
      const img = await sharp({ create: { width: 40, height: 50, channels: 3, background: "#336699" } }).webp().toBuffer();
      for (const r of data ?? []) await u.client.storage.from("wardrobe").upload(r.image_path as string, img, { contentType: "image/webp", upsert: true });
    });

    it("sends the garment photos only with the separate photo consent", async () => {
      await u.client.from("profiles").update({ ai_consent_at: new Date().toISOString() }).eq("id", u.id);
      const calls: StructuredRequest<unknown>[] = [];
      state.model = fake(calls);
      const textOnly = await generateOutfits(asServer(), u.id, req({ count: 1 }));
      expect(textOnly.mode).toBe("ai");
      expect(textOnly.usedPhotos).toBe(false);
      expect(calls.at(-1)!.images).toBeUndefined();

      await u.client.from("profiles").update({ ai_vision_consent_at: new Date().toISOString() }).eq("id", u.id);
      const withPhotos = await generateOutfits(asServer(), u.id, req({ count: 1 }));
      expect(withPhotos.usedPhotos).toBe(true);
      const sent = calls.at(-1)!;
      expect(sent.images!.length).toBeGreaterThan(0);
      expect(sent.images!.length).toBeLessThanOrEqual(20);
      expect(sent.images!.every((i) => /^Foto K\d+: /.test(i.label) && i.mediaType === "image/webp" && i.data.length > 0)).toBe(true);
      // Opaque tags only: neither the prompt nor the labels contain database ids, and foreign garments are never sent.
      const everything = sent.user + sent.images!.map((i) => i.label).join(" ");
      for (const real of Object.values(ids)) expect(everything).not.toContain(real);
      expect(everything).not.toContain("Jeans di un altro");
      expect(sent.user).toMatch(/"foto":"K\d+"/);
      expect(sent.system).toMatch(/FOTO dei capi/);
    });

    it("the operator can switch photo evaluation off for everyone", async () => {
      await u.client.from("profiles").update({ ai_consent_at: new Date().toISOString(), ai_vision_consent_at: new Date().toISOString() }).eq("id", u.id);
      const calls: StructuredRequest<unknown>[] = [];
      state.model = fake(calls);
      vi.stubEnv("AI_STYLIST_VISION", "off");
      const res = await generateOutfits(asServer(), u.id, req({ count: 1 }));
      expect(res.usedPhotos).toBe(false);
      expect(calls.at(-1)!.images).toBeUndefined();
    });

    it("garments whose photo cannot be read are still evaluated from text, without failing", async () => {
      await u.client.from("profiles").update({ ai_consent_at: new Date().toISOString(), ai_vision_consent_at: new Date().toISOString() }).eq("id", u.id);
      const { data } = await u.client.from("clothing_items").select("image_path").eq("id", ids.chino).single();
      await u.client.storage.from("wardrobe").remove([data!.image_path as string]);
      const calls: StructuredRequest<unknown>[] = [];
      state.model = fake(calls);
      const res = await generateOutfits(asServer(), u.id, req({ count: 1 }));
      expect(res.mode).toBe("ai");
      expect(res.proposals.length).toBe(1);
    });
  });

  describe("saved outfits", () => {
    it("saves by garment id, rejects foreign garments, and survives garment deletion with a warning", async () => {
      const bad = await saveOutfitAction({ name: "Furto", items: [{ item_id: ids.foreign, role: "Parte inferiore" }] });
      expect(bad.ok).toBe(false);

      const temp = await addItem(u, "giacche", "Giacca temporanea", { primary_color: "nero" });
      const saved = await saveOutfitAction({
        name: "Per la sera",
        items: [
          { item_id: ids.shirt, role: "Parte superiore" },
          { item_id: ids.jeans, role: "Parte inferiore" },
          { item_id: temp, role: "Capospalla" },
        ],
      });
      expect(saved.ok).toBe(true);
      const outfitId = saved.ok ? saved.data.id : "";

      const del = await deleteItemAction(temp);
      expect(del.ok).toBe(true);
      const view = await getOutfit(asServer(), outfitId);
      expect(view).not.toBeNull();
      expect(view!.items).toHaveLength(3);
      expect(view!.items.find((i) => i.status === "deleted")?.name).toBe("Giacca temporanea");
      expect(view!.warnings.join(" ")).toMatch(/eliminato/);

      // Becoming unavailable later does not delete the outfit, it only warns.
      await setAvailabilityAction({ id: ids.jeans, status: "washing" });
      const view2 = await getOutfit(asServer(), outfitId);
      expect(view2!.warnings.join(" ")).toMatch(/in lavaggio/);

      // Duplicate keeps only the existing garments.
      const dup = await duplicateOutfitAction(outfitId);
      expect(dup.ok).toBe(true);
      const dupView = await getOutfit(asServer(), dup.ok ? dup.data.id : "");
      expect(dupView!.items.every((i) => i.id !== null)).toBe(true);
      expect(dupView!.name).toMatch(/variante/);

      expect((await deleteOutfitAction(outfitId)).ok).toBe(true);
      expect(await getOutfit(asServer(), outfitId)).toBeNull();
    });

    it("another user cannot read, update or delete someone's saved outfit", async () => {
      const saved = await saveOutfitAction({ name: "Privato", items: [{ item_id: ids.tee, role: "Parte superiore" }] });
      const outfitId = saved.ok ? saved.data.id : "";
      state.client = other.client;
      state.userId = other.id;
      expect(await getOutfit(other.client as unknown as ServerSupabase, outfitId)).toBeNull();
      expect((await deleteOutfitAction(outfitId)).ok).toBe(true); // RLS: deletes 0 rows silently
      state.client = u.client;
      state.userId = u.id;
      expect(await getOutfit(asServer(), outfitId)).not.toBeNull();
    });
  });
});
