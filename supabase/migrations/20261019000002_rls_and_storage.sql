-- Row Level Security + private storage buckets.

alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.clothing_items enable row level security;
alter table public.outfits enable row level security;
alter table public.outfit_items enable row level security;
alter table public.generated_images enable row level security;
alter table public.ai_usage enable row level security;
alter table public.recommendation_log enable row level security;

-- profiles --------------------------------------------------------------
create policy profiles_select_own on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy profiles_insert_own on public.profiles
  for insert to authenticated with check (id = (select auth.uid()));
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- categories: built-ins are readable by everyone signed in; custom ones are private.
create policy categories_select on public.categories
  for select to authenticated
  using (user_id is null or user_id = (select auth.uid()));
create policy categories_insert_own on public.categories
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy categories_update_own on public.categories
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy categories_delete_own on public.categories
  for delete to authenticated using (user_id = (select auth.uid()));

-- clothing_items --------------------------------------------------------
create policy items_select_own on public.clothing_items
  for select to authenticated using (user_id = (select auth.uid()));
create policy items_insert_own on public.clothing_items
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.categories c
      where c.id = category_id and (c.user_id is null or c.user_id = (select auth.uid()))
    )
  );
create policy items_update_own on public.clothing_items
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.categories c
      where c.id = category_id and (c.user_id is null or c.user_id = (select auth.uid()))
    )
  );
create policy items_delete_own on public.clothing_items
  for delete to authenticated using (user_id = (select auth.uid()));

-- outfits ---------------------------------------------------------------
create policy outfits_select_own on public.outfits
  for select to authenticated using (user_id = (select auth.uid()));
create policy outfits_insert_own on public.outfits
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy outfits_update_own on public.outfits
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy outfits_delete_own on public.outfits
  for delete to authenticated using (user_id = (select auth.uid()));

-- outfit_items: ownership of the outfit AND of the referenced garment --------
create policy outfit_items_select_own on public.outfit_items
  for select to authenticated
  using (exists (select 1 from public.outfits o where o.id = outfit_id and o.user_id = (select auth.uid())));
create policy outfit_items_insert_own on public.outfit_items
  for insert to authenticated
  with check (
    exists (select 1 from public.outfits o where o.id = outfit_id and o.user_id = (select auth.uid()))
    and (
      clothing_item_id is null
      or exists (select 1 from public.clothing_items c where c.id = clothing_item_id and c.user_id = (select auth.uid()))
    )
  );
create policy outfit_items_update_own on public.outfit_items
  for update to authenticated
  using (exists (select 1 from public.outfits o where o.id = outfit_id and o.user_id = (select auth.uid())))
  with check (
    exists (select 1 from public.outfits o where o.id = outfit_id and o.user_id = (select auth.uid()))
    and (
      clothing_item_id is null
      or exists (select 1 from public.clothing_items c where c.id = clothing_item_id and c.user_id = (select auth.uid()))
    )
  );
create policy outfit_items_delete_own on public.outfit_items
  for delete to authenticated
  using (exists (select 1 from public.outfits o where o.id = outfit_id and o.user_id = (select auth.uid())));

-- generated_images --------------------------------------------------------
create policy generated_select_own on public.generated_images
  for select to authenticated using (user_id = (select auth.uid()));
create policy generated_insert_own on public.generated_images
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.outfits o where o.id = outfit_id and o.user_id = (select auth.uid()))
  );
create policy generated_update_own on public.generated_images
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy generated_delete_own on public.generated_images
  for delete to authenticated using (user_id = (select auth.uid()));

-- ai_usage / recommendation_log: append-only for the owner -------------------
create policy ai_usage_select_own on public.ai_usage
  for select to authenticated using (user_id = (select auth.uid()));
create policy ai_usage_insert_own on public.ai_usage
  for insert to authenticated with check (user_id = (select auth.uid()));

create policy reclog_select_own on public.recommendation_log
  for select to authenticated using (user_id = (select auth.uid()));
create policy reclog_insert_own on public.recommendation_log
  for insert to authenticated with check (user_id = (select auth.uid()));

-- Storage -----------------------------------------------------------------
-- Three PRIVATE buckets. Objects live under "<user_id>/..." and the policies
-- below only allow the owner of that folder to touch them.
--   wardrobe  : garment photos + thumbnails
--   personal  : profile picture and virtual try-on source photo
--   generated : virtual try-on results
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('wardrobe',  'wardrobe',  false, 8388608, array['image/webp', 'image/jpeg', 'image/png']),
  ('personal',  'personal',  false, 8388608, array['image/webp', 'image/jpeg', 'image/png']),
  ('generated', 'generated', false, 8388608, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy wardrobe_objects_select on storage.objects
  for select to authenticated
  using (bucket_id in ('wardrobe', 'personal', 'generated')
         and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy wardrobe_objects_insert on storage.objects
  for insert to authenticated
  with check (bucket_id in ('wardrobe', 'personal', 'generated')
              and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy wardrobe_objects_update on storage.objects
  for update to authenticated
  using (bucket_id in ('wardrobe', 'personal', 'generated')
         and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id in ('wardrobe', 'personal', 'generated')
              and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy wardrobe_objects_delete on storage.objects
  for delete to authenticated
  using (bucket_id in ('wardrobe', 'personal', 'generated')
         and (storage.foldername(name))[1] = (select auth.uid())::text);
