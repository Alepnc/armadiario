"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { LayoutGrid, List, Search, SlidersHorizontal, X } from "lucide-react";
import { Select } from "@/components/ui/field";
import { AVAILABILITY, AVAILABILITY_LABEL, COLORS, SEASON_LABEL, SEASONS, STYLES } from "@/lib/constants/wardrobe";
import { Chip } from "@/components/ui/chip";
import type { Category } from "@/types/db";

/** All filters live in the URL, so views are shareable and survive refresh. */
export function FilterBar({ categories }: { categories: Pick<Category, "id" | "label">[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [showFilters, setShowFilters] = useState(false);

  function update(key: string, value: string | null) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete("limit");
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }

  useEffect(() => () => clearTimeout(timer.current), []);

  const active = ["category", "color", "season", "style", "status", "q"].filter((k) => params.get(k)).length;
  const selectActive = ["category", "color", "season", "style"].filter((k) => params.get(k)).length;
  const view = params.get("view") === "list" ? "list" : "grid";
  const status = params.get("status");

  return (
    <div className="mb-6 space-y-3">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <input
            type="search"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              clearTimeout(timer.current);
              timer.current = setTimeout(() => update("q", e.target.value.trim() || null), 350);
            }}
            placeholder="Cerca per nome, note…"
            aria-label="Cerca nel guardaroba"
            className="h-11 w-full rounded-full border-2 border-ink bg-white pl-10 pr-4 text-[15px] focus:border-ink focus:outline-none focus:ring-4 focus:ring-lime"
          />
        </div>
        <button
          type="button"
          onClick={() => setShowFilters((v) => !v)}
          aria-expanded={showFilters}
          aria-controls="wardrobe-filters"
          className="relative grid size-11 shrink-0 place-items-center rounded-full bg-transparent ring-2 ring-inset ring-ink md:hidden"
          aria-label="Filtri"
        >
          <SlidersHorizontal className="size-4" aria-hidden />
          {selectActive > 0 && <span className="absolute -right-0.5 -top-0.5 grid size-4 place-items-center rounded-full bg-pop text-[10px] font-bold text-ink">{selectActive}</span>}
        </button>
        <div className="hidden rounded-full bg-transparent p-1 ring-2 ring-inset ring-ink sm:flex" role="group" aria-label="Vista">
          {([["grid", LayoutGrid, "Griglia"], ["list", List, "Lista"]] as const).map(([v, Icon, label]) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              aria-label={label}
              onClick={() => update("view", v === "grid" ? null : v)}
              className={`grid size-9 place-items-center rounded-full ${view === v ? "bg-lime" : "text-ink-soft"}`}
            >
              <Icon className="size-4" />
            </button>
          ))}
        </div>
      </div>

      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:px-0" role="group" aria-label="Filtra per disponibilità">
        <Chip selected={!status} onClick={() => update("status", null)}>Tutti</Chip>
        {AVAILABILITY.map((s) => (
          <Chip key={s} selected={status === s} onClick={() => update("status", status === s ? null : s)}>
            {AVAILABILITY_LABEL[s]}
          </Chip>
        ))}
      </div>

      <div id="wardrobe-filters" className={`grid grid-cols-2 gap-2 md:grid md:grid-cols-5 ${showFilters ? "" : "hidden"}`}>
        <Select aria-label="Categoria" value={params.get("category") ?? ""} onChange={(e) => update("category", e.target.value || null)} className="h-10 text-sm">
          <option value="">Categoria</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </Select>
        <Select aria-label="Colore" value={params.get("color") ?? ""} onChange={(e) => update("color", e.target.value || null)} className="h-10 text-sm">
          <option value="">Colore</option>
          {COLORS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </Select>
        <Select aria-label="Stagione" value={params.get("season") ?? ""} onChange={(e) => update("season", e.target.value || null)} className="h-10 text-sm">
          <option value="">Stagione</option>
          {SEASONS.map((s) => <option key={s} value={s}>{SEASON_LABEL[s]}</option>)}
        </Select>
        <Select aria-label="Stile" value={params.get("style") ?? ""} onChange={(e) => update("style", e.target.value || null)} className="h-10 text-sm">
          <option value="">Stile</option>
          {STYLES.map((s) => <option key={s} value={s}>{s}</option>)}
        </Select>
        <Select aria-label="Ordina per" value={params.get("sort") ?? "recent"} onChange={(e) => update("sort", e.target.value === "recent" ? null : e.target.value)} className="h-10 text-sm">
          <option value="recent">Più recenti</option>
          <option value="name">Nome A–Z</option>
          <option value="favorites">Preferiti prima</option>
        </Select>
      </div>

      {active > 0 && (
        <button
          type="button"
          onClick={() => {
            setQ("");
            const next = new URLSearchParams();
            if (view === "list") next.set("view", "list");
            router.replace(`${pathname}?${next.toString()}`, { scroll: false });
          }}
          className="inline-flex items-center gap-1.5 text-sm text-clay underline underline-offset-4"
        >
          <X className="size-3.5" aria-hidden /> Azzera i filtri
        </button>
      )}
    </div>
  );
}
