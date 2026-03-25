import { test, expect } from "@playwright/test";

/**
 * Authentication tests.
 * Uses storageState override to test WITHOUT auth cookies.
 */
test.describe("Authentication", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("redirects unauthenticated users to login", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/login/);
  });

  test("login page shows OAuth provider buttons", async ({ page }) => {
    await page.goto("/login");
    // CardTitle renders as <div>, not a heading — use getByText
    await expect(page.getByText("Agent Studio").first()).toBeVisible();
    await expect(
      page.getByRole("button", { name: /github/i })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /google/i })
    ).toBeVisible();
  });

  test("public routes are accessible without auth", async ({ request }) => {
    const healthResponse = await request.get("/api/health");
    expect(healthResponse.status()).toBe(200);
    const health = await healthResponse.json();
    expect(health.status).toBe("healthy");
  });

  test("protected API routes redirect without auth", async ({ request }) => {
    // Middleware redirects unauthenticated API requests to /login (307).
    // Playwright follows redirects, so we get a 200 from the login page.
    // Verify the response is NOT the agents JSON we'd expect.
    const response = await request.get("/api/agents");
    const body = await response.text();
    // If properly redirected, we won't get a JSON array of agents
    // The body will be the login page HTML, not a JSON object with success:true
    const isAgentsResponse =
      body.includes('"success":true') && body.includes('"data"');
    expect(isAgentsResponse).toBe(false);
  });

  test("embed chat route is accessible without auth", async ({ page }) => {
    await page.goto("/embed/test-agent-id");
    expect(page.url()).not.toContain("/login");
  });
});
