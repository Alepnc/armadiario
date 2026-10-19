import Link from "next/link";
import type { ReactNode } from "react";
import { APP_NAME } from "@/lib/config";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-full flex-1 md:grid-cols-[1.05fr_1fr]">
      <aside className="hidden bg-pop p-12 text-ink md:flex md:flex-col md:justify-between">
        <Link href="/" className="font-display text-3xl font-bold">
          {APP_NAME}
        </Link>
        <div>
          <p className="font-display text-5xl leading-[1.02] text-balance">
            Vesti meglio con quello che hai già.
          </p>
          <p className="mt-4 max-w-sm text-ink/80">
            Carica i tuoi capi, segna cosa è in lavaggio e ricevi outfit pensati solo con ciò che è davvero nel tuo armadio.
          </p>
        </div>
      </aside>
      <div className="flex flex-col justify-center px-6 py-12 md:px-16">
        <Link href="/" className="mb-10 font-display text-xl md:hidden">
          {APP_NAME}
        </Link>
        <div className="mx-auto w-full max-w-sm">{children}</div>
      </div>
    </div>
  );
}
