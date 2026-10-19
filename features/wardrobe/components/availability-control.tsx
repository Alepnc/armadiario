"use client";

import { useState, useTransition } from "react";
import { Ban, CheckCircle2, ChevronDown, Droplets } from "lucide-react";
import { useRouter } from "next/navigation";
import { setAvailabilityAction } from "@/features/wardrobe/actions";
import { AVAILABILITY, AVAILABILITY_LABEL, type Availability } from "@/lib/constants/wardrobe";
import { StatusBadge } from "@/components/status-badge";
import { useToast } from "@/components/ui/toast";
import { Input } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";

const ICON = { available: CheckCircle2, washing: Droplets, unavailable: Ban } as const;

/**
 * Persistent availability switch. `menu` = compact popover for grid cards,
 * `segmented` = full-width control for the detail page.
 */
export function AvailabilityControl({
  itemId,
  status,
  expectedAt,
  variant = "menu",
}: {
  itemId: string;
  status: Availability;
  expectedAt: string | null;
  variant?: "menu" | "segmented";
}) {
  const [current, setCurrent] = useState<Availability>(status);
  const [date, setDate] = useState(expectedAt ?? "");
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();

  function apply(next: Availability, nextDate?: string) {
    const previous = current;
    setCurrent(next); // optimistic
    start(async () => {
      const res = await setAvailabilityAction({
        id: itemId,
        status: next,
        expected_available_at: next === "available" ? null : nextDate || date || null,
      });
      if (!res.ok) {
        setCurrent(previous);
        toast.error(res.error);
        return;
      }
      toast.success(`Stato: ${AVAILABILITY_LABEL[next].toLowerCase()}`);
      router.refresh();
    });
  }

  const dateRow = current !== "available" && (
    <div className="flex items-end gap-2">
      <label className="block flex-1 text-xs text-ink-soft">
        Rientro previsto (facoltativo, solo informativo)
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1 h-10" />
      </label>
      <Button size="sm" variant="secondary" onClick={() => apply(current, date)} loading={pending}>
        Salva
      </Button>
    </div>
  );

  if (variant === "segmented") {
    return (
      <div className="space-y-3">
        <div role="radiogroup" aria-label="Disponibilità" className="grid grid-cols-3 gap-1.5 rounded-2xl bg-transparent p-1.5 ring-2 ring-ink">
          {AVAILABILITY.map((s) => {
            const Icon = ICON[s];
            const active = current === s;
            return (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={active}
                disabled={pending}
                onClick={() => !active && apply(s)}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-xl px-2 py-2.5 text-xs font-medium transition-colors sm:flex-row sm:justify-center sm:text-sm",
                  active ? "bg-lime text-ink ring-2 ring-ink" : "text-ink-soft hover:bg-lime/40",
                )}
              >
                <Icon className={cn("size-4", )} aria-hidden />
                {AVAILABILITY_LABEL[s]}
              </button>
            );
          })}
        </div>
        {dateRow}
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Disponibilità: ${AVAILABILITY_LABEL[current]}. Cambia`}
        className="group inline-flex items-center gap-0.5 rounded-full"
        disabled={pending}
      >
        <StatusBadge status={current} />
        <ChevronDown className="size-3.5 text-muted group-hover:text-ink" aria-hidden />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} aria-hidden />
          <div role="menu" className="absolute left-0 top-full z-40 mt-1.5 w-48 overflow-hidden rounded-2xl bg-white p-1 shadow-xl ring-2 ring-ink">
            {AVAILABILITY.map((s) => {
              const Icon = ICON[s];
              return (
                <button
                  key={s}
                  role="menuitemradio"
                  aria-checked={current === s}
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    if (s !== current) apply(s);
                  }}
                  className={cn("flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm hover:bg-paper-2", current === s && "bg-paper-2 font-medium")}
                >
                  <Icon className="size-4" aria-hidden />
                  {AVAILABILITY_LABEL[s]}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
