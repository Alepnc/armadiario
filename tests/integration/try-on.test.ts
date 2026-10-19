import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import type { TryOnJobStatus, TryOnProvider } from "@/lib/ai/tryon/types";
import { addItem, createTestUser, deleteTestUser, integrationEnabled, type TestUser } from "../helpers/supabase";

const state: { provider: TryOnProvider | null } = { provider: null };
vi.mock("@/lib/ai/tryon/registry", () => ({
  getTryOnProvider: () => state.provider,
  isTryOnConfigured: () => state.provider !== null,
}));
// vitest.config.mts points NEXT_PUBLIC_SUPABASE_URL at the local Supabase, which triggers the data-URI path.

import { advanceTryOn, planSteps, startTryOn, TryOnError, publicJobView } from "@/features/virtual-try-on/service";
import type { ServerSupabase } from "@/lib/supabase/server";

async function webp(color: string) {
  return sharp({ create: { width: 64, height: 80, channels: 3, background: color } }).webp().toBuffer();
}

describe("planSteps (which garments can be rendered)", () => {
  const supported = ["upper_body", "lower_body", "dresses"] as const;
  const mk = (name: string, slot: string) => ({ id: name, name, slot, color: "nero", imagePath: `p/${name}.webp` });

  it("renders top + bottom, skips shoes/accessories and says so", () => {
    const { steps, skipped } = planSteps([mk("Maglia", "top"), mk("Jeans", "bottom"), mk("Scarpe", "shoes"), mk("Cintura", "accessory")], supported);
    expect(steps.map((s) => s.category)).toEqual(["lower_body", "upper_body"]);
    expect(skipped).toEqual(["Scarpe", "Cintura"]);
  });

  it("shows only the outermost upper layer", () => {
    const { steps, skipped } = planSteps([mk("Maglia", "top"), mk("Giacca", "outer"), mk("Jeans", "bottom")], supported);
    expect(steps.find((s) => s.category === "upper_body")?.itemId).toBe("Giacca");
    expect(skipped).toContain("Maglia");
  });

  it("a dress replaces top and bottom", () => {
    const { steps, skipped } = planSteps([mk("Abito", "dress"), mk("Maglia", "top"), mk("Jeans", "bottom")], supported);
    expect(steps.map((s) => s.category)).toEqual(["dresses"]);
    expect(skipped.sort()).toEqual(["Jeans", "Maglia"]);
  });

  it("respects what the provider supports", () => {
    const { steps } = planSteps([mk("Maglia", "top"), mk("Jeans", "bottom")], ["upper_body"]);
    expect(steps.map((s) => s.category)).toEqual(["upper_body"]);
  });
});

describe.skipIf(!integrationEnabled)("virtual try-on orchestration with a fake provider", () => {
  let u: TestUser;
  let outfitId: string;
  let top: string;
  let bottom: string;
  const submits: Array<{ person: string; category: string }> = [];
  const polls: Record<string, TryOnJobStatus[]> = {};
  const realFetch = globalThis.fetch;

  const asServer = () => u.client as unknown as ServerSupabase;

  beforeAll(async () => {
    u = await createTestUser("tryon");
    for (const p of ["items/top.webp", "items/bottom.webp"]) {
      await u.client.storage.from("wardrobe").upload(`${u.id}/${p}`, await webp(p.includes("top") ? "#336699" : "#222222"), { contentType: "image/webp" });
    }
    top = await addItem(u, "t-shirt", "Maglia blu", { image_path: `${u.id}/items/top.webp` });
    bottom = await addItem(u, "pantaloni", "Pantaloni scuri", { image_path: `${u.id}/items/bottom.webp` });
    const o = await u.client.from("outfits").insert({ user_id: u.id, name: "Test" }).select("id").single();
    outfitId = o.data!.id as string;
    await u.client.from("outfit_items").insert([
      { outfit_id: outfitId, clothing_item_id: top, role: "Parte superiore", position: 0, item_name_snapshot: "Maglia blu" },
      { outfit_id: outfitId, clothing_item_id: bottom, role: "Parte inferiore", position: 1, item_name_snapshot: "Pantaloni scuri" },
    ]);
    await u.client.storage.from("personal").upload(`${u.id}/tryon-photo/me.webp`, await webp("#aa8866"), { contentType: "image/webp" });
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    if (u) await deleteTestUser(u);
  });

  beforeEach(async () => {
    submits.length = 0;
    for (const k of Object.keys(polls)) delete polls[k];
    await u.client.from("generated_images").delete().eq("user_id", u.id);
    await u.client.from("ai_usage").delete().eq("user_id", u.id);
    await u.client.from("profiles").update({ tryon_consent_at: new Date().toISOString(), tryon_photo_path: `${u.id}/tryon-photo/me.webp` }).eq("id", u.id);
    let n = 0;
    state.provider = {
      name: "fake",
      supportedCategories: ["upper_body", "lower_body", "dresses"],
      async submit({ personImageUrl, garment }) {
        const id = `job-${++n}`;
        submits.push({ person: personImageUrl.slice(0, 60), category: garment.category });
        polls[id] = [{ status: "processing" }, { status: "succeeded", outputUrl: `https://fake.example/out-${id}.png` }];
        return { jobId: id };
      },
      async poll(jobId) {
        return polls[jobId].length > 1 ? polls[jobId].shift()! : polls[jobId][0];
      },
    };
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith("https://fake.example/")) {
        const buf = await sharp({ create: { width: 90, height: 120, channels: 3, background: "#00aa55" } }).png().toBuffer();
        return new Response(new Uint8Array(buf), { status: 200, headers: { "content-type": "image/png" } });
      }
      return realFetch(input, init);
    });
  });

  it("is blocked without a provider, without consent, or without a photo — with clear codes", async () => {
    state.provider = null;
    await expect(startTryOn(asServer(), u.id, outfitId)).rejects.toMatchObject({ code: "not_configured" });

    state.provider = { name: "fake", supportedCategories: ["upper_body"], submit: async () => ({ jobId: "x" }), poll: async () => ({ status: "processing" }) };
    await u.client.from("profiles").update({ tryon_consent_at: null }).eq("id", u.id);
    await expect(startTryOn(asServer(), u.id, outfitId)).rejects.toMatchObject({ code: "consent_required" });

    await u.client.from("profiles").update({ tryon_consent_at: new Date().toISOString(), tryon_photo_path: null }).eq("id", u.id);
    await expect(startTryOn(asServer(), u.id, outfitId)).rejects.toMatchObject({ code: "no_photo" });
    expect(await u.client.from("generated_images").select("id")).toMatchObject({ data: [] });
  });

  it("chains garments (bottom, then top on the intermediate result) and stores the final image privately", async () => {
    const { id, reused } = await startTryOn(asServer(), u.id, outfitId);
    expect(reused).toBe(false);
    expect(submits).toHaveLength(1);
    expect(submits[0].category).toBe("lower_body");
    expect(submits[0].person).toMatch(/^data:image\/webp/); // original photo (local Supabase → data URI)

    let row = await advanceTryOn(asServer(), u.id, id);
    expect(row!.generation_status).toBe("processing"); // first poll: still working
    for (let i = 0; i < 6 && row!.generation_status !== "completed"; i++) {
      row = await advanceTryOn(asServer(), u.id, id);
      // locks are time-based; wait is unnecessary because each advance is sequential here
    }
    expect(row!.generation_status).toBe("completed");
    expect(submits.map((s) => s.category)).toEqual(["lower_body", "upper_body"]);
    // Step 2 uses the output of step 1 as the person image, not the original photo.
    expect(submits[1].person).toMatch(/^https:\/\/fake\.example\/out-job-1/);

    const view = publicJobView(row!);
    expect(view.status).toBe("completed");
    expect(row!.image_path).toBe(`${u.id}/tryon/${id}.webp`);
    const stored = await u.client.storage.from("generated").download(row!.image_path!);
    expect(stored.error).toBeNull();
    const usage = await u.client.from("ai_usage").select("operation,success").eq("operation", "try_on");
    expect(usage.data).toEqual([{ operation: "try_on", success: true }]);
  });

  it("returns the existing job for an identical in-flight request (duplicate protection)", async () => {
    const first = await startTryOn(asServer(), u.id, outfitId);
    const second = await startTryOn(asServer(), u.id, outfitId);
    expect(second).toEqual({ id: first.id, reused: true });
    expect(submits).toHaveLength(1);
  });

  it("surfaces provider failure as a failed job with a readable message (no silent fallback)", async () => {
    state.provider!.poll = async () => ({ status: "failed", message: "boom" });
    const { id } = await startTryOn(asServer(), u.id, outfitId);
    const row = await advanceTryOn(asServer(), u.id, id);
    expect(row!.generation_status).toBe("failed");
    expect(row!.image_path).toBeNull();
    expect(publicJobView(row!).errorMessage).toMatch(/non è riuscito/);
  });

  it("marks the job failed if the provider rejects the submission", async () => {
    state.provider!.submit = async () => {
      throw new Error("provider down");
    };
    const { id } = await startTryOn(asServer(), u.id, outfitId);
    const { data } = await u.client.from("generated_images").select("generation_status,error_code").eq("id", id).single();
    expect(data).toEqual({ generation_status: "failed", error_code: "provider_error" });
  });

  it("refuses outfits whose garments were deleted", async () => {
    const temp = await addItem(u, "giacche", "Giacca", { image_path: `${u.id}/items/top.webp` });
    const o = await u.client.from("outfits").insert({ user_id: u.id, name: "Con giacca" }).select("id").single();
    await u.client.from("outfit_items").insert({ outfit_id: o.data!.id, clothing_item_id: temp, role: "Capospalla", item_name_snapshot: "Giacca" });
    await u.client.from("clothing_items").delete().eq("id", temp);
    await expect(startTryOn(asServer(), u.id, o.data!.id as string)).rejects.toBeInstanceOf(TryOnError);
    await expect(startTryOn(asServer(), u.id, o.data!.id as string)).rejects.toMatchObject({ code: "garment_deleted" });
  });
});
