import "server-only";
import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createClient, type ServerSupabase } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";

export class AuthError extends Error {
  constructor() {
    super("Non autenticato");
    this.name = "AuthError";
  }
}

export interface AuthContext {
  user: User;
  supabase: ServerSupabase;
}

/** For pages/layouts: redirects to login when there is no valid session. */
export async function requireUser(): Promise<AuthContext> {
  if (!isSupabaseConfigured()) redirect("/setup");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser(); // validates the JWT with the Auth server
  if (!user) redirect("/login");
  return { user, supabase };
}

/** For actions/route handlers: throws instead of redirecting. */
export async function getUserOrThrow(): Promise<AuthContext> {
  if (!isSupabaseConfigured()) throw new Error("Supabase non configurato");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new AuthError();
  return { user, supabase };
}
