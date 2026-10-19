import "server-only";
import type { ServerSupabase } from "@/lib/supabase/server";
import type { OutfitRow } from "@/types/db";
import { BUCKETS } from "@/lib/config";
import { signPaths } from "@/lib/storage";
import type { Availability, Slot } from "@/lib/constants/wardrobe";
import type { OutfitItemView } from "./types";

interface RawOutfitItem {
  id: string;
  clothing_item_id: string | null;
  role: string;
  position: number;
  item_name_snapshot: string;
  item: {
    id: string;
    name: string;
    primary_color: string;
    availability_status: Availability;
    expected_available_at: string | null;
    thumb_path: string | null;
    image_path: string;
    category: { label: string; slot: Slot } | null;
  } | null;
}

type RawOutfit = OutfitRow & { outfit_items: RawOutfitItem[] };

const SELECT =
  "*, outfit_items(id,clothing_item_id,role,position,item_name_snapshot, item:clothing_items(id,name,primary_color,availability_status,expected_available_at,thumb_path,image_path, category:categories(label,slot)))";

export interface OutfitView extends OutfitRow {
  items: OutfitItemView[];
  /** Human-readable problems: deleted / washing / unavailable garments. */
  warnings: string[];
}

async function toViews(supabase: ServerSupabase, rows: RawOutfit[]): Promise<OutfitView[]> {
  const thumbs = await signPaths(
    supabase,
    BUCKETS.wardrobe,
    rows.flatMap((o) => o.outfit_items.map((oi) => oi.item?.thumb_path ?? oi.item?.image_path)),
  );
  return rows.map((o) => {
    const items = [...o.outfit_items]
      .sort((a, b) => a.position - b.position)
      .map<OutfitItemView>((oi) =>
        oi.item
          ? {
              id: oi.item.id,
              name: oi.item.name,
              role: oi.role,
              slot: oi.item.category?.slot ?? null,
              color: oi.item.primary_color,
              categoryLabel: oi.item.category?.label ?? null,
              thumbUrl: thumbs.get(oi.item.thumb_path ?? oi.item.image_path) ?? null,
              status: oi.item.availability_status,
              expectedAvailableAt: oi.item.expected_available_at,
            }
          : {
              id: null,
              name: oi.item_name_snapshot,
              role: oi.role,
              slot: null,
              color: null,
              categoryLabel: null,
              thumbUrl: null,
              status: "deleted",
              expectedAvailableAt: null,
            },
      );
    const warnings = items.flatMap((i) =>
      i.status === "deleted"
        ? [`«${i.name}» è stato eliminato dal guardaroba.`]
        : i.status === "washing"
          ? [`«${i.name}» è in lavaggio.`]
          : i.status === "unavailable"
            ? [`«${i.name}» non è disponibile.`]
            : [],
    );
    const { outfit_items: _drop, ...row } = o;
    void _drop;
    return { ...row, items, warnings };
  });
}

export async function listOutfits(
  supabase: ServerSupabase,
  opts: { favoritesOnly?: boolean; limit?: number } = {},
): Promise<OutfitView[]> {
  let q = supabase.from("outfits").select(SELECT).order("created_at", { ascending: false }).limit(opts.limit ?? 60);
  if (opts.favoritesOnly) q = q.eq("is_favorite", true);
  const { data, error } = await q;
  if (error) throw new Error("Impossibile caricare gli outfit");
  return toViews(supabase, (data ?? []) as unknown as RawOutfit[]);
}

export async function getOutfit(supabase: ServerSupabase, id: string): Promise<OutfitView | null> {
  const { data } = await supabase.from("outfits").select(SELECT).eq("id", id).maybeSingle();
  if (!data) return null;
  const [view] = await toViews(supabase, [data as unknown as RawOutfit]);
  return view;
}
