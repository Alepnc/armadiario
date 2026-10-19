"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Notice } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { deleteItemAction, updateItemAction } from "@/features/wardrobe/actions";
import { ApiError, compressImage, uploadImage, type UploadedImage } from "@/lib/client/upload";
import type { Category, ClothingItem } from "@/types/db";
import { draftFromItem, draftIsComplete, draftToInput, ItemFields, type ItemDraft } from "./item-fields";

export function EditItem({ item, categories, imageUrl }: { item: ClothingItem; categories: Category[]; imageUrl: string | null }) {
  const [draft, setDraft] = useState<ItemDraft>(() => draftFromItem(item));
  const [newImage, setNewImage] = useState<{ upload: UploadedImage; preview: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [saving, startSave] = useTransition();
  const [deleting, startDelete] = useTransition();
  const input = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const router = useRouter();

  async function pick(file: File) {
    setUploading(true);
    setError(null);
    try {
      const upload = await uploadImage(await compressImage(file), "item");
      setNewImage({ upload, preview: URL.createObjectURL(file) });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Caricamento non riuscito");
    } finally {
      setUploading(false);
    }
  }

  function save() {
    setError(null);
    startSave(async () => {
      const res = await updateItemAction(
        item.id,
        draftToInput(draft),
        newImage ? { image_path: newImage.upload.path, thumb_path: newImage.upload.thumbPath, image_hash: newImage.upload.hash } : undefined,
      );
      if (!res.ok) return setError(res.error);
      toast.success("Capo aggiornato");
      router.push(`/wardrobe/${item.id}`);
      router.refresh();
    });
  }

  return (
    <div className="grid gap-10 lg:grid-cols-[320px_1fr]">
      <div className="space-y-3">
        <div className="aspect-[3/4] overflow-hidden rounded-3xl bg-paper-2">
          {/* eslint-disable-next-line @next/next/no-img-element -- signed URL / blob preview */}
          {(newImage?.preview ?? imageUrl) && <img src={newImage?.preview ?? imageUrl!} alt={item.name} className="size-full object-cover" />}
        </div>
        <input ref={input} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void pick(f); e.target.value = ""; }} />
        <Button variant="secondary" className="w-full" loading={uploading} onClick={() => input.current?.click()} icon={<Camera className="size-4" />}>
          Sostituisci foto
        </Button>
        {newImage && newImage.upload.duplicates.length > 0 && (
          <Notice tone="warn">La nuova foto somiglia a «{newImage.upload.duplicates[0].name}».</Notice>
        )}
      </div>

      <div className="space-y-6">
        <ItemFields value={draft} onChange={setDraft} categories={categories} idPrefix="edit" />
        {error && <Notice tone="error">{error}</Notice>}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-6">
          <Button variant="ghost" className="text-danger hover:bg-danger-tint" onClick={() => setConfirming(true)}>
            Elimina capo
          </Button>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => router.back()}>Annulla</Button>
            <Button onClick={save} loading={saving} disabled={!draftIsComplete(draft) || uploading}>Salva modifiche</Button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirming}
        destructive
        loading={deleting}
        title="Eliminare questo capo?"
        description="La foto verrà cancellata. Gli outfit salvati che lo contengono resteranno, con un avviso che il capo non esiste più."
        confirmLabel="Elimina"
        onCancel={() => setConfirming(false)}
        onConfirm={() =>
          startDelete(async () => {
            const res = await deleteItemAction(item.id);
            if (!res.ok) {
              setConfirming(false);
              return toast.error(res.error);
            }
            toast.success("Capo eliminato");
            router.push("/wardrobe");
            router.refresh();
          })
        }
      />
    </div>
  );
}
