"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/field";
import { Card } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { deleteAccountAction, setConsentAction, setProfilePhotoAction } from "@/features/profile/actions";
import { deleteAllGeneratedImagesAction } from "@/features/virtual-try-on/actions";

function Toggle({ checked, onChange, label, description, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; description: string; disabled?: boolean }) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 py-2">
      <span>
        <span className="block font-medium">{label}</span>
        <span className="mt-0.5 block text-sm text-ink-soft">{description}</span>
      </span>
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 h-6 w-11 shrink-0 cursor-pointer appearance-none rounded-full bg-sand transition-colors checked:bg-clay relative after:absolute after:left-0.5 after:top-0.5 after:size-5 after:rounded-full after:bg-white after:shadow after:transition-transform checked:after:translate-x-5"
      />
    </label>
  );
}

export function SettingsPanel({
  aiConsent,
  visionConsent,
  tryonConsent,
  hasTryOnPhoto,
  accountDeletionEnabled,
}: {
  aiConsent: boolean;
  visionConsent: boolean;
  tryonConsent: boolean;
  hasTryOnPhoto: boolean;
  accountDeletionEnabled: boolean;
}) {
  const [ai, setAi] = useState(aiConsent);
  const [vision, setVision] = useState(visionConsent);
  const [tryon, setTryon] = useState(tryonConsent);
  const [photo, setPhoto] = useState(hasTryOnPhoto);
  const [pending, start] = useTransition();
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [accountDialog, setAccountDialog] = useState(false);
  const toast = useToast();
  const router = useRouter();

  async function consent(kind: "ai" | "vision" | "tryon", value: boolean) {
    const setters = { ai: setAi, vision: setVision, tryon: setTryon } as const;
    const prev = { ai, vision, tryon };
    setters[kind](value);
    if (kind === "ai" && !value) setVision(false); // photos need the base consent
    const res = await setConsentAction({ [kind]: value });
    if (!res.ok) {
      setAi(prev.ai);
      setVision(prev.vision);
      setTryon(prev.tryon);
      return toast.error(res.error);
    }
    toast.success(value ? "Consenso registrato" : "Consenso revocato");
  }

  return (
    <div className="max-w-2xl space-y-6">
      <Card>
        <h2 className="mb-1 text-2xl">Servizi AI esterni</h2>
        <p className="mb-3 text-sm text-ink-soft">
          Le funzioni AI usano fornitori esterni. Non inviamo nulla senza il tuo consenso, che puoi revocare in ogni momento.
        </p>
        <div className="divide-y divide-line">
          <Toggle
            checked={ai}
            onChange={(v) => consent("ai", v)}
            label="Analisi dei capi e scelta degli outfit"
            description="Le foto dei capi (solo quando chiedi l'analisi) e nomi/caratteristiche dei capi, preferenze e note dello stylist vengono inviati al provider AI configurato per suggerire metadati e comporre/spiegare gli outfit. Con i piani gratuiti di alcuni provider (es. Gemini) i contenuti inviati possono essere usati dal fornitore per migliorare i suoi prodotti."
          />
          <Toggle
            checked={vision}
            disabled={!ai}
            onChange={(v) => consent("vision", v)}
            label="Foto dei capi per lo stylist"
            description="Lo stylist guarda le miniature dei capi proposti per valutare colori, tessuti e proporzioni degli abbinamenti. Le foto (non i dati personali) vengono inviate al provider AI configurato. Richiede il consenso qui sopra. Con i piani gratuiti di alcuni provider (es. Gemini) il fornitore può usarle per migliorare i suoi prodotti."
          />
          <Toggle
            checked={tryon}
            onChange={(v) => consent("tryon", v)}
            label="Prova virtuale"
            description="La tua foto e le foto dei capi dell'outfit vengono inviate al servizio di virtual try-on per generare l'immagine. Non vengono usate per altri scopi."
          />
        </div>
      </Card>

      <Card>
        <h2 className="mb-1 text-2xl">Le tue immagini</h2>
        <p className="mb-4 text-sm text-ink-soft">
          Foto dei capi, foto personale e immagini generate sono archiviate in spazi privati: sono leggibili solo da te, tramite link temporanei.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            size="sm"
            disabled={!photo || pending}
            icon={<Trash2 className="size-4" />}
            onClick={() =>
              start(async () => {
                const res = await setProfilePhotoAction("tryon", null);
                if (!res.ok) return toast.error(res.error);
                setPhoto(false);
                toast.success("Foto per la prova virtuale eliminata");
              })
            }
          >
            Elimina la mia foto di prova
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={pending}
            icon={<Trash2 className="size-4" />}
            onClick={() =>
              start(async () => {
                const res = await deleteAllGeneratedImagesAction();
                if (!res.ok) return toast.error(res.error);
                toast.success(res.data.count ? `${res.data.count} immagini eliminate` : "Nessuna immagine da eliminare");
              })
            }
          >
            Elimina le immagini generate
          </Button>
        </div>
      </Card>

      <Card className="border-danger/25">
        <h2 className="mb-1 text-2xl text-danger">Elimina account</h2>
        <p className="mb-4 text-sm text-ink-soft">
          Cancella in modo definitivo profilo, capi, outfit, foto e immagini generate. L&apos;operazione non si può annullare.
        </p>
        <Button variant="danger" size="sm" disabled={!accountDeletionEnabled} onClick={() => setAccountDialog(true)}>
          Elimina il mio account
        </Button>
        {!accountDeletionEnabled && <p className="mt-2 text-xs text-muted">Non disponibile: il server non ha la chiave di servizio Supabase configurata.</p>}
      </Card>

      <ConfirmDialog
        open={accountDialog}
        destructive
        loading={deleting}
        title="Eliminare definitivamente l'account?"
        description="Scrivi ELIMINA per confermare. Tutti i tuoi dati verranno cancellati."
        confirmLabel="Elimina tutto"
        onCancel={() => { setAccountDialog(false); setConfirmText(""); }}
        onConfirm={async () => {
          if (confirmText !== "ELIMINA") return toast.error("Scrivi ELIMINA per confermare");
          setDeleting(true);
          const res = await deleteAccountAction(confirmText);
          setDeleting(false);
          if (!res.ok) return toast.error(res.error);
          router.push("/");
          router.refresh();
        }}
      >
        <Input aria-label="Conferma scrivendo ELIMINA" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="ELIMINA" />
      </ConfirmDialog>
    </div>
  );
}
