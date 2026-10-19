import Link from "next/link";
import { ImageOff } from "lucide-react";
import { ColorDot } from "@/components/status-badge";
import type { ClothingItem } from "@/types/db";
import { cn } from "@/lib/utils/cn";
import { AvailabilityControl } from "./availability-control";
import { FavoriteButton } from "./favorite-button";

export function ItemCard({ item, thumbUrl, view }: { item: ClothingItem; thumbUrl?: string; view: "grid" | "list" }) {
  const dimmed = item.availability_status !== "available";
  const image = (
    <Link href={`/wardrobe/${item.id}`} tabIndex={-1} aria-hidden className={cn("relative block overflow-hidden bg-paper-2", view === "grid" ? "aspect-[3/4] rounded-2xl" : "size-24 shrink-0 rounded-xl")}>
      {thumbUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URLs; next/image cache would be useless
        <img
          src={thumbUrl}
          alt={item.name}
          loading="lazy"
          decoding="async"
          className={cn("size-full object-cover transition-all duration-300 hover:scale-[1.03]", dimmed && "opacity-60 saturate-50")}
        />
      ) : (
        <span className="grid size-full place-items-center text-muted">
          <ImageOff className="size-6" aria-label="Immagine non disponibile" />
        </span>
      )}
    </Link>
  );

  const meta = (
    <div className="min-w-0 space-y-1.5">
      <Link href={`/wardrobe/${item.id}`} className="block truncate font-medium leading-tight hover:text-clay">
        {item.name}
      </Link>
      <p className="flex items-center gap-2 truncate text-xs text-ink-soft">
        <span className="truncate">{item.category.label}</span>
        <span aria-hidden>·</span>
        <ColorDot color={item.primary_color} withLabel />
      </p>
      <AvailabilityControl itemId={item.id} status={item.availability_status} expectedAt={item.expected_available_at} />
    </div>
  );

  if (view === "list") {
    return (
      <li className="flex items-center gap-4 rounded-2xl border-2 border-ink bg-white p-3">
        {image}
        <div className="min-w-0 flex-1">{meta}</div>
        <FavoriteButton itemId={item.id} initial={item.is_favorite} />
      </li>
    );
  }
  return (
    <li className="group relative space-y-2.5">
      <div className="relative">
        {image}
        <FavoriteButton itemId={item.id} initial={item.is_favorite} className="absolute right-2 top-2" />
      </div>
      {meta}
    </li>
  );
}
