import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addItem, categoryId, createTestUser, deleteTestUser, integrationEnabled, type TestUser } from "../helpers/supabase";

describe.skipIf(!integrationEnabled)("data isolation (RLS) against a real Supabase", () => {
  let a: TestUser;
  let b: TestUser;
  let itemA: string;

  beforeAll(async () => {
    a = await createTestUser("alice");
    b = await createTestUser("bruno");
    itemA = await addItem(a, "jeans", "Jeans di Alice");
  });

  afterAll(async () => {
    await Promise.all([a && deleteTestUser(a), b && deleteTestUser(b)]);
  });

  it("creates a profile row automatically at sign-up, visible only to its owner", async () => {
    const own = await a.client.from("profiles").select("id").eq("id", a.id);
    expect(own.data).toHaveLength(1);
    const other = await b.client.from("profiles").select("id").eq("id", a.id);
    expect(other.data).toHaveLength(0);
  });

  it("hides garments from other users (read)", async () => {
    const { data } = await b.client.from("clothing_items").select("id");
    expect(data).toEqual([]);
    const byId = await b.client.from("clothing_items").select("id").eq("id", itemA);
    expect(byId.data).toEqual([]);
  });

  it("blocks updating or deleting another user's garment by id", async () => {
    const upd = await b.client.from("clothing_items").update({ name: "hacked", availability_status: "unavailable" }).eq("id", itemA).select();
    expect(upd.data ?? []).toHaveLength(0);
    const del = await b.client.from("clothing_items").delete().eq("id", itemA).select();
    expect(del.data ?? []).toHaveLength(0);
    const still = await a.client.from("clothing_items").select("name,availability_status").eq("id", itemA).single();
    expect(still.data).toEqual({ name: "Jeans di Alice", availability_status: "available" });
  });

  it("blocks inserting a garment owned by someone else (forged user_id)", async () => {
    const { error } = await b.client.from("clothing_items").insert({
      user_id: a.id,
      name: "forged",
      category_id: await categoryId(b.client, "jeans"),
      primary_color: "nero",
      image_path: `${a.id}/items/x.webp`,
    });
    expect(error).not.toBeNull();
  });

  it("rejects invalid availability values at the database level", async () => {
    const { error } = await a.client.from("clothing_items").update({ availability_status: "lost" }).eq("id", itemA);
    expect(error).not.toBeNull();
  });

  it("persists availability across sessions (new client, same account)", async () => {
    await a.client.from("clothing_items").update({ availability_status: "washing", expected_available_at: "2030-01-02" }).eq("id", itemA);
    const { createClient } = await import("@supabase/supabase-js");
    const fresh = createClient(process.env.SUPABASE_TEST_URL!, process.env.SUPABASE_TEST_ANON_KEY!, { auth: { persistSession: false } });
    await fresh.auth.signInWithPassword({ email: a.email, password: "Test-password-123!" });
    const { data } = await fresh.from("clothing_items").select("availability_status,expected_available_at").eq("id", itemA).single();
    expect(data).toEqual({ availability_status: "washing", expected_available_at: "2030-01-02" });
    await a.client.from("clothing_items").update({ availability_status: "available", expected_available_at: null }).eq("id", itemA);
  });

  it("does not let an outfit reference another user's garment", async () => {
    const outfit = await b.client.from("outfits").insert({ user_id: b.id, name: "Furto" }).select("id").single();
    expect(outfit.error).toBeNull();
    const { error } = await b.client.from("outfit_items").insert({
      outfit_id: outfit.data!.id,
      clothing_item_id: itemA,
      role: "Parte inferiore",
      item_name_snapshot: "Jeans di Alice",
    });
    expect(error).not.toBeNull();
  });

  it("does not let a user attach items/images to another user's outfit", async () => {
    const outfit = await a.client.from("outfits").insert({ user_id: a.id, name: "Mio" }).select("id").single();
    const own = await b.client.from("outfits").select("id").eq("id", outfit.data!.id);
    expect(own.data).toEqual([]);
    const bItem = await addItem(b, "t-shirt", "Maglia di Bruno");
    const ins = await b.client.from("outfit_items").insert({ outfit_id: outfit.data!.id, clothing_item_id: bItem, role: "x", item_name_snapshot: "x" });
    expect(ins.error).not.toBeNull();
    const img = await b.client.from("generated_images").insert({
      user_id: b.id,
      outfit_id: outfit.data!.id,
      source_photo_path: `${b.id}/p.webp`,
      provider: "test",
      input_hash: "h1",
    });
    expect(img.error).not.toBeNull();
  });

  it("keeps a saved outfit when a garment is deleted (id nulled, name snapshot kept)", async () => {
    const jacket = await addItem(a, "giacche", "Giubbotto");
    const outfit = await a.client.from("outfits").insert({ user_id: a.id, name: "Con giubbotto" }).select("id").single();
    await a.client.from("outfit_items").insert({ outfit_id: outfit.data!.id, clothing_item_id: jacket, role: "Capospalla", item_name_snapshot: "Giubbotto" });
    const del = await a.client.from("clothing_items").delete().eq("id", jacket);
    expect(del.error).toBeNull();
    const { data } = await a.client.from("outfits").select("id, outfit_items(clothing_item_id, item_name_snapshot)").eq("id", outfit.data!.id).single();
    expect(data?.outfit_items).toEqual([{ clothing_item_id: null, item_name_snapshot: "Giubbotto" }]);
  });

  it("prevents using another user's custom category", async () => {
    const cat = await a.client.from("categories").insert({ user_id: a.id, slug: "cravatte", label: "Cravatte", slot: "accessory" }).select("id").single();
    expect(cat.error).toBeNull();
    const seen = await b.client.from("categories").select("id").eq("id", cat.data!.id);
    expect(seen.data).toEqual([]);
    const { error } = await b.client.from("clothing_items").insert({
      user_id: b.id,
      name: "x",
      category_id: cat.data!.id,
      primary_color: "nero",
      image_path: `${b.id}/items/x.webp`,
    });
    expect(error).not.toBeNull();
  });

  it("blocks duplicate in-flight try-on jobs with the same input hash", async () => {
    const outfit = await a.client.from("outfits").insert({ user_id: a.id, name: "Try" }).select("id").single();
    const row = { user_id: a.id, outfit_id: outfit.data!.id, source_photo_path: `${a.id}/p.webp`, provider: "test", input_hash: "same" };
    const first = await a.client.from("generated_images").insert(row);
    expect(first.error).toBeNull();
    const second = await a.client.from("generated_images").insert(row);
    expect(second.error?.code).toBe("23505");
  });

  describe("storage", () => {
    const bytes = new Uint8Array([82, 73, 70, 70, 0, 0, 0, 0, 87, 69, 66, 80]);
    it("lets the owner upload and read a private object", async () => {
      const path = `${a.id}/items/test.webp`;
      const up = await a.client.storage.from("wardrobe").upload(path, bytes, { contentType: "image/webp" });
      expect(up.error).toBeNull();
      const dl = await a.client.storage.from("wardrobe").download(path);
      expect(dl.error).toBeNull();
      const signed = await a.client.storage.from("wardrobe").createSignedUrl(path, 60);
      expect(signed.data?.signedUrl).toBeTruthy();
    });

    it("hides and protects objects of other users", async () => {
      const path = `${a.id}/items/secret.webp`;
      await a.client.storage.from("wardrobe").upload(path, bytes, { contentType: "image/webp" });
      const dl = await b.client.storage.from("wardrobe").download(path);
      expect(dl.error).not.toBeNull();
      const signed = await b.client.storage.from("wardrobe").createSignedUrl(path, 60);
      expect(signed.data).toBeNull();
      const list = await b.client.storage.from("wardrobe").list(`${a.id}/items`);
      expect(list.data ?? []).toHaveLength(0);
      const forged = await b.client.storage.from("wardrobe").upload(`${a.id}/items/forged.webp`, bytes, { contentType: "image/webp" });
      expect(forged.error).not.toBeNull();
      const rm = await b.client.storage.from("wardrobe").remove([path]);
      expect(rm.data ?? []).toHaveLength(0);
      const still = await a.client.storage.from("wardrobe").download(path);
      expect(still.error).toBeNull();
    });

    it("refuses non-image MIME types and anonymous access", async () => {
      const bad = await a.client.storage.from("wardrobe").upload(`${a.id}/items/evil.html`, new Blob(["<script>"]), { contentType: "text/html" });
      expect(bad.error).not.toBeNull();
      const { createClient } = await import("@supabase/supabase-js");
      const anon = createClient(process.env.SUPABASE_TEST_URL!, process.env.SUPABASE_TEST_ANON_KEY!);
      const dl = await anon.storage.from("wardrobe").download(`${a.id}/items/test.webp`);
      expect(dl.error).not.toBeNull();
    });
  });
});
