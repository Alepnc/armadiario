import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { PageHeader } from "@/components/ui/misc";
import { BUCKETS } from "@/lib/config";
import { requireUser } from "@/lib/security/auth";
import { signPaths } from "@/lib/storage";
import { getItem, listCategories } from "@/features/wardrobe/queries";
import { EditItem } from "@/features/wardrobe/components/edit-item";

export const metadata: Metadata = { title: "Modifica capo" };

export default async function EditItemPage({ params }: PageProps<"/wardrobe/[id]/edit">) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const { supabase } = await requireUser();
  const [item, categories] = await Promise.all([getItem(supabase, id), listCategories(supabase)]);
  if (!item) notFound();
  const urls = await signPaths(supabase, BUCKETS.wardrobe, [item.image_path]);
  return (
    <>
      <PageHeader title="Modifica capo" />
      <EditItem item={item} categories={categories} imageUrl={urls.get(item.image_path) ?? null} />
    </>
  );
}
