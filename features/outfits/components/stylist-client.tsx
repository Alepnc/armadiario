"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { ChevronDown, Info, RefreshCw, Shirt, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Field, Select, Textarea } from "@/components/ui/field";
import { EmptyState, Notice, Skeleton } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { generateOutfitsAction } from "@/features/outfits/actions";
import type { GenerationResponse, ProposalView } from "@/features/outfits/types";
import { FORMALITY_LABEL, OCCASIONS, SEASON_LABEL, SEASONS, STYLES, TIMES_OF_DAY, WEATHER, type Season } from "@/lib/constants/wardrobe";
import type { StylistRequest } from "@/lib/validation/outfit";
import { cn } from "@/lib/utils/cn";
import { ColorPicker } from "@/features/wardrobe/components/item-fields";
import { ItemPicker, type PickerItem } from "./item-picker";
import { ProposalCard } from "./proposal-card";

type Req = Omit<StylistRequest, "count" | "variation"> & { count: number; variation: number };

const INITIAL: Req = {
  desiredColors: [],
  avoidColors: [],
  mustInclude: [],
  exclude: [],
  count: 3,
  includeUnavailable: false,
  variation: 0,
};

function pickOne<T extends string>(cur: T | undefined, v: T): T | undefined {
  return cur === v ? undefined : v;
}

export function StylistClient({
  items,
  initialInclude,
  hasEnoughItems,
  aiLabel,
}: {
  items: PickerItem[];
  initialInclude: string[];
  hasEnoughItems: boolean;
  aiLabel: string;
}) {
  const [req, setReq] = useState<Req>({ ...INITIAL, mustInclude: initialInclude });
  const [advanced, setAdvanced] = useState(initialInclude.length > 0);
  const [result, setResult] = useState<GenerationResponse | null>(null);
  const [proposals, setProposals] = useState<ProposalView[]>([]);
  const [usedReq, setUsedReq] = useState<Req>(req);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const toast = useToast();
  const resultsRef = useRef<HTMLDivElement>(null);

  const set = <K extends keyof Req>(k: K, v: Req[K]) => setReq((r) => ({ ...r, [k]: v }));
  const toggleList = (k: "desiredColors" | "avoidColors", c: string) =>
    set(k, req[k].includes(c) ? req[k].filter((x) => x !== c) : [...req[k], c]);

  function run(next: Req) {
    setError(null);
    start(async () => {
      const res = await generateOutfitsAction(next);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setUsedReq(next);
      setResult(res.data);
      setProposals(res.data.proposals);
      requestAnimationFrame(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    });
  }

  if (!hasEnoughItems) {
    return (
      <EmptyState
        icon={<Shirt className="size-6" />}
        title="Servono più capi per comporre un outfit"
        description="Aggiungi almeno una parte superiore, una inferiore (o un abito) e un paio di scarpe disponibili."
        action={<Link href="/wardrobe/new" className="inline-flex h-11 items-center rounded-full bg-ink px-5 text-sm font-medium text-paper">Aggiungi capi</Link>}
      />
    );
  }

  return (
    <div className="space-y-10">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          run({ ...req, variation: 0 });
        }}
        className="space-y-6 rounded-[2rem] border-2 border-ink bg-white p-5 sm:p-8"
      >
        <Field label="Per quale occasione?">
          <div className="flex flex-wrap gap-2">
            {OCCASIONS.map((o) => (
              <Chip key={o.value} selected={req.occasion === o.value} onClick={() => set("occasion", pickOne(req.occasion, o.value))}>
                {o.label}
              </Chip>
            ))}
          </div>
        </Field>

        <Field label="Che stile?">
          <div className="flex flex-wrap gap-2">
            {STYLES.slice(0, 6).map((s) => (
              <Chip key={s} selected={req.style === s} onClick={() => set("style", pickOne(req.style, s))}>
                {s}
              </Chip>
            ))}
          </div>
        </Field>

        <Field label="Qualcosa da aggiungere?" htmlFor="note" hint="Facoltativo, in parole tue: «cena all'aperto, voglio stare comodo, niente nero»">
          <Textarea id="note" value={req.note ?? ""} maxLength={500} onChange={(e) => set("note", e.target.value || undefined)} className="min-h-20" />
        </Field>

        <button
          type="button"
          onClick={() => setAdvanced((a) => !a)}
          aria-expanded={advanced}
          className="flex items-center gap-1.5 text-sm font-medium text-clay"
        >
          Opzioni avanzate <ChevronDown className={cn("size-4 transition-transform", advanced && "rotate-180")} aria-hidden />
        </button>

        {advanced && (
          <div className="space-y-6 border-t border-line pt-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Stagione" htmlFor="season">
                <Select id="season" value={req.season ?? ""} onChange={(e) => set("season", (e.target.value || undefined) as Season | undefined)}>
                  <option value="">Qualsiasi</option>
                  {SEASONS.map((s) => <option key={s} value={s}>{SEASON_LABEL[s]}</option>)}
                </Select>
              </Field>
              <Field label="Meteo" htmlFor="weather">
                <Select id="weather" value={req.weather ?? ""} onChange={(e) => set("weather", e.target.value || undefined)}>
                  <option value="">Non so</option>
                  {WEATHER.map((w) => <option key={w.value} value={w.value}>{w.label}</option>)}
                </Select>
              </Field>
              <Field label="Momento" htmlFor="tod">
                <Select id="tod" value={req.timeOfDay ?? ""} onChange={(e) => set("timeOfDay", e.target.value || undefined)}>
                  <option value="">Tutto il giorno</option>
                  {TIMES_OF_DAY.map((w) => <option key={w.value} value={w.value}>{w.label}</option>)}
                </Select>
              </Field>
              <Field label="Formalità" htmlFor="form">
                <Select id="form" value={req.formality ?? ""} onChange={(e) => set("formality", e.target.value ? Number(e.target.value) : undefined)}>
                  <option value="">Da occasione</option>
                  {[1, 2, 3, 4].map((f) => <option key={f} value={f}>{FORMALITY_LABEL[f]}</option>)}
                </Select>
              </Field>
            </div>

            <Field label="Colori desiderati">
              <ColorPicker label="Colori desiderati" multiple value={req.desiredColors} onChange={(c) => toggleList("desiredColors", c)} />
            </Field>
            <Field label="Colori da evitare">
              <ColorPicker label="Colori da evitare" multiple value={req.avoidColors} onChange={(c) => toggleList("avoidColors", c)} />
            </Field>

            <ItemPicker label="Capi da includere" items={items.filter((i) => i.available || req.includeUnavailable)} value={req.mustInclude} onChange={(v) => set("mustInclude", v)} max={4} blockedIds={req.exclude} emptyHint="Nessun capo disponibile." />
            <ItemPicker label="Capi da escludere" items={items} value={req.exclude} onChange={(v) => set("exclude", v)} max={30} blockedIds={req.mustInclude} />

            <div className="grid items-end gap-4 sm:grid-cols-2">
              <Field label="Quante proposte?" htmlFor="count">
                <Select id="count" value={req.count} onChange={(e) => set("count", Number(e.target.value))}>
                  {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
                </Select>
              </Field>
              <label className="flex items-start gap-2.5 rounded-xl bg-paper-2 p-3 text-sm">
                <input type="checkbox" checked={req.includeUnavailable} onChange={(e) => set("includeUnavailable", e.target.checked)} className="mt-0.5 size-4 accent-[var(--clay)]" />
                <span>
                  Simulazione: includi anche capi in lavaggio o non disponibili
                  <span className="block text-xs text-muted">Saranno chiaramente segnalati come indisponibili.</span>
                </span>
              </label>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <p className="flex items-center gap-1.5 text-xs text-muted">
            <Info className="size-3.5" aria-hidden /> {aiLabel}
          </p>
          <Button type="submit" size="lg" loading={pending} icon={<Sparkles className="size-4" />}>
            Crea outfit
          </Button>
        </div>
      </form>

      <div ref={resultsRef} className="scroll-mt-24 space-y-6" aria-live="polite">
        {pending && proposals.length === 0 && (
          <div className="space-y-4" aria-busy aria-label="Sto componendo gli outfit">
            {Array.from({ length: Math.min(req.count, 2) }).map((_, i) => <Skeleton key={i} className="h-80" />)}
          </div>
        )}
        {error && <Notice tone="error">{error}</Notice>}

        {result && !pending && (
          <>
            {result.modeNote && <Notice tone="info">{result.modeNote}</Notice>}
            {result.notes.map((n) => <Notice key={n} tone="warn">{n}</Notice>)}
            {result.shortage ? (
              <EmptyState
                icon={<Shirt className="size-6" />}
                title="Non riesco a comporre un outfit"
                description={result.shortage.message}
                action={
                  result.shortage.missing.length > 0 ? (
                    <Link href="/wardrobe/new" className="inline-flex h-11 items-center rounded-full bg-ink px-5 text-sm font-medium text-paper">
                      Aggiungi: {result.shortage.missing.join(", ")}
                    </Link>
                  ) : undefined
                }
              />
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <h2 className="text-3xl">Le tue proposte</h2>
                  <Button variant="secondary" size="sm" onClick={() => run({ ...usedReq, variation: usedReq.variation + 1 })} icon={<RefreshCw className="size-4" />}>
                    Rigenera tutto
                  </Button>
                </div>
                <div className="grid gap-6 lg:grid-cols-2">
                  {proposals.map((p) => (
                    <ProposalCard
                      key={p.key}
                      proposal={p}
                      request={usedReq}
                      onChange={(next) => setProposals((list) => list.map((x) => (x.key === p.key ? next : x)))}
                      onExcludeItem={(id) => {
                        setUsedReq((r) => ({ ...r, exclude: [...r.exclude, id] }));
                        toast.success("Capo escluso dalle prossime proposte");
                      }}
                    />
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

