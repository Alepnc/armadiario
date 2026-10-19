import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Lightbulb, Shirt } from "lucide-react";
import { z } from "zod";
import { OutfitCollage } from "@/components/outfit-collage";
import { LinkButton } from "@/components/ui/button";
import { Card, Notice } from "@/components/ui/misc";
import { requireUser } from "@/lib/security/auth";
import { getOutfit } from "@/features/outfits/queries";
import { OutfitHeader } from "@/features/outfits/components/outfit-actions";
import { SEASON_LABEL } from "@/lib/constants/wardrobe";

export const metadata: Metadata = { title: "Outfit" };

export default async function OutfitPage({ params }: PageProps<"/outfits/[id]">) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const { supabase } = await requireUser();
  const outfit = await getOutfit(supabase, id); // availability is read live, not from a snapshot
  if (!outfit) notFound();

  const meta = [
    outfit.occasion,
    outfit.style,
    outfit.season ? SEASON_LABEL[outfit.season] : null,
    new Date(outfit.created_at).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" }),
    outfit.source === "ai" ? "Scelto dall'AI" : outfit.source === "duplicate" ? "Variante" : outfit.source === "rules" ? "Regole di abbinamento" : null,
  ].filter(Boolean);

  return (
    <>
      <Link href="/outfits" className="mb-6 inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden /> Outfit
      </Link>
      <div className="grid gap-10 lg:grid-cols-[1fr_minmax(0,380px)]">
        <div className="space-y-6">
          <OutfitHeader id={outfit.id} name={outfit.name} notes={outfit.notes} isFavorite={outfit.is_favorite} />
          <p className="text-sm text-muted">{meta.join(" · ")}</p>

          {outfit.warnings.length > 0 && (
            <Notice tone="warn">
              <p className="mb-1 font-medium">Da controllare prima di indossarlo</p>
              <ul className="list-inside list-disc">
                {outfit.warnings.map((w) => <li key={w}>{w}</li>)}
              </ul>
            </Notice>
          )}
          <OutfitCollage items={outfit.items} />
        </div>

        <aside className="space-y-5">
          {outfit.description && (
            <Card>
              <h2 className="mb-2 text-2xl">Perché funziona</h2>
              <p className="text-[15px] leading-relaxed text-ink-soft">{outfit.description}</p>
              {outfit.tips.length > 0 && (
                <ul className="mt-3 space-y-1.5">
                  {outfit.tips.map((t) => (
                    <li key={t} className="flex gap-2 text-sm text-ink-soft"><Lightbulb className="mt-0.5 size-4 shrink-0 text-clay" aria-hidden />{t}</li>
                  ))}
                </ul>
              )}
            </Card>
          )}
          <Card>
            <h2 className="mb-1 text-2xl">Provalo su di te</h2>
            <p className="mb-4 text-sm text-ink-soft">Genera un&apos;immagine con te che indossi questo outfit (richiede il servizio di prova virtuale).</p>
            <LinkButton href={`/outfits/${outfit.id}/try-on`} variant="secondary" icon={<Shirt className="size-4" />}>Apri prova virtuale</LinkButton>
          </Card>
        </aside>
      </div>
    </>
  );
}
