import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/misc";
import { requireUser } from "@/lib/security/auth";
import { getGarmentAnalyzer } from "@/lib/ai/registry";
import { listCategories } from "@/features/wardrobe/queries";
import { getProfile } from "@/features/profile/queries";
import { AddItems, type AiMode } from "@/features/wardrobe/components/add-items";

export const metadata: Metadata = { title: "Aggiungi capi" };

export default async function NewItemPage() {
  const { user, supabase } = await requireUser();
  const [categories, profile] = await Promise.all([listCategories(supabase), getProfile(supabase, user.id)]);
  const aiMode: AiMode = !getGarmentAnalyzer() ? "not-configured" : profile?.ai_consent_at ? "enabled" : "no-consent";
  return (
    <>
      <PageHeader title="Aggiungi capi" description="Carica una o più foto: potrai rivedere e correggere ogni dato prima di salvare." />
      <AddItems categories={categories} aiMode={aiMode} />
    </>
  );
}
