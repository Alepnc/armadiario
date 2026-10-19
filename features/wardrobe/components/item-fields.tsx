"use client";

import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { Chip } from "@/components/ui/chip";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { createCategoryAction } from "@/features/wardrobe/actions";
import {
  AVAILABILITY,
  AVAILABILITY_LABEL,
  COLORS,
  FIT_LABEL,
  FITS,
  FORMALITY_LABEL,
  PATTERN_LABEL,
  PATTERNS,
  SEASON_LABEL,
  SEASONS,
  SLOT_LABEL,
  STYLES,
  type Availability,
  type Fit,
  type Season,
  type Slot,
} from "@/lib/constants/wardrobe";
import type { ClothingItemInput } from "@/lib/validation/wardrobe";
import type { Category, ClothingItem } from "@/types/db";
import { cn } from "@/lib/utils/cn";

export interface ItemDraft {
  name: string;
  category_id: string;
  subcategory: string;
  primary_color: string;
  secondary_colors: string[];
  seasons: Season[];
  styles: string[];
  material: string;
  pattern: string;
  formality: number;
  fit: Fit | "";
  availability_status: Availability;
  expected_available_at: string;
  is_favorite: boolean;
  notes: string;
}

export const EMPTY_DRAFT: ItemDraft = {
  name: "",
  category_id: "",
  subcategory: "",
  primary_color: "",
  secondary_colors: [],
  seasons: [],
  styles: [],
  material: "",
  pattern: "solid",
  formality: 2,
  fit: "",
  availability_status: "available",
  expected_available_at: "",
  is_favorite: false,
  notes: "",
};

export function draftFromItem(i: ClothingItem): ItemDraft {
  return {
    name: i.name,
    category_id: i.category_id,
    subcategory: i.subcategory ?? "",
    primary_color: i.primary_color,
    secondary_colors: i.secondary_colors,
    seasons: i.seasons,
    styles: i.styles,
    material: i.material ?? "",
    pattern: i.pattern,
    formality: i.formality,
    fit: i.fit ?? "",
    availability_status: i.availability_status,
    expected_available_at: i.expected_available_at ?? "",
    is_favorite: i.is_favorite,
    notes: i.notes ?? "",
  };
}

export function draftToInput(d: ItemDraft): ClothingItemInput {
  return {
    name: d.name,
    category_id: d.category_id,
    subcategory: d.subcategory || null,
    primary_color: d.primary_color,
    secondary_colors: d.secondary_colors,
    seasons: d.seasons,
    styles: d.styles,
    material: d.material || null,
    pattern: d.pattern,
    formality: d.formality,
    fit: d.fit || null,
    availability_status: d.availability_status,
    expected_available_at: d.availability_status === "available" ? null : d.expected_available_at || null,
    is_favorite: d.is_favorite,
    notes: d.notes || null,
  };
}

export function draftIsComplete(d: ItemDraft): boolean {
  return d.name.trim().length > 0 && Boolean(d.category_id) && Boolean(d.primary_color);
}

function toggle<T>(list: T[], v: T): T[] {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
}

export function ColorPicker({
  value,
  onChange,
  multiple,
  label,
  exclude,
}: {
  value: string | string[];
  onChange: (v: string) => void;
  multiple?: boolean;
  label: string;
  exclude?: string;
}) {
  const selected = Array.isArray(value) ? value : [value];
  return (
    <div role={multiple ? "group" : "radiogroup"} aria-label={label} className="flex flex-wrap gap-2">
      {COLORS.filter((c) => c.value !== exclude).map((c) => {
        const on = selected.includes(c.value);
        return (
          <button
            key={c.value}
            type="button"
            role={multiple ? undefined : "radio"}
            aria-checked={multiple ? undefined : on}
            aria-pressed={multiple ? on : undefined}
            aria-label={c.label}
            title={c.label}
            onClick={() => onChange(c.value)}
            className={cn(
              "relative size-8 rounded-full ring-[1.5px] ring-ink/60 transition-transform hover:scale-110",
              on && "ring-2 ring-ink ring-offset-2 ring-offset-paper",
            )}
            style={{ background: c.value === "multicolore" ? "conic-gradient(#e3a2b3,#e2bd36,#3f7a52,#4b6a93,#e3a2b3)" : c.hex }}
          />
        );
      })}
    </div>
  );
}

export function ItemFields({
  value,
  onChange,
  categories,
  idPrefix,
  compact,
}: {
  value: ItemDraft;
  onChange: (next: ItemDraft) => void;
  categories: Category[];
  idPrefix: string;
  compact?: boolean;
}) {
  const set = <K extends keyof ItemDraft>(key: K, v: ItemDraft[K]) => onChange({ ...value, [key]: v });
  const id = (n: string) => `${idPrefix}-${n}`;
  const [newCat, setNewCat] = useState<{ label: string; slot: Slot } | null>(null);
  const [localCats, setLocalCats] = useState<Category[]>([]);
  const [pending, start] = useTransition();
  const toast = useToast();
  const allCats = [...categories, ...localCats];

  return (
    <div className="space-y-5">
      <Field label="Nome" htmlFor={id("name")}>
        <Input id={id("name")} value={value.name} maxLength={120} onChange={(e) => set("name", e.target.value)} placeholder="Es. Jeans dritti blu" required />
      </Field>

      <div className={cn("grid gap-4", compact ? "sm:grid-cols-2" : "md:grid-cols-2")}>
        <Field label="Categoria" htmlFor={id("cat")}>
          <Select id={id("cat")} value={value.category_id} onChange={(e) => set("category_id", e.target.value)} required>
            <option value="" disabled>Scegli…</option>
            {allCats.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </Select>
          {!newCat ? (
            <button type="button" onClick={() => setNewCat({ label: "", slot: "other" })} className="mt-1 inline-flex items-center gap-1 text-xs text-clay underline underline-offset-4">
              <Plus className="size-3" aria-hidden /> Nuova categoria
            </button>
          ) : (
            <div className="mt-2 space-y-2 rounded-xl bg-paper-2 p-3">
              <Input aria-label="Nome categoria" placeholder="Nome categoria" value={newCat.label} onChange={(e) => setNewCat({ ...newCat, label: e.target.value })} className="h-10" />
              <Select aria-label="Ruolo nell'outfit" value={newCat.slot} onChange={(e) => setNewCat({ ...newCat, slot: e.target.value as Slot })} className="h-10">
                {(Object.keys(SLOT_LABEL) as Slot[]).map((s) => <option key={s} value={s}>Ruolo: {SLOT_LABEL[s]}</option>)}
              </Select>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  loading={pending}
                  disabled={!newCat.label.trim()}
                  onClick={() =>
                    start(async () => {
                      const res = await createCategoryAction(newCat);
                      if (!res.ok) return toast.error(res.error);
                      const created: Category = { id: res.data.id, user_id: "me", slug: newCat.label, label: newCat.label, slot: newCat.slot, sort_order: 200 };
                      setLocalCats((p) => [...p, created]);
                      set("category_id", res.data.id);
                      setNewCat(null);
                      toast.success("Categoria creata");
                    })
                  }
                >
                  Crea
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setNewCat(null)}>Annulla</Button>
              </div>
            </div>
          )}
        </Field>
        <Field label="Sottocategoria" htmlFor={id("sub")} hint="Facoltativa (es. chino, bomber)">
          <Input id={id("sub")} value={value.subcategory} maxLength={60} onChange={(e) => set("subcategory", e.target.value)} />
        </Field>
      </div>

      <Field label="Colore principale">
        <ColorPicker label="Colore principale" value={value.primary_color} onChange={(c) => onChange({ ...value, primary_color: c, secondary_colors: value.secondary_colors.filter((x) => x !== c) })} />
      </Field>
      <Field label="Colori secondari" hint="Facoltativi">
        <ColorPicker label="Colori secondari" multiple exclude={value.primary_color} value={value.secondary_colors} onChange={(c) => set("secondary_colors", toggle(value.secondary_colors, c).slice(0, 4))} />
      </Field>

      <Field label="Stagioni" hint="Nessuna selezione = tutto l'anno">
        <div className="flex flex-wrap gap-2">
          {SEASONS.map((s) => (
            <Chip key={s} selected={value.seasons.includes(s)} onClick={() => set("seasons", toggle(value.seasons, s))}>{SEASON_LABEL[s]}</Chip>
          ))}
        </div>
      </Field>
      <Field label="Stile">
        <div className="flex flex-wrap gap-2">
          {STYLES.map((s) => (
            <Chip key={s} selected={value.styles.includes(s)} onClick={() => set("styles", toggle(value.styles, s).slice(0, 6))}>{s}</Chip>
          ))}
        </div>
      </Field>

      <div className={cn("grid gap-4", compact ? "sm:grid-cols-2" : "md:grid-cols-2 lg:grid-cols-4")}>
        <Field label="Materiale" htmlFor={id("mat")} hint="Se noto">
          <Input id={id("mat")} value={value.material} maxLength={60} onChange={(e) => set("material", e.target.value)} placeholder="Cotone, lana…" />
        </Field>
        <Field label="Fantasia" htmlFor={id("pat")}>
          <Select id={id("pat")} value={value.pattern} onChange={(e) => set("pattern", e.target.value)}>
            {PATTERNS.map((p) => <option key={p} value={p}>{PATTERN_LABEL[p]}</option>)}
          </Select>
        </Field>
        <Field label="Formalità" htmlFor={id("form")}>
          <Select id={id("form")} value={value.formality} onChange={(e) => set("formality", Number(e.target.value))}>
            {[1, 2, 3, 4].map((f) => <option key={f} value={f}>{FORMALITY_LABEL[f]}</option>)}
          </Select>
        </Field>
        <Field label="Vestibilità" htmlFor={id("fit")} hint="Se nota">
          <Select id={id("fit")} value={value.fit} onChange={(e) => set("fit", e.target.value as Fit | "")}>
            <option value="">—</option>
            {FITS.map((f) => <option key={f} value={f}>{FIT_LABEL[f]}</option>)}
          </Select>
        </Field>
      </div>

      <Field label="Disponibilità">
        <div className="flex flex-wrap gap-2">
          {AVAILABILITY.map((s) => (
            <Chip key={s} selected={value.availability_status === s} onClick={() => set("availability_status", s)}>{AVAILABILITY_LABEL[s]}</Chip>
          ))}
        </div>
      </Field>
      {value.availability_status !== "available" && (
        <Field label="Rientro previsto" htmlFor={id("exp")} hint="Solo informativo: il capo non torna disponibile da solo.">
          <Input id={id("exp")} type="date" value={value.expected_available_at} onChange={(e) => set("expected_available_at", e.target.value)} className="max-w-48" />
        </Field>
      )}

      <Field label="Note personali" htmlFor={id("notes")}>
        <Textarea id={id("notes")} value={value.notes} maxLength={1000} onChange={(e) => set("notes", e.target.value)} className="min-h-20" />
      </Field>
      <label className="flex items-center gap-2.5 text-sm">
        <input type="checkbox" checked={value.is_favorite} onChange={(e) => set("is_favorite", e.target.checked)} className="size-4 accent-[var(--clay)]" />
        Segna come preferito
      </label>
    </div>
  );
}
