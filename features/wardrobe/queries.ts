import "server-only";
import type { ServerSupabase } from "@/lib/supabase/server";
import type { Category, ClothingItem } from "@/types/db";
import type { WardrobeFilters } from "@/lib/validation/wardrobe";
import { signPaths } from "@/lib/storage";
import { BUCKETS } from "@/lib/config";

const ITEM_SELECT = "*, category:categories!inner(id,slug,label,slot)";

export async function listCategories(supabase: ServerSupabase): Promise<Category[]> {
  const { data, error } = await supabase
    .from("categories")
    .select("id,user_id,slug,label,slot,sort_order")
    .order("sort_order")
    .order("label");
  if (error) throw new Error("Impossibile caricare le categorie");
  return (data ?? []) as Category[];
}

export interface WardrobePage {
  items: ClothingItem[];
  total: number;
  thumbs: Map<string, string>;
}

export async function listItems(supabase: ServerSupabase, f: WardrobeFilters): Promise<WardrobePage> {
  let q = supabase.from("clothing_items").select(ITEM_SELECT, { count: "exact" });

  if (f.q) {
    // Escape LIKE wildcards and PostgREST filter separators.
    const term = f.q.replace(/[%_\\,()]/g, " ").trim();
    if (term) q = q.or(`name.ilike.%${term}%,subcategory.ilike.%${term}%,notes.ilike.%${term}%`);
  }
  if (f.category) q = q.eq("category_id", f.category);
  if (f.color) q = q.or(`primary_color.eq.${f.color},secondary_colors.cs.{${f.color}}`);
  if (f.season) q = q.or(`seasons.cs.{${f.season}},seasons.eq.{}`);
  if (f.style) q = q.contains("styles", [f.style]);
  if (f.status) q = q.eq("availability_status", f.status);

  if (f.sort === "name") q = q.order("name", { ascending: true });
  else if (f.sort === "favorites") q = q.order("is_favorite", { ascending: false }).order("created_at", { ascending: false });
  else q = q.order("created_at", { ascending: false });

  const { data, count, error } = await q.range(0, f.limit - 1);
  if (error) throw new Error("Impossibile caricare il guardaroba");
  const items = (data ?? []) as unknown as ClothingItem[];
  const thumbs = await signPaths(
    supabase,
    BUCKETS.wardrobe,
    items.map((i) => i.thumb_path ?? i.image_path),
  );
  return { items, total: count ?? items.length, thumbs };
}

export async function getItem(supabase: ServerSupabase, id: string): Promise<ClothingItem | null> {
  const { data } = await supabase.from("clothing_items").select(ITEM_SELECT).eq("id", id).maybeSingle();
  return (data as unknown as ClothingItem | null) ?? null;
}

export async function listAllItems(supabase: ServerSupabase): Promise<ClothingItem[]> {
  const { data, error } = await supabase
    .from("clothing_items")
    .select(ITEM_SELECT)
    .order("created_at", { ascending: false })
    .limit(1000);
  if (error) throw new Error("Impossibile caricare il guardaroba");
  return (data ?? []) as unknown as ClothingItem[];
}

export async function getWardrobeStats(supabase: ServerSupabase) {
  const count = async (status?: string) => {
    let q = supabase.from("clothing_items").select("id", { count: "exact", head: true });
    if (status) q = q.eq("availability_status", status);
    const { count: c } = await q;
    return c ?? 0;
  };
  const [total, available, washing, unavailable, outfits] = await Promise.all([
    count(),
    count("available"),
    count("washing"),
    count("unavailable"),
    supabase.from("outfits").select("id", { count: "exact", head: true }).then((r) => r.count ?? 0),
  ]);
  return { total, available, washing, unavailable, outfits };
}
