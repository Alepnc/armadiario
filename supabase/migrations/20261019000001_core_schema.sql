-- ArmadiarIo — core schema
-- Every table is protected by Row Level Security: a user can only ever see and
-- modify rows whose owner is auth.uid(). Server code ALSO checks ownership.

-- ---------------------------------------------------------------- helpers
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- --------------------------------------------------------------- profiles
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (display_name is null or char_length(display_name) between 1 and 60),
  avatar_path text,
  tryon_photo_path text,
  height_cm smallint check (height_cm is null or height_cm between 80 and 250),
  style_preferences text[] not null default '{}',
  sizes jsonb not null default '{}'::jsonb,
  favorite_colors text[] not null default '{}',
  avoided_colors text[] not null default '{}',
  fit_preference text check (fit_preference is null or fit_preference in ('slim', 'regular', 'relaxed', 'oversize')),
  notes text check (notes is null or char_length(notes) <= 1000),
  -- Explicit, revocable consents for sending images to external AI services.
  ai_consent_at timestamptz,
  tryon_consent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- Create the profile row automatically at sign-up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    nullif(left(coalesce(new.raw_user_meta_data ->> 'display_name', ''), 60), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ------------------------------------------------------------- categories
-- Built-in categories have user_id = null. Users may add their own; `slot`
-- tells the outfit engine which role the category plays in an outfit.
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  slug text not null check (slug ~ '^[a-z0-9-]{1,40}$'),
  label text not null check (char_length(label) between 1 and 60),
  slot text not null check (slot in ('top', 'bottom', 'dress', 'outer', 'shoes', 'accessory', 'bag', 'other')),
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  unique nulls not distinct (user_id, slug)
);

insert into public.categories (slug, label, slot, sort_order) values
  ('t-shirt',     'T-shirt e magliette', 'top',       10),
  ('camicie',     'Camicie',             'top',       20),
  ('felpe',       'Felpe',               'top',       30),
  ('maglioni',    'Maglioni',            'top',       40),
  ('giacche',     'Giacche e cappotti',  'outer',     50),
  ('pantaloni',   'Pantaloni',           'bottom',    60),
  ('jeans',       'Jeans',               'bottom',    70),
  ('pantaloncini','Pantaloncini',        'bottom',    80),
  ('abiti',       'Abiti e completi',    'dress',     90),
  ('scarpe',      'Scarpe',              'shoes',    100),
  ('accessori',   'Accessori',           'accessory',110),
  ('borse',       'Borse',               'bag',      120),
  ('altro',       'Altri indumenti',     'other',    130);

-- --------------------------------------------------------- clothing_items
create table public.clothing_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  category_id uuid not null references public.categories (id) on delete restrict,
  subcategory text check (subcategory is null or char_length(subcategory) <= 60),
  primary_color text not null check (char_length(primary_color) between 1 and 30),
  secondary_colors text[] not null default '{}',
  -- Empty array = all seasons.
  seasons text[] not null default '{}' check (seasons <@ array['spring', 'summer', 'autumn', 'winter']),
  styles text[] not null default '{}',
  material text check (material is null or char_length(material) <= 60),
  pattern text not null default 'solid' check (char_length(pattern) <= 30),
  -- 1 = very casual … 4 = formal
  formality smallint not null default 2 check (formality between 1 and 4),
  fit text check (fit is null or fit in ('slim', 'regular', 'relaxed', 'oversize')),
  image_path text not null,
  thumb_path text,
  image_hash text,
  availability_status text not null default 'available'
    check (availability_status in ('available', 'washing', 'unavailable')),
  -- Informational only: it NEVER flips the status automatically.
  expected_available_at date,
  is_favorite boolean not null default false,
  notes text check (notes is null or char_length(notes) <= 1000),
  -- Raw AI suggestions kept for transparency/caching; never authoritative.
  ai_analysis jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index clothing_items_user_created_idx on public.clothing_items (user_id, created_at desc);
create index clothing_items_user_status_idx on public.clothing_items (user_id, availability_status);
create index clothing_items_user_category_idx on public.clothing_items (user_id, category_id);
create index clothing_items_user_hash_idx on public.clothing_items (user_id, image_hash) where image_hash is not null;

create trigger clothing_items_updated_at before update on public.clothing_items
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------- outfits
create table public.outfits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  occasion text check (occasion is null or char_length(occasion) <= 60),
  style text check (style is null or char_length(style) <= 60),
  season text check (season is null or season in ('spring', 'summer', 'autumn', 'winter')),
  description text check (description is null or char_length(description) <= 2000),
  tips text[] not null default '{}',
  notes text check (notes is null or char_length(notes) <= 1000),
  is_favorite boolean not null default false,
  -- 'ai' | 'rules' | 'manual' | 'duplicate'
  source text not null default 'rules' check (source in ('ai', 'rules', 'manual', 'duplicate')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index outfits_user_created_idx on public.outfits (user_id, created_at desc);

create trigger outfits_updated_at before update on public.outfits
  for each row execute function public.set_updated_at();

create table public.outfit_items (
  id uuid primary key default gen_random_uuid(),
  outfit_id uuid not null references public.outfits (id) on delete cascade,
  -- Set to NULL (not deleted) when the garment is removed, so the saved outfit
  -- survives and the UI can say "garment deleted".
  clothing_item_id uuid references public.clothing_items (id) on delete set null,
  role text not null check (char_length(role) between 1 and 60),
  position smallint not null default 0,
  item_name_snapshot text not null,
  created_at timestamptz not null default now()
);

create unique index outfit_items_unique_item_idx
  on public.outfit_items (outfit_id, clothing_item_id) where clothing_item_id is not null;
create index outfit_items_outfit_idx on public.outfit_items (outfit_id, position);
create index outfit_items_item_idx on public.outfit_items (clothing_item_id);

-- ---------------------------------------------------------- generated_images
create table public.generated_images (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  outfit_id uuid not null references public.outfits (id) on delete cascade,
  image_path text,
  source_photo_path text not null,
  provider text not null,
  generation_status text not null default 'pending'
    check (generation_status in ('pending', 'processing', 'completed', 'failed')),
  error_code text,
  job_state jsonb not null default '{}'::jsonb,
  -- Hash of (photo, garments) used to block duplicate in-flight requests.
  input_hash text not null,
  duration_ms integer,
  is_saved boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index generated_images_user_idx on public.generated_images (user_id, created_at desc);
create index generated_images_outfit_idx on public.generated_images (outfit_id, created_at desc);
create unique index generated_images_inflight_idx
  on public.generated_images (user_id, input_hash)
  where generation_status in ('pending', 'processing');

create trigger generated_images_updated_at before update on public.generated_images
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------ ai_usage / recs log
-- Cost, latency and quota tracking. Contains NO prompts, images or personal data.
create table public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  operation text not null check (operation in ('analyze_item', 'compose_outfit', 'try_on')),
  provider text not null,
  model text,
  success boolean not null,
  duration_ms integer,
  input_tokens integer,
  output_tokens integer,
  created_at timestamptz not null default now()
);

create index ai_usage_user_op_idx on public.ai_usage (user_id, operation, created_at desc);

-- Which garment combinations were recently suggested (variety in ranking).
create table public.recommendation_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  item_ids uuid[] not null,
  created_at timestamptz not null default now()
);

create index recommendation_log_user_idx on public.recommendation_log (user_id, created_at desc);
