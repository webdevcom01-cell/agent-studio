import { chromium, type FullConfig } from "@playwright/test";
import path from "path";

const AUTH_FILE = path.join(__dirname, ".auth", "user.json");

/**
 * Global setup runs ONCE before all test suites.
 *
 * Strategy: Bypass OAuth by injecting a session cookie directly.
 * This avoids the need for real GitHub/Google OAuth during E2E tests.
 *
 * To generate E2E_SESSION_TOKEN:
 *   1. Login to the app normally in a browser
 *   2. Copy the `authjs.session-token` cookie value
 *   3. Set it in .env.test as E2E_SESSION_TOKEN
 *
 * For CI: Generate a JWT programmatically using the same AUTH_SECRET.
 */
async function globalSetup(config: FullConfig) {
  const sessionToken = process.env.E2E_SESSION_TOKEN;

  if (!sessionToken) {
    console.warn(
      "\n⚠️  E2E_SESSION_TOKEN not set — tests requiring auth will be skipped.\n" +
        "   Login to the app, copy authjs.session-token cookie, and set it in .env.test\n"
    );
    // Create empty storage state so Playwright doesn't error
    const browser = await chromium.launch();
    const context = await browser.newContext();
    await context.storageState({ path: AUTH_FILE });
    await browser.close();
    return;
  }

  const baseURL = config.projects[0]?.use?.baseURL ?? "http://localhost:3000";
  const browser = await chromium.launch();
  const context = await browser.newContext();

  // Set the NextAuth session cookie
  await context.addCookies([
    {
      name: "authjs.session-token",
      value: sessionToken,
      domain: new URL(baseURL).hostname,
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);

  // Verify the session works by hitting the dashboard
  const page = await context.newPage();
  const response = await page.goto(baseURL);

  if (response?.status() === 200) {
    console.log("✅ Auth session verified — saving storage state");
  } else {
    console.warn(
      `⚠️  Auth verification returned status ${response?.status()} — session token may be expired`
    );
  }

  await context.storageState({ path: AUTH_FILE });
  await browser.close();
}

export default globalSetup;
