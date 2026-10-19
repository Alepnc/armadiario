import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Pencil, Sparkles } from "lucide-react";
import { z } from "zod";
import { LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/misc";
import { ColorDot } from "@/components/status-badge";
import { BUCKETS } from "@/lib/config";
import { requireUser } from "@/lib/security/auth";
import { signPaths } from "@/lib/storage";
import { FIT_LABEL, FORMALITY_LABEL, PATTERN_LABEL, SEASON_LABEL } from "@/lib/constants/wardrobe";
import { getItem } from "@/features/wardrobe/queries";
import { AvailabilityControl } from "@/features/wardrobe/components/availability-control";
import { FavoriteButton } from "@/features/wardrobe/components/favorite-button";

export const metadata: Metadata = { title: "Dettaglio capo" };

export default async function ItemPage({ params }: PageProps<"/wardrobe/[id]">) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const { supabase } = await requireUser();
  const item = await getItem(supabase, id);
  if (!item) notFound();

  const [urls, outfitCount] = await Promise.all([
    signPaths(supabase, BUCKETS.wardrobe, [item.image_path]),
    supabase.from("outfit_items").select("id", { count: "exact", head: true }).eq("clothing_item_id", id).then((r) => r.count ?? 0),
  ]);
  const imageUrl = urls.get(item.image_path);

  const rows: Array<[string, React.ReactNode]> = [
    ["Categoria", item.category.label + (item.subcategory ? ` · ${item.subcategory}` : "")],
    ["Colore", <span key="c" className="flex flex-wrap items-center gap-3"><ColorDot color={item.primary_color} withLabel />{item.secondary_colors.map((c) => <ColorDot key={c} color={c} withLabel />)}</span>],
    ["Stagione", item.seasons.length ? item.seasons.map((s) => SEASON_LABEL[s]).join(", ") : "Tutto l'anno"],
    ["Stile", item.styles.length ? item.styles.join(", ") : "—"],
    ["Materiale", item.material ?? "—"],
    ["Fantasia", PATTERN_LABEL[item.pattern] ?? item.pattern],
    ["Formalità", FORMALITY_LABEL[item.formality]],
    ["Vestibilità", item.fit ? FIT_LABEL[item.fit] : "—"],
    ["Aggiunto il", new Date(item.created_at).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" })],
  ];

  return (
    <>
      <Link href="/wardrobe" className="mb-6 inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden /> Guardaroba
      </Link>
      <div className="grid gap-10 md:grid-cols-[minmax(0,420px)_1fr]">
        <div className="relative">
          <div className="aspect-[3/4] overflow-hidden rounded-3xl bg-paper-2 ring-2 ring-ink">
            {/* eslint-disable-next-line @next/next/no-img-element -- signed URL */}
            {imageUrl && <img src={imageUrl} alt={item.name} className="size-full object-cover" />}
          </div>
          <FavoriteButton itemId={item.id} initial={item.is_favorite} className="absolute right-3 top-3 size-11" />
        </div>

        <div className="space-y-7">
          <div>
            <h1 className="text-3xl md:text-4xl">{item.name}</h1>
            <p className="mt-1 text-ink-soft">
              {outfitCount > 0 ? `Presente in ${outfitCount} outfit salvati` : "Non è ancora in nessun outfit salvato"}
            </p>
          </div>

          <Card>
            <h2 className="mb-3 text-2xl">Disponibilità</h2>
            <AvailabilityControl itemId={item.id} status={item.availability_status} expectedAt={item.expected_available_at} variant="segmented" />
            <p className="mt-3 text-xs text-muted">I capi in lavaggio o non disponibili non vengono mai proposti dallo stylist.</p>
          </Card>

          <dl className="grid grid-cols-[8rem_1fr] gap-x-4 gap-y-3 text-sm">
            {rows.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-muted">{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
          {item.notes && (
            <Card>
              <h2 className="mb-1 text-2xl">Note</h2>
              <p className="whitespace-pre-wrap text-sm text-ink-soft">{item.notes}</p>
            </Card>
          )}

          <div className="flex flex-wrap gap-2">
            <LinkButton href={`/wardrobe/${item.id}/edit`} variant="secondary" icon={<Pencil className="size-4" />}>Modifica</LinkButton>
            <LinkButton href={`/stylist?include=${item.id}`} icon={<Sparkles className="size-4" />}>Crea un outfit con questo capo</LinkButton>
          </div>
        </div>
      </div>
    </>
  );
}
