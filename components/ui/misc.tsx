import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton", className)} aria-hidden />;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-[var(--radius-card)] border-2 border-dashed border-ink/25 bg-paper-2/60 px-6 py-14 text-center">
      {icon && <div className="mb-4 grid size-14 -rotate-6 place-items-center rounded-2xl bg-lime text-ink">{icon}</div>}
      <h2 className="text-xl">{title}</h2>
      {description && <p className="mt-2 max-w-sm text-sm text-ink-soft">{description}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export function ErrorState({ title = "Qualcosa non ha funzionato", description, action }: { title?: string; description?: string; action?: ReactNode }) {
  return (
    <div role="alert" className="rounded-[var(--radius-card)] border border-danger/20 bg-danger-tint px-6 py-8 text-center">
      <h2 className="text-xl text-danger">{title}</h2>
      {description && <p className="mx-auto mt-2 max-w-md text-sm text-ink-soft">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn("rounded-[var(--radius-card)] border-2 border-ink bg-white p-5", className)}>
      {children}
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: ReactNode; description?: string; actions?: ReactNode }) {
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-4xl md:text-5xl">{title}</h1>
        {description && <p className="mt-1.5 max-w-xl text-ink-soft">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "warn" | "error"; children: ReactNode }) {
  const tones = {
    info: "bg-sky/50 text-ink",
    warn: "bg-lime/70 text-ink",
    error: "bg-danger-tint text-danger",
  };
  return (
    <div role={tone === "error" ? "alert" : "note"} className={cn("rounded-2xl px-4 py-3 text-sm ring-[1.5px] ring-ink", tones[tone])}>
      {children}
    </div>
  );
}
