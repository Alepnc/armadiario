import { expect, test, type Page } from "@playwright/test";
import { fakeGarment } from "./images";

test.describe.configure({ mode: "serial" });

const PASSWORD = "Password-e2e-123";
const unique = Date.now().toString(36);
const emailA = `alice-${unique}@e2e.test`;
const emailB = `bruno-${unique}@e2e.test`;

const GARMENTS = [
  { name: "T-shirt bianca", category: "T-shirt e magliette", color: "Bianco", base: "#f2f2f2" },
  { name: "Camicia azzurra", category: "Camicie", color: "Azzurro", base: "#8fb4d9" },
  { name: "Jeans scuri", category: "Jeans", color: "Denim", base: "#2f4a73" },
  { name: "Chino beige", category: "Pantaloni", color: "Beige", base: "#d9c9ae" },
  { name: "Sneakers bianche", category: "Scarpe", color: "Bianco", base: "#fafafa" },
  { name: "Mocassini marroni", category: "Scarpe", color: "Marrone", base: "#6b4a34" },
];

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Accedi" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

async function register(page: Page, email: string, name: string) {
  await page.goto("/register");
  await page.getByLabel("Nome o nickname").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Crea account" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

test("1. a new user registers, lands on an honest empty dashboard and can log out/in", async ({ page }) => {
  await register(page, emailA, "Alice");
  await expect(page.getByRole("heading", { name: "Ciao, Alice" })).toBeVisible();
  await expect(page.getByText("Iniziamo dal tuo armadio")).toBeVisible();
  // Stats come from the database: everything is 0.
  await expect(page.getByRole("link", { name: "0 capi" })).toBeVisible();

  await page.getByRole("button", { name: "Esci" }).first().click();
  await expect(page).toHaveURL("http://localhost:3000/");
  await page.goto("/wardrobe");
  await expect(page).toHaveURL(/\/login/); // protected route

  await page.getByLabel("Email").fill(emailA);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Accedi" }).click();
  await expect(page).toHaveURL(/\/dashboard|\/wardrobe/);
});

test("2. wrong password shows an error and keeps the user out", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(emailA);
  await page.getByLabel("Password").fill("wrong-password");
  await page.getByRole("button", { name: "Accedi" }).click();
  await expect(page.getByText("Email o password non corretti.")).toBeVisible();
});

test("3. bulk-upload six garments with photos, fill metadata, save all", async ({ page }) => {
  await login(page, emailA);
  await page.goto("/wardrobe/new");
  await expect(page.getByText("L'analisi AI non è configurata")).toBeVisible();

  const files = await Promise.all(
    GARMENTS.map(async (g, i) => ({ name: `${g.name}.png`, mimeType: "image/png", buffer: await fakeGarment(i + 1, g.base) })),
  );
  await page.locator('input[type="file"][multiple]').setInputFiles(files);

  const rows = page.locator('ul[aria-label="Coda di caricamento"] > li');
  await expect(rows).toHaveCount(6);
  for (let i = 0; i < GARMENTS.length; i++) {
    const g = GARMENTS[i];
    const row = rows.nth(i);
    await expect(row.getByLabel("Nome", { exact: true })).toBeVisible({ timeout: 30_000 }); // uploaded → form open
    await row.getByLabel("Nome", { exact: true }).fill(g.name);
    await row.getByLabel("Categoria", { exact: true }).selectOption({ label: g.category });
    await row.getByRole("radiogroup", { name: "Colore principale" }).getByRole("radio", { name: g.color }).click();
  }
  await page.getByRole("button", { name: /Salva tutti \(6\)/ }).click();
  await expect(page.getByText("6 capi salvati")).toBeVisible();

  await page.goto("/wardrobe");
  await expect(page.getByText("6 capi")).toBeVisible();
  for (const g of GARMENTS) await expect(page.getByRole("link", { name: g.name, exact: true }).first()).toBeVisible();
  // Images actually load from private storage through signed URLs.
  const broken = await page.$$eval("ul img", (imgs) => imgs.filter((i) => !(i as HTMLImageElement).complete || (i as HTMLImageElement).naturalWidth === 0).length);
  expect(broken).toBe(0);
});

test("4. uploading the same picture again warns about a duplicate", async ({ page }) => {
  await login(page, emailA);
  await page.goto("/wardrobe/new");
  await page.locator('input[type="file"][multiple]').setInputFiles({ name: "again.png", mimeType: "image/png", buffer: await fakeGarment(1, GARMENTS[0].base) });
  await expect(page.getByText(/Sembra molto simile a «T-shirt bianca»/)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("button", { name: "Salva questo capo" })).toBeDisabled();
  await page.getByRole("button", { name: "Scarta questa foto" }).click();
  await expect(page.locator('ul[aria-label="Coda di caricamento"] > li')).toHaveCount(0);
});

test("5. rejects a non-image file renamed to .png", async ({ page }) => {
  await login(page, emailA);
  await page.goto("/wardrobe/new");
  await page.locator('input[type="file"][multiple]').setInputFiles({ name: "evil.png", mimeType: "image/png", buffer: Buffer.from("<html><script>alert(1)</script></html>") });
  const row = page.locator('ul[aria-label="Coda di caricamento"] > li').first();
  await expect(row.getByText("Formato non supportato")).toBeVisible({ timeout: 30_000 });
  await expect(row.getByRole("button", { name: "Riprova" })).toBeVisible();
});

test("6. edit metadata, mark a garment as washing from the grid, status survives reload", async ({ page }) => {
  await login(page, emailA);
  await page.goto("/wardrobe");

  // edit
  await page.getByRole("link", { name: "Camicia azzurra", exact: true }).first().click();
  await page.getByRole("link", { name: "Modifica" }).click();
  await page.getByLabel("Nome", { exact: true }).fill("Camicia oxford azzurra");
  await page.getByLabel("Materiale").fill("Cotone");
  await page.getByRole("button", { name: "Salva modifiche" }).click();
  await expect(page.getByRole("heading", { name: "Camicia oxford azzurra" })).toBeVisible();
  await expect(page.getByText("Cotone")).toBeVisible();

  // availability from the grid
  await page.goto("/wardrobe");
  const card = page.locator("li", { has: page.getByRole("link", { name: "T-shirt bianca", exact: true }) }).first();
  await card.getByRole("button", { name: /Disponibilità: Disponibile/ }).click();
  await page.getByRole("menuitemradio", { name: "In lavaggio" }).click();
  await expect(card.getByText("In lavaggio")).toBeVisible();

  await page.reload();
  const cardAfter = page.locator("li", { has: page.getByRole("link", { name: "T-shirt bianca", exact: true }) }).first();
  await expect(cardAfter.getByText("In lavaggio")).toBeVisible();

  // filter
  await page.getByRole("button", { name: "In lavaggio", exact: true }).click();
  await expect(page).toHaveURL(/status=washing/);
  await expect(page.getByRole("link", { name: "T-shirt bianca", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Jeans scuri", exact: true })).toHaveCount(0);

  // detail page control too
  await page.getByRole("link", { name: "T-shirt bianca", exact: true }).first().click();
  await expect(page.getByRole("radio", { name: "In lavaggio" })).toBeChecked();
});

let savedOutfitUrl = "";

test("7. stylist never proposes the washing garment; save outfit; it appears in history", async ({ page }) => {
  await login(page, emailA);
  await page.goto("/stylist");
  await page.getByRole("button", { name: "Università" }).click();
  await page.getByRole("button", { name: "Crea outfit" }).click();
  await expect(page.getByText(/L'AI non è configurata/).first()).toBeVisible();
  const proposals = page.locator("article");
  await expect(proposals.first()).toBeVisible({ timeout: 30_000 });
  expect(await proposals.count()).toBeGreaterThan(0);
  await expect(page.locator("article").getByText("T-shirt bianca", { exact: true })).toHaveCount(0);

  await proposals.first().getByRole("button", { name: "Salva", exact: true }).click();
  await expect(proposals.first().getByRole("link", { name: /Salvato/ })).toBeVisible();
  await proposals.first().getByRole("link", { name: /Salvato/ }).click();
  await expect(page).toHaveURL(/\/outfits\/[0-9a-f-]{36}$/);
  savedOutfitUrl = page.url();

  await page.goto("/outfits");
  await expect(page.getByRole("heading", { level: 2 }).first()).toBeVisible();
  await expect(page.getByText("Non hai ancora salvato outfit")).toHaveCount(0);
});

test("8. deleting a garment keeps the saved outfit and shows a warning", async ({ page }) => {
  await login(page, emailA);
  await page.goto(savedOutfitUrl);
  const firstItemLink = page.locator('ul a[aria-label^="Apri "]').first();
  const label = (await firstItemLink.getAttribute("aria-label"))!.replace("Apri ", "");
  await firstItemLink.click();
  await page.getByRole("link", { name: "Modifica" }).click();
  await page.getByRole("button", { name: "Elimina capo" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Elimina" }).click();
  await expect(page).toHaveURL(/\/wardrobe$/);

  await page.goto(savedOutfitUrl);
  await expect(page.getByText("Da controllare prima di indossarlo")).toBeVisible();
  await expect(page.getByText(`«${label}» è stato eliminato dal guardaroba.`)).toBeVisible();
});

test("9. virtual try-on without a configured provider explains it and the outfit is still shown", async ({ page }) => {
  await login(page, emailA);
  await page.goto(`${savedOutfitUrl}/try-on`);
  await expect(page.getByText("La prova virtuale non è configurata su questo server.")).toBeVisible();
  await expect(page.locator("ul img").first()).toBeVisible();
  // The API refuses cleanly as well.
  const res = await page.request.post("/api/try-on", { data: { outfitId: savedOutfitUrl.split("/").pop() } });
  expect(res.status()).toBe(501);
  expect((await res.json()).code).toBe("not_configured");
});

test("10. a second account cannot see or reach the first account's data", async ({ browser }) => {
  const ctxA = await browser.newContext();
  const pageA = await ctxA.newPage();
  await login(pageA, emailA);
  await pageA.goto("/wardrobe");
  const itemHref = await pageA.locator('ul a[href^="/wardrobe/"]').first().getAttribute("href");
  const itemId = itemHref!.split("/").pop()!;
  const outfitId = savedOutfitUrl.split("/").pop()!;
  await ctxA.close();

  const ctxB = await browser.newContext();
  const page = await ctxB.newPage();
  await register(page, emailB, "Bruno");
  await page.goto("/wardrobe");
  await expect(page.getByText("Il tuo armadio è ancora vuoto")).toBeVisible();
  await page.goto("/outfits");
  await expect(page.getByText("Non hai ancora salvato outfit")).toBeVisible();

  for (const url of [`/wardrobe/${itemId}`, `/outfits/${outfitId}`, `/wardrobe/${itemId}/edit`, `/outfits/${outfitId}/try-on`]) {
    await page.goto(url);
    await expect(page.getByRole("heading", { name: "Non abbiamo trovato questa pagina" }), url).toBeVisible();
  }
  const tryOn = await page.request.get(`/api/try-on/${outfitId}`);
  expect(tryOn.status()).toBe(404);
  const analyze = await page.request.post("/api/ai/analyze", { data: { path: `someone-else/items/x.webp` } });
  expect(analyze.status()).toBe(400);
  const anon = await (await browser.newContext()).request.get("/api/try-on/" + outfitId);
  expect(anon.status()).toBe(401);
  await ctxB.close();
});

test("11. smartphone experience: bottom navigation, no horizontal overflow", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await login(page, emailA);
  const nav = page.getByRole("navigation", { name: "Principale" }).last();
  await expect(nav).toBeVisible();
  for (const path of ["/dashboard", "/wardrobe", "/wardrobe/new", "/stylist", "/outfits", "/profile", "/settings"]) {
    await page.goto(path);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `horizontal overflow on ${path}`).toBeLessThanOrEqual(1);
  }
  await page.goto("/wardrobe");
  await nav.getByRole("link", { name: "Stylist" }).click();
  await expect(page).toHaveURL(/stylist/);
  await ctx.close();
});
