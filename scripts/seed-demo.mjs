// Explicit DEMO seed (development only). Creates a demo account with a few
// illustrative garments drawn as flat silhouettes — NOT real photos.
// Usage: npm run seed:demo      (needs .env.local with the service-role key)
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !service) throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local");
if (!/127\.0\.0\.1|localhost/.test(url) && process.env.ALLOW_REMOTE_SEED !== "1") {
  throw new Error("Refusing to seed a non-local Supabase. Set ALLOW_REMOTE_SEED=1 if you really mean it.");
}

const EMAIL = "demo@armadiario.test";
const PASSWORD = "demo-password-123";
const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });

const SHAPES = {
  tee: (c) => `<path d="M120 90 L180 70 Q250 110 320 70 L380 90 L440 170 L380 200 L360 175 L360 430 L140 430 L140 175 L120 200 L60 170 Z" fill="${c}"/>`,
  shirt: (c) => `<path d="M120 90 L190 70 L250 120 L310 70 L380 90 L440 190 L385 215 L365 185 L365 440 L135 440 L135 185 L115 215 L60 190 Z" fill="${c}"/><path d="M250 120 L250 440" stroke="rgba(0,0,0,.18)" stroke-width="4"/>`,
  jacket: (c) => `<path d="M110 80 L190 60 L250 110 L310 60 L390 80 L450 220 L400 460 L300 460 L250 150 L200 460 L100 460 L50 220 Z" fill="${c}"/>`,
  pants: (c) => `<path d="M150 50 L350 50 L380 450 L275 450 L250 190 L225 450 L120 450 Z" fill="${c}"/><path d="M150 50 L350 50 L350 80 L150 80Z" fill="rgba(0,0,0,.15)"/>`,
  shorts: (c) => `<path d="M150 90 L350 90 L385 300 L285 300 L250 200 L215 300 L115 300 Z" fill="${c}"/>`,
  shoe: (c) => `<path d="M60 300 Q60 220 140 220 L190 250 Q250 240 300 280 L430 300 Q460 310 460 340 L460 370 L60 370 Z" fill="${c}"/><rect x="60" y="360" width="400" height="22" rx="8" fill="rgba(0,0,0,.35)"/>`,
  dress: (c) => `<path d="M190 50 L310 50 L320 160 L400 460 L100 460 L180 160 Z" fill="${c}"/>`,
};

async function picture(kind, color, bg) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="500" height="600"><rect width="500" height="600" fill="${bg}"/><g transform="translate(0,60)">${SHAPES[kind](color)}</g></svg>`;
  return sharp(Buffer.from(svg)).webp({ quality: 85 }).toBuffer();
}

const ITEMS = [
  ["T-shirt bianca", "t-shirt", "tee", "bianco", "#f4f1ea", "#ece6da", [], ["casual", "minimal"], 1],
  ["Maglia a righe navy", "t-shirt", "tee", "navy", "#1f2d4d", "#ece6da", ["spring", "summer", "autumn"], ["casual"], 1],
  ["Camicia oxford azzurra", "camicie", "shirt", "azzurro", "#8fb4d9", "#ece6da", [], ["smart casual", "classico"], 3],
  ["Camicia bianca", "camicie", "shirt", "bianco", "#f7f5f0", "#e6dfd0", [], ["elegante", "classico"], 4],
  ["Maglione cammello", "maglioni", "tee", "cammello", "#b88a54", "#ece6da", ["autumn", "winter"], ["classico", "minimal"], 2],
  ["Felpa grigia", "felpe", "tee", "grigio", "#9a9a96", "#ece6da", ["autumn", "winter", "spring"], ["streetwear", "sportivo"], 1],
  ["Giacca blu notte", "giacche", "jacket", "navy", "#1f2d4d", "#e6dfd0", ["autumn", "winter", "spring"], ["elegante", "smart casual"], 3],
  ["Cappotto antracite", "giacche", "jacket", "antracite", "#44464a", "#e6dfd0", ["winter"], ["elegante"], 3],
  ["Jeans dritti", "jeans", "pants", "denim", "#4b6a93", "#ece6da", [], ["casual", "streetwear"], 2],
  ["Chino beige", "pantaloni", "pants", "beige", "#d9c9ae", "#ece6da", [], ["smart casual", "classico"], 3],
  ["Pantaloni neri", "pantaloni", "pants", "nero", "#26252a", "#e6dfd0", [], ["elegante", "minimal"], 4],
  ["Bermuda kaki", "pantaloncini", "shorts", "kaki", "#a79a6b", "#ece6da", ["spring", "summer"], ["casual"], 1],
  ["Sneakers bianche", "scarpe", "shoe", "bianco", "#fafafa", "#ece6da", [], ["casual", "minimal", "streetwear"], 1],
  ["Mocassini marroni", "scarpe", "shoe", "marrone", "#6b4a34", "#ece6da", [], ["smart casual", "classico"], 3],
  ["Stringate nere", "scarpe", "shoe", "nero", "#1c1b1a", "#e6dfd0", [], ["elegante"], 4],
  ["Abito verde oliva", "abiti", "dress", "oliva", "#6b6f3a", "#ece6da", ["spring", "summer", "autumn"], ["elegante", "boho"], 3],
];

const { data: list } = await admin.auth.admin.listUsers({ perPage: 200 });
const existing = list.users.find((u) => u.email === EMAIL);
if (existing) await admin.auth.admin.deleteUser(existing.id);
const { data: created, error } = await admin.auth.admin.createUser({
  email: EMAIL,
  password: PASSWORD,
  email_confirm: true,
  user_metadata: { display_name: "Demo" },
});
if (error) throw error;
const uid = created.user.id;

const { data: cats } = await admin.from("categories").select("id,slug").is("user_id", null);
const catId = Object.fromEntries(cats.map((c) => [c.slug, c.id]));

for (const [name, cat, shape, color, hex, bg, seasons, styles, formality] of ITEMS) {
  const id = crypto.randomUUID();
  const main = await picture(shape, hex, bg);
  const thumb = await sharp(main).resize(420, 504, { fit: "inside" }).webp({ quality: 75 }).toBuffer();
  const path = `${uid}/items/${id}.webp`;
  const thumbPath = `${uid}/items/${id}.thumb.webp`;
  for (const [p, buf] of [[path, main], [thumbPath, thumb]]) {
    const { error: e } = await admin.storage.from("wardrobe").upload(p, buf, { contentType: "image/webp" });
    if (e) throw e;
  }
  const { error: e2 } = await admin.from("clothing_items").insert({
    user_id: uid, name, category_id: catId[cat], primary_color: color, seasons, styles, formality,
    image_path: path, thumb_path: thumbPath,
  });
  if (e2) throw e2;
}
// One garment in the wash, so the availability UI has something to show.
await admin.from("clothing_items").update({ availability_status: "washing" }).eq("user_id", uid).eq("name", "Felpa grigia");

console.log(`Demo ready → ${EMAIL} / ${PASSWORD}  (${ITEMS.length} garments, illustrative images only)`);
