"use client";

import { useState, useTransition } from "react";
import { Heart } from "lucide-react";
import { toggleFavoriteAction } from "@/features/wardrobe/actions";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils/cn";

export function FavoriteButton({ itemId, initial, className }: { itemId: string; initial: boolean; className?: string }) {
  const [fav, setFav] = useState(initial);
  const [pending, start] = useTransition();
  const toast = useToast();
  return (
    <button
      type="button"
      disabled={pending}
      aria-pressed={fav}
      aria-label={fav ? "Rimuovi dai preferiti" : "Aggiungi ai preferiti"}
      onClick={() => {
        const next = !fav;
        setFav(next);
        start(async () => {
          const res = await toggleFavoriteAction(itemId, next);
          if (!res.ok) {
            setFav(!next);
            toast.error(res.error);
          }
        });
      }}
      className={cn("grid size-9 place-items-center rounded-full bg-white ring-2 ring-ink transition-transform active:scale-90", className)}
    >
      <Heart className={cn("size-[18px]", fav ? "fill-pop stroke-ink" : "stroke-ink")} aria-hidden />
    </button>
  );
}
