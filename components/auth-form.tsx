"use client";

import { useActionState } from "react";
import { MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Notice } from "@/components/ui/misc";
import type { ActionResult } from "@/lib/utils/action";

type Mode = "login" | "register" | "forgot" | "reset";
type Action = (formData: FormData) => Promise<ActionResult<unknown> | ActionResult>;

const COPY: Record<Mode, { cta: string; done?: string }> = {
  login: { cta: "Accedi" },
  register: { cta: "Crea account", done: "Ti abbiamo inviato un'email: conferma l'indirizzo per entrare." },
  forgot: { cta: "Invia il link", done: "Se l'indirizzo è registrato, riceverai a breve un link per reimpostare la password." },
  reset: { cta: "Salva nuova password" },
};

export function AuthForm({ mode, action, next }: { mode: Mode; action: Action; next?: string }) {
  const [state, formAction, pending] = useActionState<ActionResult<unknown> | null, FormData>(
    async (_prev, fd) => (await action(fd)) as ActionResult<unknown>,
    null,
  );
  const copy = COPY[mode];

  if (state?.ok && copy.done) {
    return (
      <div className="rise rounded-2xl bg-sage-tint p-5 text-sage">
        <MailCheck className="mb-3 size-6" aria-hidden />
        <p className="text-sm">{copy.done}</p>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4" noValidate={false}>
      {mode === "login" && next && <input type="hidden" name="next" value={next} />}
      {mode === "register" && (
        <Field label="Nome o nickname" htmlFor="display_name" hint="Facoltativo">
          <Input id="display_name" name="display_name" autoComplete="nickname" maxLength={60} />
        </Field>
      )}
      {mode !== "reset" && (
        <Field label="Email" htmlFor="email">
          <Input id="email" name="email" type="email" autoComplete="email" required inputMode="email" />
        </Field>
      )}
      {mode !== "forgot" && (
        <Field label={mode === "reset" ? "Nuova password" : "Password"} htmlFor="password" hint={mode === "login" ? undefined : "Almeno 8 caratteri"}>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            required
            minLength={mode === "login" ? undefined : 8}
          />
        </Field>
      )}
      {state && !state.ok && <Notice tone="error">{state.error}</Notice>}
      <Button type="submit" size="lg" className="w-full" loading={pending}>
        {copy.cta}
      </Button>
    </form>
  );
}
