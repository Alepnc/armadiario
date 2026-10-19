"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bookmark, Camera, Check, Info, Loader2, RefreshCw, Shirt, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { setConsentAction, setProfilePhotoAction } from "@/features/profile/actions";
import { ApiError, compressImage, uploadImage } from "@/lib/client/upload";

export interface PastResult {
  id: string;
  imageUrl: string | null;
  createdAt: string;
  isSaved: boolean;
}

interface JobView {
  id: string;
  status: "pending" | "processing" | "completed" | "failed";
  errorMessage: string | null;
  step: number;
  totalSteps: number;
  skipped: string[];
  isSaved: boolean;
  imageUrl: string | null;
}

export const PHOTO_TIPS = [
  "Foto nitida e ben illuminata, meglio con luce naturale.",
  "Figura intera o almeno busto, di fronte e in posa naturale.",
  "Sfondo semplice e abbigliamento aderente, così i capi si vedono bene.",
  "Una sola persona nell'immagine.",
];

export function TryOnClient({
  outfitId,
  configured,
  hasConsent,
  photoUrl,
  blockedReason,
  past,
}: {
  outfitId: string;
  configured: boolean;
  hasConsent: boolean;
  photoUrl: string | null;
  blockedReason: string | null;
  past: PastResult[];
}) {
  const [consent, setConsent] = useState(hasConsent);
  const [photo, setPhoto] = useState<string | null>(photoUrl);
  const [job, setJob] = useState<JobView | null>(null);
  const [starting, setStarting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [gallery, setGallery] = useState<PastResult[]>(past);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const router = useRouter();

  // Poll while the job is running. Each GET also advances the job server-side.
  const jobId = job?.id;
  const active = job && (job.status === "pending" || job.status === "processing");
  useEffect(() => {
    if (!jobId || !active) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await fetch(`/api/try-on/${jobId}`, { cache: "no-store" });
        const json = (await res.json()) as JobView & { error?: string };
        if (cancelled) return;
        if (!res.ok) throw new Error(json.error);
        setJob(json);
        if (json.status === "completed") router.refresh();
      } catch {
        if (!cancelled) setError("Connessione interrotta durante la generazione. Controlla lo stato tra poco.");
      }
    };
    const timer = setInterval(tick, 3500);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [jobId, active, router]);

  const start = useCallback(async () => {
    setError(null);
    setStarting(true);
    try {
      const res = await fetch("/api/try-on", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ outfitId }),
      });
      const json = (await res.json()) as { id?: string; error?: string };
      if (!res.ok || !json.id) throw new Error(json.error ?? "Impossibile avviare la prova virtuale.");
      setJob({ id: json.id, status: "pending", errorMessage: null, step: 1, totalSteps: 1, skipped: [], isSaved: false, imageUrl: null });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Impossibile avviare la prova virtuale.");
    } finally {
      setStarting(false);
    }
  }, [outfitId]);

  async function onPhoto(file: File) {
    setUploading(true);
    setError(null);
    try {
      const up = await uploadImage(await compressImage(file, 1400), "tryon-photo");
      const res = await setProfilePhotoAction("tryon", up.path);
      if (!res.ok) throw new ApiError(res.error);
      setPhoto(URL.createObjectURL(file));
      toast.success("Foto salvata nel tuo profilo (privata)");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Caricamento non riuscito");
    } finally {
      setUploading(false);
    }
  }

  async function mutate(id: string, kind: "save" | "unsave" | "delete") {
    const res = await fetch(`/api/try-on/${id}`, {
      method: kind === "delete" ? "DELETE" : "PATCH",
      headers: { "content-type": "application/json" },
      body: kind === "delete" ? undefined : JSON.stringify({ saved: kind === "save" }),
    });
    if (!res.ok) return toast.error("Operazione non riuscita. Riprova.");
    if (kind === "delete") {
      setGallery((g) => g.filter((x) => x.id !== id));
      if (job?.id === id) setJob(null);
      toast.success("Immagine eliminata");
    } else {
      setJob((j) => (j && j.id === id ? { ...j, isSaved: kind === "save" } : j));
      setGallery((g) => g.map((x) => (x.id === id ? { ...x, isSaved: kind === "save" } : x)));
      toast.success(kind === "save" ? "Salvata nella tua galleria" : "Rimossa dalla galleria");
    }
    router.refresh();
  }

  if (!configured) {
    return (
      <Notice tone="info">
        <p className="font-medium">La prova virtuale non è configurata su questo server.</p>
        <p className="mt-1">Puoi comunque vedere l&apos;outfit con le foto originali dei capi. L&apos;amministratore può attivarla configurando il provider (vedi README).</p>
      </Notice>
    );
  }

  const photoStep = !photo;
  return (
    <div className="space-y-8">
      <section className="grid gap-6 md:grid-cols-[minmax(0,300px)_1fr]">
        <div>
          <div className="aspect-[3/4] overflow-hidden rounded-3xl bg-paper-2 ring-2 ring-ink">
            {photo ? (
              // eslint-disable-next-line @next/next/no-img-element -- signed URL / blob
              <img src={photo} alt="La tua foto" className="size-full object-cover" />
            ) : (
              <div className="grid size-full place-items-center p-6 text-center text-muted">
                <div>
                  <Camera className="mx-auto mb-2 size-7" aria-hidden />
                  <p className="text-sm">Nessuna foto caricata</p>
                </div>
              </div>
            )}
          </div>
          <input ref={fileInput} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void onPhoto(f); e.target.value = ""; }} />
          <Button variant="secondary" className="mt-3 w-full" loading={uploading} icon={<Upload className="size-4" />} onClick={() => fileInput.current?.click()}>
            {photo ? "Cambia foto" : "Carica la tua foto"}
          </Button>
        </div>

        <div className="space-y-5">
          <div className="rounded-2xl bg-sky/40 p-4 ring-2 ring-ink">
            <p className="mb-2 text-sm font-semibold">Per un risultato migliore</p>
            <ul className="space-y-1.5 text-sm text-ink-soft">
              {PHOTO_TIPS.map((t) => (
                <li key={t} className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-sage" aria-hidden />{t}</li>
              ))}
            </ul>
          </div>

          {!consent && (
            <div className="rounded-2xl border-2 border-ink bg-lime/50 p-4 text-sm text-ink">
              <p className="flex gap-2"><Info className="mt-0.5 size-4 shrink-0" aria-hidden />
                Per generare l&apos;immagine, la tua foto e le foto dei capi vengono inviate a un servizio AI esterno. Non le usiamo per altri scopi e puoi revocare il consenso quando vuoi in{" "}
                <Link href="/settings" className="underline">Impostazioni</Link>.
              </p>
              <Button className="mt-3" size="sm" onClick={async () => {
                const res = await setConsentAction({ tryon: true });
                if (!res.ok) return toast.error(res.error);
                setConsent(true);
              }}>
                Acconsento all&apos;invio delle immagini
              </Button>
            </div>
          )}

          {blockedReason && <Notice tone="warn">{blockedReason}</Notice>}
          {error && <Notice tone="error">{error}</Notice>}

          {(!job || job.status === "failed") && (
            <Button size="lg" onClick={start} loading={starting} disabled={photoStep || !consent || !!blockedReason} icon={<Shirt className="size-4" />}>
              {job?.status === "failed" ? "Riprova" : "Genera la prova virtuale"}
            </Button>
          )}
          {photoStep && <p className="text-xs text-muted">Carica prima una tua fotografia.</p>}

          {job && (job.status === "pending" || job.status === "processing") && (
            <div role="status" className="rounded-2xl border-2 border-ink bg-white p-5">
              <p className="flex items-center gap-2 font-medium"><Loader2 className="size-4 animate-spin" aria-hidden /> Sto generando l&apos;immagine…</p>
              <p className="mt-1 text-sm text-ink-soft">Di solito servono da 30 secondi a qualche minuto. Puoi lasciare aperta questa pagina.</p>
              {job.totalSteps > 1 && <p className="mt-2 text-xs text-muted">Capo {job.step} di {job.totalSteps}</p>}
            </div>
          )}

          {job?.status === "failed" && <Notice tone="error">{job.errorMessage ?? "Generazione non riuscita."}</Notice>}
        </div>
      </section>

      {job?.status === "completed" && job.imageUrl && (
        <section className="rise grid gap-6 md:grid-cols-[minmax(0,420px)_1fr]" aria-label="Risultato">
          <div className="overflow-hidden rounded-3xl ring-2 ring-ink">
            {/* eslint-disable-next-line @next/next/no-img-element -- signed URL */}
            <img src={job.imageUrl} alt="Anteprima dell'outfit indossato, generata dall'AI" className="w-full" />
          </div>
          <div className="space-y-4">
            <h2 className="text-2xl">Ecco il risultato</h2>
            <Notice tone="info">
              Immagine generata dall&apos;AI: è un&apos;<strong>approssimazione illustrativa</strong>, non una riproduzione fedele dei capi reali o del tuo aspetto. Dettagli, proporzioni e colori possono differire.
            </Notice>
            {job.skipped.length > 0 && (
              <Notice tone="warn">Non rappresentati nell&apos;immagine (il servizio non li supporta o sono sovrapposti): {job.skipped.join(", ")}.</Notice>
            )}
            <div className="flex flex-wrap gap-2">
              <Button variant={job.isSaved ? "secondary" : "primary"} icon={<Bookmark className="size-4" />} onClick={() => mutate(job.id, job.isSaved ? "unsave" : "save")}>
                {job.isSaved ? "Salvata in galleria" : "Salva in galleria"}
              </Button>
              <Button variant="secondary" icon={<RefreshCw className="size-4" />} onClick={() => { setJob(null); void start(); }}>Rigenera</Button>
              <Button variant="ghost" className="text-danger hover:bg-danger-tint" icon={<Trash2 className="size-4" />} onClick={() => mutate(job.id, "delete")}>Elimina</Button>
            </div>
            <p className="text-xs text-muted">Se non la salvi in galleria resta comunque privata e puoi eliminarla in ogni momento.</p>
          </div>
        </section>
      )}

      {gallery.length > 0 && (
        <section aria-label="Immagini generate per questo outfit">
          <h2 className="mb-4 text-xl">Generate in precedenza</h2>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {gallery.map((g) => (
              <li key={g.id} className="space-y-1.5">
                <div className="aspect-[3/4] overflow-hidden rounded-2xl bg-paper-2 ring-2 ring-ink">
                  {/* eslint-disable-next-line @next/next/no-img-element -- signed URL */}
                  {g.imageUrl && <img src={g.imageUrl} alt="Prova virtuale generata" loading="lazy" className="size-full object-cover" />}
                </div>
                <div className="flex items-center justify-between text-xs text-muted">
                  <span>{new Date(g.createdAt).toLocaleDateString("it-IT", { day: "numeric", month: "short" })}{g.isSaved ? " · in galleria" : ""}</span>
                  <button type="button" onClick={() => mutate(g.id, "delete")} aria-label="Elimina immagine" className="rounded p-1 hover:bg-danger-tint hover:text-danger">
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
