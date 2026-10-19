import type { Metadata } from "next";
import Link from "next/link";
import { AuthForm } from "@/components/auth-form";
import { registerAction } from "@/features/auth/actions";

export const metadata: Metadata = { title: "Crea account" };

export default function RegisterPage() {
  return (
    <>
      <h1 className="text-3xl">Crea il tuo armadio</h1>
      <p className="mb-8 mt-1.5 text-ink-soft">Ci vuole un minuto. Il tuo guardaroba resta privato.</p>
      <AuthForm mode="register" action={registerAction} />
      <p className="mt-6 text-center text-sm text-ink-soft">
        Hai già un account?{" "}
        <Link href="/login" className="font-medium text-clay underline underline-offset-4">
          Accedi
        </Link>
      </p>
    </>
  );
}
