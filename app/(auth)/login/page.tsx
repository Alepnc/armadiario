import type { Metadata } from "next";
import Link from "next/link";
import { AuthForm } from "@/components/auth-form";
import { Notice } from "@/components/ui/misc";
import { loginAction } from "@/features/auth/actions";

export const metadata: Metadata = { title: "Accedi" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" ? sp.next : undefined;
  return (
    <>
      <h1 className="text-3xl">Bentornato</h1>
      <p className="mb-8 mt-1.5 text-ink-soft">Accedi per ritrovare il tuo guardaroba.</p>
      {sp.error === "link" && (
        <div className="mb-4">
          <Notice tone="error">Il link non è valido o è scaduto. Richiedine uno nuovo.</Notice>
        </div>
      )}
      <AuthForm mode="login" action={loginAction} next={next} />
      <div className="mt-6 space-y-2 text-center text-sm text-ink-soft">
        <p>
          <Link href="/forgot-password" className="underline underline-offset-4 hover:text-ink">
            Password dimenticata?
          </Link>
        </p>
        <p>
          Non hai un account?{" "}
          <Link href="/register" className="font-medium text-clay underline underline-offset-4">
            Registrati
          </Link>
        </p>
      </div>
    </>
  );
}
