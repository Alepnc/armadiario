import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { z } from "zod";
import { OutfitCollage } from "@/components/outfit-collage";
import { PageHeader } from "@/components/ui/misc";
import { BUCKETS } from "@/lib/config";
import { isTryOnConfigured } from "@/lib/ai/tryon/registry";
import { requireUser } from "@/lib/security/auth";
import { signPaths } from "@/lib/storage";
import { getOutfit } from "@/features/outfits/queries";
import { getProfile } from "@/features/profile/queries";
import { TryOnClient, type PastResult } from "@/features/virtual-try-on/components/try-on-client";
import { messageFor } from "@/features/virtual-try-on/service";

export const metadata: Metadata = { title: "Prova virtuale" };

export default async function TryOnPage({ params }: PageProps<"/outfits/[id]/try-on">) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const { user, supabase } = await requireUser();
  const [outfit, profile, imagesRes] = await Promise.all([
    getOutfit(supabase, id),
    getProfile(supabase, user.id),
    supabase
      .from("generated_images")
      .select("id,image_path,created_at,is_saved")
      .eq("outfit_id", id)
      .eq("generation_status", "completed")
      .order("created_at", { ascending: false })
      .limit(12),
  ]);
  if (!outfit) notFound();

  const rows = (imagesRes.data ?? []) as Array<{ id: string; image_path: string | null; created_at: string; is_saved: boolean }>;
  const [generated, personal] = await Promise.all([
    signPaths(supabase, BUCKETS.generated, rows.map((r) => r.image_path)),
    signPaths(supabase, BUCKETS.personal, [profile?.tryon_photo_path]),
  ]);
  const past: PastResult[] = rows.map((r) => ({
    id: r.id,
    imageUrl: r.image_path ? (generated.get(r.image_path) ?? null) : null,
    createdAt: r.created_at,
    isSaved: r.is_saved,
  }));

  const blockedReason = outfit.items.some((i) => i.status === "deleted") ? messageFor("garment_deleted") : null;

  return (
    <>
      <Link href={`/outfits/${id}`} className="mb-6 inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden /> {outfit.name}
      </Link>
      <PageHeader title="Prova virtuale" description="Guarda l'outfit addosso a te. Il resto dell'app funziona anche senza questo servizio." />
      <div className="mb-10 max-w-xl">
        <OutfitCollage items={outfit.items} linkItems={false} />
      </div>
      <TryOnClient
        outfitId={id}
        configured={isTryOnConfigured()}
        hasConsent={Boolean(profile?.tryon_consent_at)}
        photoUrl={profile?.tryon_photo_path ? (personal.get(profile.tryon_photo_path) ?? null) : null}
        blockedReason={blockedReason}
        past={past}
      />
    </>
  );
}
