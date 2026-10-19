"use client";

import { useState } from "react";
import { Check, ImageOff, Plus, X } from "lucide-react";
import { Chip } from "@/components/ui/chip";
import { cn } from "@/lib/utils/cn";

export interface PickerItem {
  id: string;
  name: string;
  thumbUrl: string | null;
  available: boolean;
  categoryLabel: string;
}

/** Compact multi-select of garments, with thumbnails. */
export function ItemPicker({
  label,
  items,
  value,
  onChange,
  max,
  emptyHint,
  blockedIds = [],
}: {
  label: string;
  items: PickerItem[];
  value: string[];
  onChange: (ids: string[]) => void;
  max: number;
  emptyHint?: string;
  blockedIds?: string[];
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const selected = items.filter((i) => value.includes(i.id));
  const visible = items.filter((i) => !blockedIds.includes(i.id) && i.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <div>
      <div className="mb-1.5 text-sm font-medium">{label}</div>
      <div className="flex flex-wrap items-center gap-2">
        {selected.map((s) => (
          <span key={s.id} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-ink pl-3.5 pr-2 text-sm text-paper">
            <span className="max-w-32 truncate">{s.name}</span>
            <button type="button" onClick={() => onChange(value.filter((v) => v !== s.id))} aria-label={`Rimuovi ${s.name}`} className="grid size-5 place-items-center rounded-full hover:bg-white/20">
              <X className="size-3" />
            </button>
          </span>
        ))}
        {value.length < max && (
          <Chip onClick={() => setOpen((o) => !o)} selected={open}>
            <Plus className="size-3.5" aria-hidden /> Scegli
          </Chip>
        )}
      </div>
      {open && (
        <div className="mt-3 rounded-2xl border-2 border-ink bg-white p-3">
          {items.length === 0 ? (
            <p className="p-3 text-sm text-muted">{emptyHint ?? "Nessun capo."}</p>
          ) : (
            <>
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Cerca un capo…"
                aria-label={`Cerca tra i capi (${label})`}
                className="mb-3 h-10 w-full rounded-full border border-line bg-white px-4 text-sm focus:border-clay focus:outline-none"
              />
              <ul className="grid max-h-72 grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4 md:grid-cols-6">
                {visible.map((i) => {
                  const on = value.includes(i.id);
                  return (
                    <li key={i.id}>
                      <button
                        type="button"
                        aria-pressed={on}
                        onClick={() => onChange(on ? value.filter((v) => v !== i.id) : value.length < max ? [...value, i.id] : value)}
                        className={cn("relative block w-full text-left", on && "ring-2 ring-clay rounded-xl")}
                      >
                        <span className="block aspect-square overflow-hidden rounded-xl bg-paper-2">
                          {i.thumbUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element -- signed URL
                            <img src={i.thumbUrl} alt="" loading="lazy" className={cn("size-full object-cover", !i.available && "opacity-50")} />
                          ) : (
                            <span className="grid size-full place-items-center text-muted"><ImageOff className="size-5" /></span>
                          )}
                        </span>
                        {on && <span className="absolute right-1 top-1 grid size-5 place-items-center rounded-full bg-clay text-white"><Check className="size-3" /></span>}
                        <span className="mt-1 block truncate text-xs">{i.name}</span>
                        {!i.available && <span className="block text-[10px] text-stone">non disponibile</span>}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
