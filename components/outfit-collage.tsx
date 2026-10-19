import { ImageOff, Trash2 } from "lucide-react";
import { StatusBadge } from "@/components/status-badge";
import type { OutfitItemView } from "@/features/outfits/types";
import { cn } from "@/lib/utils/cn";
import type { ReactNode } from "react";

/** Composition of the real garment photos, one tile per piece. */
export function OutfitCollage({
  items,
  renderTileAction,
  linkItems = true,
}: {
  items: OutfitItemView[];
  renderTileAction?: (item: OutfitItemView) => ReactNode;
  linkItems?: boolean;
}) {
  const cols = items.length >= 5 ? "grid-cols-3" : items.length === 1 ? "grid-cols-1" : "grid-cols-2";
  return (
    <ul className={cn("grid gap-2.5", cols)}>
      {items.map((it, idx) => {
        const problem = it.status !== "available";
        const inner = (
          <div className={cn("relative aspect-[4/5] overflow-hidden rounded-2xl bg-paper-2 ring-2 ring-ink", it.status === "deleted" && "grid place-items-center")}>
            {it.thumbUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- signed URL
              <img src={it.thumbUrl} alt={it.name} loading="lazy" decoding="async" className={cn("size-full object-cover", problem && "opacity-55 saturate-50")} />
            ) : (
              <span className="text-muted">{it.status === "deleted" ? <Trash2 className="size-6" aria-label="Capo eliminato" /> : <ImageOff className="size-6" aria-label="Immagine non disponibile" />}</span>
            )}
            {problem && <StatusBadge status={it.status} className="absolute left-2 top-2" />}
          </div>
        );
        return (
          <li key={`${it.id ?? "deleted"}-${idx}`} className="min-w-0">
            {linkItems && it.id ? (
              <a href={`/wardrobe/${it.id}`} aria-label={`Apri ${it.name}`} className="block">{inner}</a>
            ) : (
              inner
            )}
            <div className="mt-1.5 flex items-start justify-between gap-1">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium leading-tight">{it.name}</p>
                <p className="truncate text-xs text-muted">{it.role}</p>
              </div>
              {renderTileAction?.(it)}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
