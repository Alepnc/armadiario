import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const TEST_URL = process.env.SUPABASE_TEST_URL;
export const TEST_ANON = process.env.SUPABASE_TEST_ANON_KEY;
export const TEST_SERVICE = process.env.SUPABASE_TEST_SERVICE_KEY;
export const integrationEnabled = Boolean(TEST_URL && TEST_ANON && TEST_SERVICE);

export interface TestUser {
  id: string;
  email: string;
  client: SupabaseClient;
}

export function adminClient(): SupabaseClient {
  return createClient(TEST_URL!, TEST_SERVICE!, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function createTestUser(label: string): Promise<TestUser> {
  const admin = adminClient();
  const email = `${label}-${crypto.randomUUID().slice(0, 8)}@test.local`;
  const password = "Test-password-123!";
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw new Error(`createUser failed: ${error?.message}`);
  const client = createClient(TEST_URL!, TEST_ANON!, { auth: { persistSession: false, autoRefreshToken: false } });
  const signed = await client.auth.signInWithPassword({ email, password });
  if (signed.error) throw new Error(`signIn failed: ${signed.error.message}`);
  return { id: data.user.id, email, client };
}

export async function deleteTestUser(u: TestUser) {
  await adminClient().auth.admin.deleteUser(u.id);
}

export async function categoryId(client: SupabaseClient, slug: string): Promise<string> {
  const { data, error } = await client.from("categories").select("id").eq("slug", slug).is("user_id", null).single();
  if (error || !data) throw new Error(`category ${slug} missing`);
  return data.id as string;
}

export async function addItem(
  u: TestUser,
  slug: string,
  name: string,
  extra: Record<string, unknown> = {},
): Promise<string> {
  const { data, error } = await u.client
    .from("clothing_items")
    .insert({
      user_id: u.id,
      name,
      category_id: await categoryId(u.client, slug),
      primary_color: "nero",
      image_path: `${u.id}/items/${crypto.randomUUID()}.webp`,
      ...extra,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`addItem failed: ${error?.message}`);
  return data.id as string;
}
