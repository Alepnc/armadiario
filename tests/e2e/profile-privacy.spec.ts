import { expect, test } from "@playwright/test";

const PASSWORD = "Password-e2e-123";
const email = `carla-${Date.now().toString(36)}@e2e.test`;

test.describe.configure({ mode: "serial" });

test("profile preferences persist, privacy consents are explicit, account deletion removes access", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && !/favicon|Failed to load resource/.test(m.text()) && errors.push(m.text()));

  await page.goto("/register");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Crea account" }).click();
  await expect(page).toHaveURL(/dashboard/);

  // Profile: every field optional, saved and reloaded from the database.
  await page.goto("/profile");
  await page.getByLabel("Nome o nickname").fill("Carla");
  await page.getByLabel("Altezza (cm)").fill("172");
  await page.getByRole("button", { name: "minimal", exact: true }).click();
  await page.getByRole("group", { name: "Colori preferiti" }).getByRole("button", { name: "Oliva" }).click();
  await page.getByRole("group", { name: "Colori da evitare" }).getByRole("button", { name: "Arancione" }).click();
  await page.getByLabel("Taglia · Scarpe").fill("39");
  await page.getByLabel("Vestibilità preferita").selectOption("relaxed");
  await page.getByRole("button", { name: "Salva profilo" }).click();
  await expect(page.getByText("Profilo salvato")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Nome o nickname")).toHaveValue("Carla");
  await expect(page.getByLabel("Altezza (cm)")).toHaveValue("172");
  await expect(page.getByLabel("Taglia · Scarpe")).toHaveValue("39");
  await expect(page.getByRole("button", { name: "minimal", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("group", { name: "Colori preferiti" }).getByRole("button", { name: "Oliva" })).toHaveAttribute("aria-pressed", "true");

  // An invalid height is blocked in the browser (native constraints)…
  await page.getByLabel("Altezza (cm)").fill("20");
  expect(await page.getByLabel("Altezza (cm)").evaluate((el: HTMLInputElement) => el.checkValidity())).toBe(false);
  await page.getByLabel("Altezza (cm)").fill("172");

  // Privacy: consent is off by default and persists once granted.
  await page.goto("/settings");
  const aiSwitch = page.getByRole("switch").first();
  await expect(aiSwitch).not.toBeChecked();
  await aiSwitch.check();
  await expect(page.getByText("Consenso registrato")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("switch").first()).toBeChecked();

  // The stylist page tells the truth about AI being unconfigured, and the empty wardrobe is handled.
  await page.goto("/stylist");
  await expect(page.getByText("Servono più capi per comporre un outfit")).toBeVisible();

  // Delete the account for real.
  await page.goto("/settings");
  await page.getByRole("button", { name: "Elimina il mio account" }).click();
  await page.getByRole("dialog").getByLabel("Conferma scrivendo ELIMINA").fill("ELIMINA");
  await page.getByRole("dialog").getByRole("button", { name: "Elimina tutto" }).click();
  await expect(page).toHaveURL("http://localhost:3000/");

  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Accedi" }).click();
  await expect(page.getByText("Email o password non corretti.")).toBeVisible();
  expect(errors).toEqual([]);
});
