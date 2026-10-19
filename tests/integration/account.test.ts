import { describe, expect, it, vi } from "vitest";
import { addItem, adminClient, createTestUser, integrationEnabled } from "../helpers/supabase";

const state: { client: unknown; userId: string } = { client: null, userId: "" };
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/security/auth", () => ({
  AuthError: class AuthError extends Error {},
  getUserOrThrow: async () => ({ user: { id: state.userId }, supabase: state.client }),
}));

import { deleteAccountAction } from "@/features/profile/actions";

describe.skipIf(!integrationEnabled)("account deletion", () => {
  it("removes the auth user, every row and every stored file — and nothing of other users", async () => {
    const u = await createTestUser("delme");
    const keep = await createTestUser("keepme");
    await addItem(u, "jeans", "Da cancellare");
    const keepItem = await addItem(keep, "jeans", "Da tenere");
    const bytes = new Uint8Array([82, 73, 70, 70, 0, 0, 0, 0, 87, 69, 66, 80]);
    await u.client.storage.from("wardrobe").upload(`${u.id}/items/a.webp`, bytes, { contentType: "image/webp" });
    await u.client.storage.from("personal").upload(`${u.id}/avatar/me.webp`, bytes, { contentType: "image/webp" });
    await keep.client.storage.from("wardrobe").upload(`${keep.id}/items/b.webp`, bytes, { contentType: "image/webp" });
    await u.client.from("outfits").insert({ user_id: u.id, name: "Mio" });

    state.client = u.client;
    state.userId = u.id;
    expect((await deleteAccountAction("sbagliato")).ok).toBe(false); // needs explicit confirmation
    const res = await deleteAccountAction("ELIMINA");
    expect(res.ok).toBe(true);

    const admin = adminClient();
    expect((await admin.auth.admin.getUserById(u.id)).data.user).toBeNull();
    expect((await admin.from("clothing_items").select("id").eq("user_id", u.id)).data).toEqual([]);
    expect((await admin.from("outfits").select("id").eq("user_id", u.id)).data).toEqual([]);
    expect((await admin.from("profiles").select("id").eq("id", u.id)).data).toEqual([]);
    expect((await admin.storage.from("wardrobe").list(`${u.id}/items`)).data).toEqual([]);
    expect((await admin.storage.from("personal").list(`${u.id}/avatar`)).data).toEqual([]);

    // The other account is untouched.
    expect((await admin.from("clothing_items").select("id").eq("id", keepItem)).data).toHaveLength(1);
    expect((await admin.storage.from("wardrobe").list(`${keep.id}/items`)).data).toHaveLength(1);
    await admin.auth.admin.deleteUser(keep.id);
  });
});
