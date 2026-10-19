import type { Metadata } from "next";
import Link from "next/link";
import { AuthForm } from "@/components/auth-form";
import { forgotPasswordAction } from "@/features/auth/actions";

export const metadata: Metadata = { title: "Recupera password" };

export default function ForgotPasswordPage() {
  return (
    <>
      <h1 className="text-3xl">Recupera la password</h1>
      <p className="mb-8 mt-1.5 text-ink-soft">Inserisci la tua email: ti invieremo un link per sceglierne una nuova.</p>
      <AuthForm mode="forgot" action={forgotPasswordAction} />
      <p className="mt-6 text-center text-sm">
        <Link href="/login" className="text-ink-soft underline underline-offset-4 hover:text-ink">
          Torna al login
        </Link>
      </p>
    </>
  );
}
