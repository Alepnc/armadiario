import type { Metadata } from "next";
import { BUCKETS } from "@/lib/config";
import { getLanguageModel } from "@/lib/ai/registry";
import { PageHeader } from "@/components/ui/misc";
import { requireUser } from "@/lib/security/auth";
import { signPaths } from "@/lib/storage";
import { listAllItems } from "@/features/wardrobe/queries";
import { getProfile } from "@/features/profile/queries";
import { StylistClient } from "@/features/outfits/components/stylist-client";
import type { PickerItem } from "@/features/outfits/components/item-picker";

// Server Actions of this page may call the AI provider (bounded to ~60s in total).
export const maxDuration = 60;

export const metadata: Metadata = { title: "AI Stylist" };

export default async function StylistPage({ searchParams }: PageProps<"/stylist">) {
  const { user, supabase } = await requireUser();
  const sp = await searchParams;
  const [items, profile] = await Promise.all([listAllItems(supabase), getProfile(supabase, user.id)]);
  const thumbs = await signPaths(supabase, BUCKETS.wardrobe, items.map((i) => i.thumb_path ?? i.image_path));

  const pickerItems: PickerItem[] = items.map((i) => ({
    id: i.id,
    name: i.name,
    thumbUrl: thumbs.get(i.thumb_path ?? i.image_path) ?? null,
    available: i.availability_status === "available",
    categoryLabel: i.category.label,
  }));

  const avail = items.filter((i) => i.availability_status === "available");
  const slots = new Set(avail.map((i) => i.category.slot));
  const hasEnoughItems = slots.has("shoes") && (slots.has("dress") || (slots.has("top") && slots.has("bottom")));

  const include = typeof sp.include === "string" && items.some((i) => i.id === sp.include) ? [sp.include] : [];
  const aiLabel = !getLanguageModel()
    ? "Modalità regole: l'AI non è configurata, gli abbinamenti sono calcolati dall'app."
    : profile?.ai_consent_at
      ? "L'AI sceglie tra abbinamenti già verificati. Alla AI vengono inviati solo nomi e caratteristiche dei capi, non le foto."
      : "Per l'AI serve il consenso in Impostazioni → Privacy: intanto uso le regole di abbinamento.";

  return (
    <>
      <PageHeader title="AI Stylist" description="Dimmi dove vai: compongo l'outfit usando solo i capi disponibili nel tuo armadio." />
      <StylistClient items={pickerItems} initialInclude={include} hasEnoughItems={hasEnoughItems} aiLabel={aiLabel} />
    </>
  );
}
