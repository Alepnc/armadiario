import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests need the app AND a Supabase instance (local: `npx supabase start`)
 * configured in .env.local. No AI/try-on keys are required: they exercise the
 * "provider not configured" paths on purpose.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: "http://localhost:3000", trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
