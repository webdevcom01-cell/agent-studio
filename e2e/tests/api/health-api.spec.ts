import { test, expect } from "@playwright/test";

/**
 * API-only tests — no browser needed.
 * Uses Playwright's built-in `request` fixture.
 */
test.describe("Health API", () => {
  test("returns healthy status", async ({ request }) => {
    const response = await request.get("/api/health");
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body.status).toBe("healthy");
    expect(body.db).toBe("ok");
    expect(body.version).toBeDefined();
    expect(body.timestamp).toBeDefined();
  });
});
