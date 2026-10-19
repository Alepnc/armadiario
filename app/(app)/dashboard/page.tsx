import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Droplets, Plus, Shirt, Sparkles } from "lucide-react";
import { LinkButton } from "@/components/ui/button";
import { Card, EmptyState, PageHeader } from "@/components/ui/misc";
import { requireUser } from "@/lib/security/auth";
import { getWardrobeStats, listItems } from "@/features/wardrobe/queries";
import { listOutfits } from "@/features/outfits/queries";
import { getProfile } from "@/features/profile/queries";
import { wardrobeFilterSchema } from "@/lib/validation/wardrobe";

export const metadata: Metadata = { title: "Home" };

export default async function DashboardPage() {
  const { user, supabase } = await requireUser();
  const [stats, profile, recent, outfits] = await Promise.all([
    getWardrobeStats(supabase),
    getProfile(supabase, user.id),
    listItems(supabase, wardrobeFilterSchema.parse({ limit: 12 })),
    listOutfits(supabase, { limit: 3 }),
  ]);
  const name = profile?.display_name || user.email?.split("@")[0] || "";
  return (
    <>
      <PageHeader title={name ? <>Ciao, <span className="marker">{name}</span></> : "Ciao"} description="Cosa ti metti oggi?" actions={<LinkButton href="/stylist" icon={<Sparkles className="size-4" />}>Crea un outfit</LinkButton>} />

      <p className="tnum mb-10 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-lg text-ink-soft">
        <Link href="/wardrobe" className="font-medium text-ink underline decoration-line hover:decoration-clay">{stats.total} {stats.total === 1 ? "capo" : "capi"}</Link>
        <span aria-hidden>·</span>
        <Link href="/wardrobe?status=available" className="text-sage underline decoration-sage/30 hover:decoration-sage">{stats.available} disponibili</Link>
        {stats.washing > 0 && (<><span aria-hidden>·</span><Link href="/wardrobe?status=washing" className="text-tide underline decoration-tide/30 hover:decoration-tide">{stats.washing} in lavaggio</Link></>)}
        {stats.unavailable > 0 && (<><span aria-hidden>·</span><Link href="/wardrobe?status=unavailable" className="text-stone underline decoration-stone/30 hover:decoration-stone">{stats.unavailable} non disponibili</Link></>)}
        <span aria-hidden>·</span>
        <Link href="/outfits" className="underline decoration-line hover:decoration-clay">{stats.outfits} outfit salvati</Link>
      </p>

      {stats.total === 0 ? (
        <EmptyState
          icon={<Shirt className="size-6" />}
          title="Iniziamo dal tuo armadio"
          description="Fotografa alcuni capi: potrai caricarne anche tanti insieme. Poi lo stylist farà il resto."
          action={<LinkButton href="/wardrobe/new" icon={<Plus className="size-4" />}>Aggiungi i primi capi</LinkButton>}
        />
      ) : (
        <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr]">
          <section aria-labelledby="recent">
            <div className="mb-3 flex items-end justify-between">
              <h2 id="recent" className="text-2xl">Aggiunti di recente</h2>
              <Link href="/wardrobe" className="flex items-center gap-1 text-sm text-clay">Tutti <ArrowRight className="size-3.5" aria-hidden /></Link>
            </div>
            <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4">
              {recent.items.slice(0, 8).map((i) => (
                <li key={i.id}>
                  <Link href={`/wardrobe/${i.id}`} className="block">
                    <span className="relative block aspect-[3/4] overflow-hidden rounded-2xl bg-paper-2 ring-2 ring-ink">
                      {/* eslint-disable-next-line @next/next/no-img-element -- signed URL */}
                      <img src={recent.thumbs.get(i.thumb_path ?? i.image_path)} alt={i.name} loading="lazy" className={`size-full object-cover ${i.availability_status !== "available" ? "opacity-55 saturate-50" : ""}`} />
                      {i.availability_status === "washing" && <span className="absolute left-1.5 top-1.5 grid size-6 place-items-center rounded-full bg-tide-tint text-tide"><Droplets className="size-3.5" aria-label="In lavaggio" /></span>}
                    </span>
                    <span className="mt-1 block truncate text-xs">{i.name}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="out">
            <h2 id="out" className="mb-3 text-2xl">Ultimi outfit</h2>
            {outfits.length === 0 ? (
              <Card><p className="text-sm text-ink-soft">Nessun outfit salvato. <Link href="/stylist" className="font-medium text-clay underline underline-offset-4">Chiedine uno allo stylist.</Link></p></Card>
            ) : (
              <ul className="space-y-3">
                {outfits.map((o) => (
                  <li key={o.id}>
                    <Link href={`/outfits/${o.id}`} className="flex items-center gap-3 rounded-2xl border-2 border-ink bg-white p-3 ">
                      <span className="flex -space-x-3">
                        {o.items.slice(0, 3).map((it, idx) => (
                          // eslint-disable-next-line @next/next/no-img-element -- signed URL
                          <img key={idx} src={it.thumbUrl ?? undefined} alt="" className="size-12 rounded-xl border-2 border-paper bg-paper-2 object-cover" />
                        ))}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{o.name}</span>
                        <span className="text-xs text-muted">{o.warnings.length ? `${o.warnings.length} da controllare` : "Tutto disponibile"}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </>
  );
}
