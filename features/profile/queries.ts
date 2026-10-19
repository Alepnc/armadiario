import "server-only";
import type { ServerSupabase } from "@/lib/supabase/server";
import type { Profile } from "@/types/db";

export async function getProfile(supabase: ServerSupabase, userId: string): Promise<Profile | null> {
  const { data } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
  if (data) return data as Profile;
  // Defensive: the sign-up trigger normally creates it.
  const { data: created } = await supabase.from("profiles").insert({ id: userId }).select("*").single();
  return (created as Profile | null) ?? null;
}
