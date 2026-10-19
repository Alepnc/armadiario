import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, Heart, LayoutGrid, Sparkles } from "lucide-react";
import { Chip } from "@/components/ui/chip";
import { LinkButton } from "@/components/ui/button";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { requireUser } from "@/lib/security/auth";
import { listOutfits } from "@/features/outfits/queries";

export const metadata: Metadata = { title: "Outfit salvati" };

export default async function OutfitsPage({ searchParams }: PageProps<"/outfits">) {
  const { supabase } = await requireUser();
  const sp = await searchParams;
  const favoritesOnly = sp.fav === "1";
  const outfits = await listOutfits(supabase, { favoritesOnly });

  return (
    <>
      <PageHeader
        title="I tuoi outfit"
        description="Storico degli outfit salvati. La disponibilità dei capi viene ricontrollata ogni volta."
        actions={<LinkButton href="/stylist" icon={<Sparkles className="size-4" />}>Nuovo outfit</LinkButton>}
      />
      <div className="mb-6 flex gap-2">
        <Link href="/outfits" scroll={false}><Chip selected={!favoritesOnly}>Tutti</Chip></Link>
        <Link href="/outfits?fav=1" scroll={false}><Chip selected={favoritesOnly}><Heart className="size-3.5" aria-hidden /> Preferiti</Chip></Link>
      </div>

      {outfits.length === 0 ? (
        <EmptyState
          icon={<LayoutGrid className="size-6" />}
          title={favoritesOnly ? "Nessun outfit preferito" : "Non hai ancora salvato outfit"}
          description="Chiedi una proposta allo stylist e salva quelle che ti piacciono."
          action={<LinkButton href="/stylist" icon={<Sparkles className="size-4" />}>Vai allo stylist</LinkButton>}
        />
      ) : (
        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {outfits.map((o) => (
            <li key={o.id}>
              <Link href={`/outfits/${o.id}`} className="group block rounded-3xl border-2 border-ink bg-white p-3 transition-colors hover:bg-lime/40">
                <div className="grid grid-cols-4 gap-1.5 overflow-hidden rounded-2xl">
                  {o.items.slice(0, 4).map((it, idx) => (
                    <div key={`${o.id}-${idx}`} className="aspect-[3/4] bg-paper-2">
                      {it.thumbUrl && (
                        // eslint-disable-next-line @next/next/no-img-element -- signed URL
                        <img src={it.thumbUrl} alt="" loading="lazy" className="size-full object-cover" />
                      )}
                    </div>
                  ))}
                </div>
                <div className="px-1.5 pb-1 pt-3">
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="truncate font-display text-xl group-hover:text-clay">{o.name}</h2>
                    {o.is_favorite && <Heart className="size-4 shrink-0 fill-clay stroke-clay" aria-label="Preferito" />}
                  </div>
                  <p className="text-xs text-muted">
                    {new Date(o.created_at).toLocaleDateString("it-IT", { day: "numeric", month: "short", year: "numeric" })}
                    {o.occasion ? ` · ${o.occasion}` : ""}
                  </p>
                  {o.warnings.length > 0 && (
                    <p className="mt-2 flex items-center gap-1.5 text-xs text-clay-deep">
                      <AlertTriangle className="size-3.5" aria-hidden /> {o.warnings.length === 1 ? "1 capo da controllare" : `${o.warnings.length} capi da controllare`}
                    </p>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
