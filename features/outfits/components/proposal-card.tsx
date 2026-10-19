"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ArrowLeftRight, Ban, Bookmark, BookmarkCheck, Heart, Lightbulb, RefreshCw, Sparkles, Wand2 } from "lucide-react";
import { OutfitCollage } from "@/components/outfit-collage";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { alternativesAction, generateOutfitsAction, rebuildProposalAction, saveOutfitAction } from "@/features/outfits/actions";
import type { OutfitItemView, ProposalView } from "@/features/outfits/types";
import type { StylistRequest } from "@/lib/validation/outfit";
import { cn } from "@/lib/utils/cn";

type Req = Omit<StylistRequest, "count" | "variation"> & { count: number; variation: number };

export function ProposalCard({
  proposal,
  request,
  onChange,
  onExcludeItem,
}: {
  proposal: ProposalView;
  request: Req;
  onChange: (next: ProposalView) => void;
  onExcludeItem: (itemId: string) => void;
}) {
  const toast = useToast();
  const [pending, start] = useTransition();
  const [savedId, setSavedId] = useState<string | null>(null);
  const [favorite, setFavorite] = useState(false);
  const [swapFor, setSwapFor] = useState<OutfitItemView | null>(null);
  const [alternatives, setAlternatives] = useState<OutfitItemView[] | null>(null);

  const ids = proposal.items.map((i) => i.id).filter((x): x is string => Boolean(x));

  function save(fav: boolean) {
    start(async () => {
      const res = await saveOutfitAction({
        name: proposal.title,
        occasion: request.occasion ?? null,
        style: request.style ?? null,
        season: request.season ?? null,
        description: proposal.reason,
        tips: proposal.tips,
        is_favorite: fav,
        source: proposal.source,
        items: proposal.items.filter((i) => i.id).map((i) => ({ item_id: i.id!, role: i.role })),
      });
      if (!res.ok) return toast.error(res.error);
      setSavedId(res.data.id);
      setFavorite(fav);
      toast.success(fav ? "Salvato tra i preferiti" : "Outfit salvato");
    });
  }

  function replaceItem(oldId: string, newId: string) {
    start(async () => {
      const nextIds = ids.map((i) => (i === oldId ? newId : i));
      const res = await rebuildProposalAction(request, nextIds, proposal.title);
      if (!res.ok) return toast.error(res.error);
      onChange({ ...res.data, key: proposal.key });
      setSwapFor(null);
      setAlternatives(null);
      setSavedId(null);
    });
  }

  function openSwap(item: OutfitItemView) {
    if (!item.id) return;
    setSwapFor(item);
    setAlternatives(null);
    start(async () => {
      const res = await alternativesAction(request, ids, item.id!);
      if (!res.ok) {
        setSwapFor(null);
        return toast.error(res.error);
      }
      setAlternatives(res.data.alternatives);
    });
  }

  function excludeItem(item: OutfitItemView) {
    if (!item.id) return;
    start(async () => {
      const res = await alternativesAction({ ...request, exclude: [...request.exclude, item.id!] }, ids, item.id!);
      if (!res.ok) return toast.error(res.error);
      const best = res.data.alternatives[0];
      if (!best?.id) return toast.error(`Non ho alternative compatibili a «${item.name}».`);
      onExcludeItem(item.id!);
      const nextIds = ids.map((i) => (i === item.id ? best.id! : i));
      const rebuilt = await rebuildProposalAction({ ...request, exclude: [...request.exclude, item.id!] }, nextIds, proposal.title);
      if (!rebuilt.ok) return toast.error(rebuilt.error);
      onChange({ ...rebuilt.data, key: proposal.key });
      setSavedId(null);
      toast.success(`«${item.name}» escluso e sostituito`);
    });
  }

  function variant() {
    const anchor = proposal.items.find((i) => i.slot === "dress" || i.slot === "top")?.id;
    start(async () => {
      const res = await generateOutfitsAction(
        { ...request, count: 1, variation: request.variation + 1 + Math.floor(Math.random() * 50), mustInclude: anchor ? [anchor] : [] },
        ids,
      );
      if (!res.ok) return toast.error(res.error);
      const next = res.data.proposals[0];
      if (!next) return toast.error(res.data.shortage?.message ?? "Nessuna variante disponibile");
      onChange({ ...next, key: proposal.key, title: proposal.title });
      setSavedId(null);
    });
  }

  return (
    <article className="rise rounded-[1.75rem] border-2 border-ink bg-white p-4 sm:p-6" aria-busy={pending}>
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-3xl">{proposal.title}</h3>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-muted">
            {request.occasion && <span>{request.occasion}</span>}
            {request.style && <span>· {request.style}</span>}
            <span className="inline-flex items-center gap-1">
              {proposal.source === "ai" ? <><Sparkles className="size-3" aria-hidden /> Scelto e spiegato dall&apos;AI</> : <><Wand2 className="size-3" aria-hidden /> Regole di abbinamento</>}
            </span>
          </p>
        </div>
        <div className="flex gap-1.5">
          <Button size="sm" variant={favorite ? "primary" : "secondary"} onClick={() => save(true)} disabled={pending || !!savedId} aria-label="Salva tra i preferiti" icon={<Heart className={cn("size-4", favorite && "fill-current")} />}>
            <span className="hidden sm:inline">Preferito</span>
          </Button>
          {savedId ? (
            <Link href={`/outfits/${savedId}`} className="inline-flex h-9 items-center gap-2 rounded-full bg-sage-tint px-3.5 text-sm font-medium text-sage">
              <BookmarkCheck className="size-4" aria-hidden /> Salvato · apri
            </Link>
          ) : (
            <Button size="sm" onClick={() => save(false)} loading={pending} icon={<Bookmark className="size-4" />}>Salva</Button>
          )}
        </div>
      </header>

      {proposal.hasUnavailable && (
        <div className="mb-4">
          <Notice tone="warn">Simulazione: contiene capi attualmente non disponibili (evidenziati).</Notice>
        </div>
      )}

      <OutfitCollage
        items={proposal.items}
        renderTileAction={(item) =>
          item.id ? (
            <div className="flex shrink-0 gap-0.5">
              <button type="button" onClick={() => openSwap(item)} disabled={pending} aria-label={`Cambia ${item.name}`} title="Cambia questo capo" className="grid size-8 place-items-center rounded-full text-ink-soft hover:bg-paper-2">
                <ArrowLeftRight className="size-4" />
              </button>
              <button type="button" onClick={() => excludeItem(item)} disabled={pending} aria-label={`Escludi ${item.name}`} title="Escludi e sostituisci" className="grid size-8 place-items-center rounded-full text-ink-soft hover:bg-danger-tint hover:text-danger">
                <Ban className="size-4" />
              </button>
            </div>
          ) : null
        }
      />

      {swapFor && (
        <div className="mt-4 rounded-2xl bg-paper-2 p-3" role="region" aria-label={`Alternative a ${swapFor.name}`}>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-medium">Al posto di «{swapFor.name}»</p>
            <button type="button" className="text-xs underline underline-offset-4" onClick={() => { setSwapFor(null); setAlternatives(null); }}>Chiudi</button>
          </div>
          {alternatives === null ? (
            <p className="text-sm text-muted">Cerco alternative compatibili…</p>
          ) : alternatives.length === 0 ? (
            <p className="text-sm text-muted">Nessuna alternativa compatibile e disponibile.</p>
          ) : (
            <ul className="flex gap-2 overflow-x-auto pb-1">
              {alternatives.map((a) => (
                <li key={a.id} className="w-24 shrink-0">
                  <button type="button" onClick={() => a.id && swapFor.id && replaceItem(swapFor.id, a.id)} disabled={pending} className="block w-full text-left">
                    <span className="block aspect-square overflow-hidden rounded-xl bg-white ring-2 ring-ink">
                      {/* eslint-disable-next-line @next/next/no-img-element -- signed URL */}
                      {a.thumbUrl && <img src={a.thumbUrl} alt="" className="size-full object-cover" />}
                    </span>
                    <span className="mt-1 block truncate text-xs">{a.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <p className="mt-5 text-[15px] leading-relaxed text-ink-soft">{proposal.reason}</p>
      {proposal.tips.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {proposal.tips.map((t) => (
            <li key={t} className="flex items-start gap-2 text-sm text-ink-soft">
              <Lightbulb className="mt-0.5 size-4 shrink-0 text-clay" aria-hidden /> {t}
            </li>
          ))}
        </ul>
      )}

      <footer className="mt-5 flex flex-wrap gap-2 border-t border-line pt-4">
        <Button size="sm" variant="ghost" onClick={variant} disabled={pending} icon={<RefreshCw className={cn("size-4", pending && "animate-spin")} />}>
          Richiedi una variante
        </Button>
      </footer>
    </article>
  );
}
