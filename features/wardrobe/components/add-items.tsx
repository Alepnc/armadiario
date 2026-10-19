"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Camera, CheckCircle2, ChevronDown, ImagePlus, Loader2, RotateCw, Sparkles, Trash2, X } from "lucide-react";
import { Button, LinkButton } from "@/components/ui/button";
import { Notice } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { createItemAction, discardUploadAction } from "@/features/wardrobe/actions";
import { analyzeImage, ApiError, compressImage, uploadImage, type UploadedImage } from "@/lib/client/upload";
import type { Category } from "@/types/db";
import { cn } from "@/lib/utils/cn";
import { draftIsComplete, draftToInput, EMPTY_DRAFT, ItemFields, type ItemDraft } from "./item-fields";

export type AiMode = "enabled" | "no-consent" | "not-configured";

type Phase = "queued" | "uploading" | "analyzing" | "ready" | "saving" | "saved" | "failed";

interface Entry {
  id: string;
  file: File;
  preview: string;
  phase: Phase;
  error: string | null;
  upload: UploadedImage | null;
  draft: ItemDraft;
  aiNote: string | null;
  aiRaw: unknown;
  aiTried: boolean;
  dupAck: boolean;
  expanded: boolean;
}

const MAX_FILES = 20;
const CONCURRENCY = 2;

export function AddItems({ categories, aiMode }: { categories: Category[]; aiMode: AiMode }) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const started = useRef(new Set<string>());
  const toast = useToast();
  const router = useRouter();

  const patch = useCallback((id: string, p: Partial<Entry>) => {
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, ...p } : e)));
  }, []);

  const addFiles = useCallback(
    (files: FileList | File[]) => {
      const list = Array.from(files).filter((f) => f.type.startsWith("image/") || /\.(heic|heif)$/i.test(f.name));
      if (list.length === 0) return toast.error("Seleziona delle immagini (JPEG, PNG o WebP).");
      setEntries((prev) => {
        const room = MAX_FILES - prev.length;
        if (list.length > room) toast.error(`Puoi caricare al massimo ${MAX_FILES} foto per volta.`);
        const added = list.slice(0, Math.max(0, room)).map<Entry>((file) => ({
          id: crypto.randomUUID(),
          file,
          preview: URL.createObjectURL(file),
          phase: "queued",
          error: null,
          upload: null,
          draft: { ...EMPTY_DRAFT, name: file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").slice(0, 60) },
          aiNote: null,
          aiRaw: null,
          aiTried: false,
          dupAck: false,
          expanded: false,
        }));
        return [...prev, ...added];
      });
    },
    [toast],
  );

  const runEntry = useCallback(
    async (entry: Entry) => {
      let upload = entry.upload;
      if (!upload) {
        patch(entry.id, { phase: "uploading", error: null });
        try {
          upload = await uploadImage(await compressImage(entry.file), "item");
          patch(entry.id, { upload });
        } catch (e) {
          patch(entry.id, { phase: "failed", error: e instanceof ApiError ? e.message : "Caricamento non riuscito" });
          return;
        }
      }
      if (aiMode === "enabled" && !entry.aiTried) {
        patch(entry.id, { phase: "analyzing", aiTried: true });
        try {
          const { suggestion, raw } = await analyzeImage(upload.path, upload.hash);
          setEntries((prev) =>
            prev.map((e) =>
              e.id !== entry.id
                ? e
                : {
                    ...e,
                    aiRaw: raw ?? null,
                    aiNote: "Dati suggeriti dall'AI: sono stime, controllali prima di salvare.",
                    draft: {
                      ...e.draft,
                      name: suggestion.name || e.draft.name,
                      category_id: suggestion.category_id ?? e.draft.category_id,
                      subcategory: suggestion.subcategory ?? "",
                      primary_color: suggestion.primary_color ?? e.draft.primary_color,
                      secondary_colors: suggestion.secondary_colors,
                      seasons: suggestion.seasons as ItemDraft["seasons"],
                      styles: suggestion.styles,
                      material: suggestion.material ?? "",
                      pattern: suggestion.pattern,
                      formality: suggestion.formality,
                      fit: (suggestion.fit as ItemDraft["fit"]) ?? "",
                    },
                  },
            ),
          );
        } catch (e) {
          patch(entry.id, { aiNote: e instanceof ApiError ? e.message : "Analisi AI non riuscita: compila i dati a mano." });
        }
      }
      patch(entry.id, { phase: "ready", expanded: true });
    },
    [aiMode, patch],
  );

  // Simple bounded-concurrency scheduler.
  useEffect(() => {
    const active = entries.filter((e) => e.phase === "uploading" || e.phase === "analyzing").length;
    let slots = CONCURRENCY - active;
    for (const e of entries) {
      if (slots <= 0) break;
      if (e.phase === "queued" && !started.current.has(e.id)) {
        started.current.add(e.id);
        slots--;
        void runEntry(e);
      }
    }
  }, [entries, runEntry]);

  const previews = useRef<string[]>([]);
  useEffect(() => {
    previews.current = entries.map((e) => e.preview);
  }, [entries]);
  useEffect(() => () => previews.current.forEach((u) => URL.revokeObjectURL(u)), []);

  async function save(entry: Entry): Promise<boolean> {
    if (!entry.upload) return false;
    patch(entry.id, { phase: "saving", error: null });
    const res = await createItemAction(
      draftToInput(entry.draft),
      { image_path: entry.upload.path, thumb_path: entry.upload.thumbPath, image_hash: entry.upload.hash || null },
      entry.aiRaw ?? undefined,
    );
    if (!res.ok) {
      patch(entry.id, { phase: "ready", error: res.error });
      return false;
    }
    patch(entry.id, { phase: "saved" });
    return true;
  }

  async function saveAll() {
    let saved = 0;
    for (const e of entries) {
      const blocked = e.upload && e.upload.duplicates.length > 0 && !e.dupAck;
      if (e.phase === "ready" && draftIsComplete(e.draft) && !blocked) {
        if (await save(e)) saved++;
      }
    }
    if (saved > 0) {
      toast.success(saved === 1 ? "Capo salvato" : `${saved} capi salvati`);
      router.refresh();
    }
  }

  async function remove(entry: Entry) {
    if (entry.upload && entry.phase !== "saved") {
      void discardUploadAction([entry.upload.path, entry.upload.thumbPath].filter((p): p is string => Boolean(p)));
    }
    URL.revokeObjectURL(entry.preview);
    setEntries((prev) => prev.filter((e) => e.id !== entry.id));
  }

  const savable = entries.filter(
    (e) => e.phase === "ready" && draftIsComplete(e.draft) && !(e.upload && e.upload.duplicates.length > 0 && !e.dupAck),
  ).length;
  const busy = entries.some((e) => ["queued", "uploading", "analyzing", "saving"].includes(e.phase));
  const savedCount = entries.filter((e) => e.phase === "saved").length;

  return (
    <div className="space-y-6">
      {aiMode === "no-consent" && (
        <Notice tone="info">
          L&apos;analisi AI delle foto è disattivata perché non hai dato il consenso. Puoi attivarla in{" "}
          <Link href="/settings" className="font-medium underline">Impostazioni → Privacy</Link>. Per ora compila i dati a mano.
        </Notice>
      )}
      {aiMode === "not-configured" && (
        <Notice tone="info">L&apos;analisi AI non è configurata su questo server: compila i dati a mano (la foto è sempre obbligatoria).</Notice>
      )}

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          addFiles(e.dataTransfer.files);
        }}
        className={cn(
          "rounded-3xl border-2 border-dashed px-6 py-10 text-center transition-colors",
          dragging ? "border-ink bg-lime" : "border-ink bg-lime/30",
        )}
      >
        <div className="mx-auto mb-4 grid size-14 -rotate-6 place-items-center rounded-2xl bg-pop text-ink ring-2 ring-ink">
          <ImagePlus className="size-6" aria-hidden />
        </div>
        <p className="font-display text-2xl font-bold">Aggiungi le foto dei tuoi capi</p>
        <p className="mx-auto mt-1.5 max-w-sm text-sm text-ink-soft">
          Una per volta o fino a {MAX_FILES} insieme. Funziona meglio con il capo ben visibile su sfondo semplice.
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <Button onClick={() => fileInput.current?.click()} icon={<ImagePlus className="size-4" />}>Scegli foto</Button>
          <Button variant="secondary" className="md:hidden" onClick={() => cameraInput.current?.click()} icon={<Camera className="size-4" />}>
            Scatta
          </Button>
        </div>
        <input ref={fileInput} type="file" accept="image/*" multiple hidden onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; }} />
        <input ref={cameraInput} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; }} />
      </div>

      {entries.length > 0 && (
        <>
          <ul className="space-y-4" aria-label="Coda di caricamento">
            {entries.map((e) => (
              <QueueRow
                key={e.id}
                entry={e}
                categories={categories}
                aiMode={aiMode}
                onChange={(draft) => patch(e.id, { draft })}
                onToggle={() => patch(e.id, { expanded: !e.expanded })}
                onAckDup={() => patch(e.id, { dupAck: true })}
                onSave={async () => {
                  if (await save(e)) {
                    toast.success("Capo salvato");
                    router.refresh();
                  }
                }}
                onRemove={() => remove(e)}
                onRetry={() => {
                  started.current.delete(e.id);
                  patch(e.id, { phase: "queued", error: null, aiTried: false });
                }}
                onRetryAnalysis={() => {
                  started.current.delete(e.id);
                  patch(e.id, { phase: "queued", aiTried: false, aiNote: null });
                }}
              />
            ))}
          </ul>

          <div className="sticky bottom-20 z-20 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-ink p-3 pl-5 text-paper shadow-xl md:bottom-4">
            <span className="text-sm">
              {savedCount > 0 && <>{savedCount} salvati · </>}
              {busy ? "Elaborazione in corso…" : `${savable} pronti da salvare`}
            </span>
            <div className="flex gap-2">
              {savedCount > 0 && (
                <LinkButton href="/wardrobe" variant="secondary" size="sm">Vai al guardaroba</LinkButton>
              )}
              <Button size="sm" onClick={saveAll} disabled={savable === 0 || busy} className="bg-clay hover:bg-clay-deep">
                Salva {savable > 1 ? `tutti (${savable})` : ""}
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function QueueRow({
  entry: e,
  categories,
  aiMode,
  onChange,
  onToggle,
  onAckDup,
  onSave,
  onRemove,
  onRetry,
  onRetryAnalysis,
}: {
  entry: Entry;
  categories: Category[];
  aiMode: AiMode;
  onChange: (d: ItemDraft) => void;
  onToggle: () => void;
  onAckDup: () => void;
  onSave: () => void;
  onRemove: () => void;
  onRetry: () => void;
  onRetryAnalysis: () => void;
}) {
  const working = e.phase === "queued" || e.phase === "uploading" || e.phase === "analyzing";
  const dups = e.upload?.duplicates ?? [];
  const blockedByDup = dups.length > 0 && !e.dupAck;
  const complete = draftIsComplete(e.draft);
  const label: Record<Phase, string> = {
    queued: "In coda",
    uploading: "Caricamento…",
    analyzing: "Analisi AI…",
    ready: complete ? "Pronto" : "Completa i dati",
    saving: "Salvataggio…",
    saved: "Salvato",
    failed: "Errore",
  };

  return (
    <li className={cn("overflow-hidden rounded-3xl border-2 bg-white", e.phase === "failed" ? "border-danger" : "border-ink", e.phase === "saved" && "opacity-70")}>
      <div className="flex items-center gap-4 p-3 sm:p-4">
        {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview */}
        <img src={e.preview} alt="" className="size-20 shrink-0 rounded-2xl object-cover sm:size-24" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{e.draft.name || e.file.name}</p>
          <p className={cn("mt-0.5 flex items-center gap-1.5 text-sm", e.phase === "failed" ? "text-danger" : e.phase === "saved" ? "text-sage" : "text-ink-soft")}>
            {working || e.phase === "saving" ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : e.phase === "saved" ? <CheckCircle2 className="size-3.5" aria-hidden /> : e.phase === "failed" ? <AlertTriangle className="size-3.5" aria-hidden /> : null}
            <span role="status">{label[e.phase]}</span>
          </p>
          {working && (
            <div className="mt-2 h-1 w-full max-w-48 overflow-hidden rounded-full bg-sand" aria-hidden>
              <div className="skeleton h-full w-full" />
            </div>
          )}
          {e.error && <p role="alert" className="mt-1 text-sm text-danger">{e.error}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {e.phase === "failed" && (
            <Button size="sm" variant="secondary" onClick={onRetry} icon={<RotateCw className="size-3.5" />}>Riprova</Button>
          )}
          {(e.phase === "ready" || e.phase === "saved") && e.phase !== "saved" && (
            <button type="button" onClick={onToggle} aria-expanded={e.expanded} aria-label={e.expanded ? "Nascondi dettagli" : "Mostra dettagli"} className="grid size-9 place-items-center rounded-full hover:bg-paper-2">
              <ChevronDown className={cn("size-4 transition-transform", e.expanded && "rotate-180")} />
            </button>
          )}
          {e.phase !== "saving" && (
            <button type="button" onClick={onRemove} aria-label={e.phase === "saved" ? "Rimuovi dalla coda" : "Scarta questa foto"} className="grid size-9 place-items-center rounded-full text-muted hover:bg-danger-tint hover:text-danger">
              {e.phase === "saved" ? <X className="size-4" /> : <Trash2 className="size-4" />}
            </button>
          )}
        </div>
      </div>

      {e.phase === "ready" && e.expanded && (
        <div className="space-y-4 border-t border-line bg-paper/60 p-4 sm:p-5">
          {e.aiNote && (
            <div className="flex items-start justify-between gap-3 rounded-2xl bg-lilac/50 px-3.5 py-2.5 text-sm text-ink ring-[1.5px] ring-ink">
              <span className="flex gap-2"><Sparkles className="mt-0.5 size-4 shrink-0" aria-hidden />{e.aiNote}</span>
              {aiMode === "enabled" && !e.aiRaw && (
                <button type="button" onClick={onRetryAnalysis} className="shrink-0 underline underline-offset-4">Riprova</button>
              )}
            </div>
          )}
          {dups.length > 0 && (
            <div className="rounded-xl bg-danger-tint px-3.5 py-3 text-sm text-danger">
              <p className="flex gap-2"><AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                Sembra molto simile a {dups.map((d) => `«${d.name}»`).join(", ")}, già nel tuo guardaroba.
              </p>
              {blockedByDup ? (
                <Button size="sm" variant="secondary" className="mt-2" onClick={onAckDup}>Aggiungi comunque</Button>
              ) : (
                <p className="mt-1 text-xs">Aggiunta confermata: verrà salvato come nuovo capo.</p>
              )}
            </div>
          )}
          <ItemFields value={e.draft} onChange={onChange} categories={categories} idPrefix={e.id} compact />
          <div className="flex justify-end">
            <Button onClick={onSave} disabled={!complete || blockedByDup}>Salva questo capo</Button>
          </div>
        </div>
      )}
    </li>
  );
}
