import { isSupabaseConfigured } from "@/lib/env";
import { redirect } from "next/navigation";
import { APP_NAME } from "@/lib/config";

export const metadata = { title: "Configurazione necessaria" };

export default function SetupPage() {
  if (isSupabaseConfigured()) redirect("/");
  return (
    <div className="mx-auto max-w-xl px-6 py-20">
      <h1 className="text-3xl">Configura Supabase</h1>
      <p className="mt-3 text-ink-soft">
        {APP_NAME} usa Supabase per account, database e immagini. Copia <code>.env.example</code> in{" "}
        <code>.env.local</code> e compila:
      </p>
      <pre className="mt-6 overflow-x-auto rounded-2xl bg-ink p-5 text-sm text-paper">
{`NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...`}
      </pre>
      <p className="mt-4 text-sm text-ink-soft">Poi applica le migrazioni in <code>supabase/migrations</code> e riavvia il server. Dettagli nel README.</p>
    </div>
  );
}
