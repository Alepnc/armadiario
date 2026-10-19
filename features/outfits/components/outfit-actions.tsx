"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Heart, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { deleteOutfitAction, duplicateOutfitAction, updateOutfitAction } from "@/features/outfits/actions";
import { cn } from "@/lib/utils/cn";

export function OutfitHeader({ id, name, notes, isFavorite }: { id: string; name: string; notes: string | null; isFavorite: boolean }) {
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(name);
  const [draftNotes, setDraftNotes] = useState(notes ?? "");
  const [fav, setFav] = useState(isFavorite);
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();

  return (
    <div className="space-y-4">
      {editing ? (
        <div className="space-y-3">
          <Input aria-label="Nome outfit" value={draftName} maxLength={120} onChange={(e) => setDraftName(e.target.value)} className="h-12 font-display text-2xl" />
          <Textarea aria-label="Note" placeholder="Note personali…" value={draftNotes} maxLength={1000} onChange={(e) => setDraftNotes(e.target.value)} />
          <div className="flex gap-2">
            <Button
              size="sm"
              loading={pending}
              icon={<Check className="size-4" />}
              disabled={!draftName.trim()}
              onClick={() =>
                start(async () => {
                  const res = await updateOutfitAction(id, { name: draftName, notes: draftNotes || null });
                  if (!res.ok) return toast.error(res.error);
                  setEditing(false);
                  toast.success("Outfit aggiornato");
                  router.refresh();
                })
              }
            >
              Salva
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setDraftName(name); setDraftNotes(notes ?? ""); }}>Annulla</Button>
          </div>
        </div>
      ) : (
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-3xl md:text-4xl">{name}</h1>
            {notes && <p className="mt-2 whitespace-pre-wrap text-sm text-ink-soft">{notes}</p>}
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant={fav ? "primary" : "secondary"}
          aria-pressed={fav}
          icon={<Heart className={cn("size-4", fav && "fill-current")} />}
          disabled={pending}
          onClick={() => {
            const next = !fav;
            setFav(next);
            start(async () => {
              const res = await updateOutfitAction(id, { is_favorite: next });
              if (!res.ok) {
                setFav(!next);
                toast.error(res.error);
              } else router.refresh();
            });
          }}
        >
          Preferito
        </Button>
        {!editing && <Button size="sm" variant="secondary" icon={<Pencil className="size-4" />} onClick={() => setEditing(true)}>Rinomina e note</Button>}
        <Button
          size="sm"
          variant="secondary"
          icon={<Copy className="size-4" />}
          disabled={pending}
          onClick={() =>
            start(async () => {
              const res = await duplicateOutfitAction(id);
              if (!res.ok) return toast.error(res.error);
              toast.success("Variante creata");
              router.push(`/outfits/${res.data.id}`);
            })
          }
        >
          Duplica come variante
        </Button>
        <Button size="sm" variant="ghost" className="text-danger hover:bg-danger-tint" icon={<Trash2 className="size-4" />} onClick={() => setConfirming(true)}>
          Elimina
        </Button>
      </div>

      <ConfirmDialog
        open={confirming}
        destructive
        loading={pending}
        title="Eliminare questo outfit?"
        description="Verranno eliminate anche le immagini di prova virtuale collegate. I capi nel guardaroba non vengono toccati."
        confirmLabel="Elimina"
        onCancel={() => setConfirming(false)}
        onConfirm={() =>
          start(async () => {
            const res = await deleteOutfitAction(id);
            if (!res.ok) {
              setConfirming(false);
              return toast.error(res.error);
            }
            toast.success("Outfit eliminato");
            router.push("/outfits");
            router.refresh();
          })
        }
      />
    </div>
  );
}
