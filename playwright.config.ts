import { defineConfig, devices } from "@playwright/test";
import { readFileSync } from "fs";
import { resolve } from "path";

/**
 * Load .env.test for E2E session token and other test-specific env vars.
 * Uses manual parsing to avoid adding dotenv dependency.
 */
try {
  const envPath = resolve(__dirname, ".env.test");
  const envContent = readFileSync(envPath, "utf-8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim();
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
} catch {
  // .env.test is optional — tests that need auth will warn if token missing
}

/**
 * Playwright E2E configuration for Agent Studio
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: "./e2e/tests",
  timeout: 60_000,
  expect: { timeout: 10_000 },

  /* Global setup — injects auth session cookie before all tests */
  globalSetup: "./e2e/global.setup.ts",

  /* Run tests sequentially — shared DB state */
  fullyParallel: false,
  workers: 1,

  /* Fail CI if test.only is left in source */
  forbidOnly: !!process.env.CI,

  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,

  /* Reporters */
  reporter: process.env.CI
    ? [["github"], ["html", { open: "never" }]]
    : [["list"], ["html", { open: "never" }]],

  /* Shared settings for all projects */
  use: {
    baseURL: "http://localhost:3000",
    storageState: "./e2e/.auth/user.json",
    trace: "retain-on-first-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },

  /* Single browser project */
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  /* Start Next.js dev server before tests */
  webServer: {
    command: process.env.CI ? "pnpm build && pnpm start" : "pnpm dev",
    port: 3000,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
