"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { authCredentialsSchema, registerSchema } from "@/lib/validation/profile";
import { isSupabaseConfigured } from "@/lib/env";
import type { ActionResult } from "@/lib/utils/action";
import { fail, ok, zodMessage } from "@/lib/utils/action";
import { z } from "zod";

async function siteUrl(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return configured.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/** Only same-site relative paths are accepted as post-login destinations. */
function safeNext(next: string | undefined): string {
  if (next && /^\/(?!\/)[\w\-/?=&.%]*$/.test(next)) return next;
  return "/dashboard";
}

export async function loginAction(formData: FormData): Promise<ActionResult> {
  if (!isSupabaseConfigured()) return fail("Supabase non è configurato.");
  const parsed = authCredentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return fail(zodMessage(parsed.error));
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    return fail(
      error.code === "email_not_confirmed"
        ? "Conferma prima la tua email (controlla la posta)."
        : "Email o password non corretti.",
    );
  }
  redirect(safeNext(String(formData.get("next") ?? "")));
}

export async function registerAction(formData: FormData): Promise<ActionResult<{ needsConfirmation: boolean }>> {
  if (!isSupabaseConfigured()) return fail("Supabase non è configurato.");
  const parsed = registerSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    display_name: formData.get("display_name") || undefined,
  });
  if (!parsed.success) return fail(zodMessage(parsed.error));
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { display_name: parsed.data.display_name ?? "" },
      emailRedirectTo: `${await siteUrl()}/auth/callback?next=/dashboard`,
    },
  });
  if (error) {
    return fail(error.code === "weak_password" ? "Password troppo debole." : "Registrazione non riuscita. Controlla i dati.");
  }
  if (data.session) redirect("/dashboard");
  return ok({ needsConfirmation: true });
}

export async function forgotPasswordAction(formData: FormData): Promise<ActionResult> {
  if (!isSupabaseConfigured()) return fail("Supabase non è configurato.");
  const parsed = z.string().trim().toLowerCase().email("Email non valida").safeParse(formData.get("email"));
  if (!parsed.success) return fail(zodMessage(parsed.error));
  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(parsed.data, {
    redirectTo: `${await siteUrl()}/auth/callback?next=/reset-password`,
  });
  // Same answer whether or not the account exists (no user enumeration).
  return ok();
}

export async function resetPasswordAction(formData: FormData): Promise<ActionResult> {
  const parsed = authCredentialsSchema.pick({ password: true }).safeParse({ password: formData.get("password") });
  if (!parsed.success) return fail(zodMessage(parsed.error));
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return fail("Il link è scaduto. Richiedine uno nuovo.");
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return fail("Impossibile aggiornare la password.");
  redirect("/dashboard");
}

export async function logoutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
