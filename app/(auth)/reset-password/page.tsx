import type { Metadata } from "next";
import { AuthForm } from "@/components/auth-form";
import { resetPasswordAction } from "@/features/auth/actions";

export const metadata: Metadata = { title: "Nuova password" };

export default function ResetPasswordPage() {
  return (
    <>
      <h1 className="text-3xl">Scegli una nuova password</h1>
      <p className="mb-8 mt-1.5 text-ink-soft">Usa almeno 8 caratteri.</p>
      <AuthForm mode="reset" action={resetPasswordAction} />
    </>
  );
}
