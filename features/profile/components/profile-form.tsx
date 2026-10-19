"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Camera, Trash2, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Notice } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { setProfilePhotoAction, updateProfileAction } from "@/features/profile/actions";
import { ColorPicker } from "@/features/wardrobe/components/item-fields";
import { compressImage, uploadImage } from "@/lib/client/upload";
import { FIT_LABEL, FITS, STYLES, type Fit } from "@/lib/constants/wardrobe";
import type { Profile } from "@/types/db";

const SIZE_FIELDS = [
  ["top", "Parte superiore", "M, 48…"],
  ["bottom", "Parte inferiore", "W32, 46…"],
  ["shoes", "Scarpe", "42…"],
] as const;

function toggle<T>(list: T[], v: T): T[] {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
}

export function ProfileForm({ profile, email, avatarUrl }: { profile: Profile; email: string; avatarUrl: string | null }) {
  const [name, setName] = useState(profile.display_name ?? "");
  const [height, setHeight] = useState(profile.height_cm ? String(profile.height_cm) : "");
  const [styles, setStyles] = useState<string[]>(profile.style_preferences);
  const [sizes, setSizes] = useState<Record<string, string>>(profile.sizes ?? {});
  const [fav, setFav] = useState<string[]>(profile.favorite_colors);
  const [avoid, setAvoid] = useState<string[]>(profile.avoided_colors);
  const [fit, setFit] = useState<Fit | "">(profile.fit_preference ?? "");
  const [notes, setNotes] = useState(profile.notes ?? "");
  const [avatar, setAvatar] = useState<string | null>(avatarUrl);
  const [hasAvatar, setHasAvatar] = useState(Boolean(profile.avatar_path));
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const input = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const router = useRouter();

  async function onAvatar(file: File) {
    setUploading(true);
    try {
      const up = await uploadImage(await compressImage(file, 600), "avatar");
      const res = await setProfilePhotoAction("avatar", up.path);
      if (!res.ok) throw new Error(res.error);
      setAvatar(URL.createObjectURL(file));
      setHasAvatar(true);
      toast.success("Foto profilo aggiornata");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Caricamento non riuscito");
    } finally {
      setUploading(false);
    }
  }

  return (
    <form
      className="space-y-8"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          const cleanSizes = Object.fromEntries(Object.entries(sizes).filter(([, v]) => v.trim()));
          const res = await updateProfileAction({
            display_name: name,
            height_cm: height === "" ? null : Number(height),
            style_preferences: styles,
            sizes: cleanSizes,
            favorite_colors: fav,
            avoided_colors: avoid,
            fit_preference: fit || null,
            notes,
          });
          if (!res.ok) return setError(res.error);
          toast.success("Profilo salvato");
          router.refresh();
        });
      }}
    >
      <div className="flex items-center gap-5">
        <div className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-full bg-sand ring-2 ring-ink">
          {/* eslint-disable-next-line @next/next/no-img-element -- signed URL / blob */}
          {avatar ? <img src={avatar} alt="Foto profilo" className="size-full object-cover" /> : <User className="size-8 text-ink-soft" aria-hidden />}
        </div>
        <div className="space-y-2">
          <input ref={input} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void onAvatar(f); e.target.value = ""; }} />
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="secondary" loading={uploading} icon={<Camera className="size-4" />} onClick={() => input.current?.click()}>
              {hasAvatar ? "Cambia foto" : "Aggiungi foto"}
            </Button>
            {hasAvatar && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                icon={<Trash2 className="size-4" />}
                onClick={async () => {
                  const res = await setProfilePhotoAction("avatar", null);
                  if (!res.ok) return toast.error(res.error);
                  setAvatar(null);
                  setHasAvatar(false);
                }}
              >
                Rimuovi
              </Button>
            )}
          </div>
          <p className="text-xs text-muted">{email}</p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nome o nickname" htmlFor="pn">
          <Input id="pn" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Altezza (cm)" htmlFor="ph" hint="Facoltativa">
          <Input id="ph" type="number" inputMode="numeric" min={80} max={250} value={height} onChange={(e) => setHeight(e.target.value)} />
        </Field>
      </div>

      <Field label="Stili che ti rappresentano" hint="Aiutano lo stylist a scegliere">
        <div className="flex flex-wrap gap-2">
          {STYLES.map((s) => <Chip key={s} selected={styles.includes(s)} onClick={() => setStyles(toggle(styles, s).slice(0, 8))}>{s}</Chip>)}
        </div>
      </Field>

      <Field label="Colori preferiti">
        <ColorPicker label="Colori preferiti" multiple value={fav} onChange={(c) => setFav(toggle(fav, c))} />
      </Field>
      <Field label="Colori da evitare">
        <ColorPicker label="Colori da evitare" multiple value={avoid} onChange={(c) => setAvoid(toggle(avoid, c))} />
      </Field>

      <div className="grid gap-4 sm:grid-cols-3">
        {SIZE_FIELDS.map(([key, label, ph]) => (
          <Field key={key} label={`Taglia · ${label}`} htmlFor={`sz-${key}`} hint="Facoltativa">
            <Input id={`sz-${key}`} value={sizes[key] ?? ""} maxLength={20} placeholder={ph} onChange={(e) => setSizes({ ...sizes, [key]: e.target.value })} />
          </Field>
        ))}
      </div>

      <Field label="Vestibilità preferita" htmlFor="pf">
        <Select id="pf" value={fit} onChange={(e) => setFit(e.target.value as Fit | "")} className="max-w-xs">
          <option value="">Nessuna preferenza</option>
          {FITS.map((f) => <option key={f} value={f}>{FIT_LABEL[f]}</option>)}
        </Select>
      </Field>
      <Field label="Altre preferenze" htmlFor="pnotes" hint="Es. «non amo i colletti rigidi». Può essere letto dall'AI solo se hai dato il consenso.">
        <Textarea id="pnotes" value={notes} maxLength={1000} onChange={(e) => setNotes(e.target.value)} />
      </Field>

      {error && <Notice tone="error">{error}</Notice>}
      <div className="flex justify-end">
        <Button type="submit" size="lg" loading={pending}>Salva profilo</Button>
      </div>
    </form>
  );
}
