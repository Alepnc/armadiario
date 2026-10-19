import type { Metadata } from "next";
import { Suspense } from "react";
import { Plus, Shirt, SearchX } from "lucide-react";
import { LinkButton } from "@/components/ui/button";
import { EmptyState, PageHeader, Skeleton } from "@/components/ui/misc";
import { requireUser } from "@/lib/security/auth";
import { wardrobeFilterSchema } from "@/lib/validation/wardrobe";
import { listCategories, listItems } from "@/features/wardrobe/queries";
import { FilterBar } from "@/features/wardrobe/components/filter-bar";
import { ItemCard } from "@/features/wardrobe/components/item-card";
import { cn } from "@/lib/utils/cn";

export const metadata: Metadata = { title: "Guardaroba" };

export default async function WardrobePage({ searchParams }: PageProps<"/wardrobe">) {
  const { supabase } = await requireUser();
  const raw = await searchParams;
  const flat = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
  const parsed = wardrobeFilterSchema.safeParse(flat);
  const filters = parsed.success ? parsed.data : wardrobeFilterSchema.parse({});

  const [categories, page] = await Promise.all([listCategories(supabase), listItems(supabase, filters)]);
  const hasFilters = Boolean(filters.q || filters.category || filters.color || filters.season || filters.style || filters.status);

  // "Load more" keeps all active filters and grows the window.
  const more = new URLSearchParams(Object.entries(flat).filter(([, v]) => typeof v === "string") as [string, string][]);
  more.set("limit", String(filters.limit + 24));

  return (
    <>
      <PageHeader
        title="Il tuo guardaroba"
        description={page.total > 0 ? `${page.total} ${page.total === 1 ? "capo" : "capi"}${hasFilters ? " trovati" : ""}` : "Qui vivranno tutti i tuoi capi."}
        actions={<LinkButton href="/wardrobe/new" icon={<Plus className="size-4" />}>Aggiungi capi</LinkButton>}
      />
      <Suspense fallback={<Skeleton className="mb-6 h-40" />}>
        <FilterBar categories={categories} />
      </Suspense>

      {page.items.length === 0 ? (
        hasFilters ? (
          <EmptyState icon={<SearchX className="size-6" />} title="Nessun capo corrisponde ai filtri" description="Prova a togliere qualche filtro o a cambiare la ricerca." />
        ) : (
          <EmptyState
            icon={<Shirt className="size-6" />}
            title="Il tuo armadio è ancora vuoto"
            description="Carica la foto del primo capo: con qualche foto in più potrai chiedere outfit allo stylist."
            action={<LinkButton href="/wardrobe/new" icon={<Plus className="size-4" />}>Aggiungi il primo capo</LinkButton>}
          />
        )
      ) : (
        <>
          <ul className={cn(filters.view === "list" ? "space-y-3" : "grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 lg:grid-cols-4")}>
            {page.items.map((item) => (
              <ItemCard key={item.id} item={item} thumbUrl={page.thumbs.get(item.thumb_path ?? item.image_path)} view={filters.view} />
            ))}
          </ul>
          {page.items.length < page.total && (
            <div className="mt-10 text-center">
              <LinkButton href={`/wardrobe?${more.toString()}`} variant="secondary" scroll={false}>
                Mostra altri ({page.total - page.items.length})
              </LinkButton>
            </div>
          )}
        </>
      )}
    </>
  );
}
