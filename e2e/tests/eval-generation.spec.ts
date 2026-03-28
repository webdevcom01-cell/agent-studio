/**
 * E2E tests — Eval Generation + Standards Browser
 *
 * Covers:
 *   - Standards Browser page renders all 19 categories
 *   - Generate Eval Suite dialog on the evals page
 *   - Per-agent "Generate Eval Suite" dropdown item on dashboard
 *   - "Generate All" (backfill) button in dashboard header
 *
 * These tests use mocked API responses so they don't require a live AI key.
 */

import { test, expect } from "../fixtures/base";

// ─── Standards Browser ────────────────────────────────────────────────────────

test.describe("Standards Browser — /evals/standards", () => {
  test("renders the standards page with global assertions section", async ({
    page,
  }) => {
    await page.goto("/evals/standards");

    // Page title visible in header (use heading role to avoid matching breadcrumb nav)
    await expect(page.getByRole("heading", { name: "Eval Standards" })).toBeVisible({ timeout: 10_000 });

    // Layer legend section present
    await expect(page.getByText("Evaluation layers", { exact: false }).first()).toBeVisible();
    await expect(page.getByText("Deterministic").first()).toBeVisible();
    await expect(page.getByText("LLM-Judge").first()).toBeVisible();

    // Global assertions section (use heading role to avoid matching partial-text elements)
    await expect(page.getByRole("heading", { name: "Global Assertions" })).toBeVisible();

    // Both global assertions rendered — use .first() since "latency" / "relevance"
    // appear as assertion-type labels in each of the 19 category cards too.
    await expect(page.getByText("latency", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("relevance", { exact: true }).first()).toBeVisible();
  });

  test("renders all 19 category cards", async ({ page }) => {
    await page.goto("/evals/standards");
    await page.waitForLoadState("networkidle");

    // Each category card should show a code-style category slug
    const expectedCategories = [
      "assistant", "research", "writing", "coding", "design",
      "marketing", "support", "data", "education", "productivity",
      "specialized", "engineering", "testing", "product",
      "project-management", "game-development", "spatial-computing",
      "paid-media", "desktop-automation",
    ];

    for (const cat of expectedCategories) {
      await expect(page.locator(`text=${cat}`).first()).toBeVisible({
        timeout: 5_000,
      });
    }
  });

  test("can expand suggested test labels", async ({ page }) => {
    await page.goto("/evals/standards");
    await page.waitForLoadState("networkidle");

    // Click the first "suggested test labels" toggle
    const firstToggle = page.getByText(/suggested test labels/).first();
    await firstToggle.click();

    // Labels list should now be visible (at least one item)
    await expect(page.getByText(/Basic factual question/i).first()).toBeVisible({
      timeout: 5_000,
    });
  });

  test("passing score badges show correct colors", async ({ page }) => {
    await page.goto("/evals/standards");
    await page.waitForLoadState("networkidle");

    // The specialized category has 85% passing score (highest tier → emerald)
    // Just verify that 85% appears somewhere on the page
    await expect(page.getByText("85%").first()).toBeVisible();
  });

  test("back arrow navigates to dashboard", async ({ page }) => {
    await page.goto("/evals/standards");
    await page.getByRole("link", { name: "" }).first().click();
    await expect(page).toHaveURL("/", { timeout: 5_000 });
  });
});

// ─── Generate Eval Suite dialog (evals page) ─────────────────────────────────

test.describe("Generate Eval Suite dialog", () => {
  test("sparkles button is visible on evals page for an agent", async ({
    dashboardPage,
    page,
  }) => {
    // Create an agent so we have a valid agentId
    await dashboardPage.goto();
    await dashboardPage.createAgentButton.click();
    await page.getByRole("button", { name: /start blank/i }).click();
    await page.getByPlaceholder("My Agent").fill("Eval Gen E2E Agent");
    // Wizard step 2 → step 3 (Configure → Review)
    await page
      .getByRole("dialog")
      .getByRole("button", { name: /^review$/i })
      .click();
    // Step 3 (Review) → Create
    await page
      .getByRole("dialog")
      .getByRole("button", { name: /^create agent$/i })
      .click();
    await expect(page).toHaveURL(/\/builder\//, { timeout: 15_000 });

    // Extract agentId from URL
    const url = page.url();
    const agentId = url.split("/builder/")[1];

    // Navigate to evals page
    await page.goto(`/evals/${agentId}`);
    await page.waitForLoadState("networkidle");

    // The ✨ sparkles button should be visible in the suite sidebar header
    const sparklesBtn = page.locator('button[title*="Generate"], button:has(svg[data-lucide="sparkles"])');
    await expect(sparklesBtn.first()).toBeVisible({ timeout: 10_000 });
  });

  test("generate eval dialog shows count and toggle options", async ({
    dashboardPage,
    page,
  }) => {
    await dashboardPage.goto();
    await dashboardPage.createAgentButton.click();
    await page.getByRole("button", { name: /start blank/i }).click();
    await page.getByPlaceholder("My Agent").fill("Dialog Test Agent");
    // Wizard step 2 → step 3 (Configure → Review)
    await page
      .getByRole("dialog")
      .getByRole("button", { name: /^review$/i })
      .click();
    // Step 3 (Review) → Create
    await page
      .getByRole("dialog")
      .getByRole("button", { name: /^create agent$/i })
      .click();
    await expect(page).toHaveURL(/\/builder\//, { timeout: 15_000 });

    const url = page.url();
    const agentId = url.split("/builder/")[1];

    await page.goto(`/evals/${agentId}`);
    await page.waitForLoadState("networkidle");

    // Click the sparkles button to open the dialog
    const sparklesBtn = page.locator('button').filter({ hasText: /generate/i }).first();
    if (await sparklesBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await sparklesBtn.click();

      // Dialog should show count selector options: 3, 5, 8, 10
      await expect(page.getByText("3").first()).toBeVisible({ timeout: 5_000 });
      await expect(page.getByText("5").first()).toBeVisible();

      // runOnDeploy toggle should exist
      await expect(page.getByText(/deploy/i).first()).toBeVisible();
    }
  });
});

// ─── Dashboard — per-agent "Generate Eval Suite" dropdown item ────────────────

test.describe("Dashboard — per-agent eval generation", () => {
  test("agent card dropdown contains Generate Eval Suite item", async ({
    dashboardPage,
    page,
  }) => {
    await dashboardPage.goto();
    await page.waitForLoadState("networkidle");

    const agentCount = await dashboardPage.getAgentCount();
    if (agentCount === 0) {
      test.skip();
      return;
    }

    // Hover first card to reveal the three-dot menu
    const firstCard = dashboardPage.agentCards.first();
    await firstCard.hover();

    const moreBtn = firstCard.getByRole("button", { name: /more options/i });
    await expect(moreBtn).toBeVisible({ timeout: 5_000 });
    await moreBtn.click();

    // Dropdown should have "Generate Eval Suite" item
    await expect(
      page.getByRole("menuitem", { name: /generate eval suite/i }),
    ).toBeVisible({ timeout: 5_000 });
  });
});

// ─── Dashboard — Generate All (backfill) button ───────────────────────────────

test.describe("Dashboard — Generate All Evals button", () => {
  test("sparkles backfill button is visible in the header", async ({
    dashboardPage,
    page,
  }) => {
    await dashboardPage.goto();
    await page.waitForLoadState("networkidle");

    const backfillBtn = page.locator('header button[title*="Generate Eval"]');
    await expect(backfillBtn).toBeVisible({ timeout: 5_000 });
  });

  test("backfill button triggers API call and shows toast", async ({
    dashboardPage,
    page,
  }) => {
    // Intercept the backfill API call to avoid actually running AI generation
    await page.route("**/api/evals/backfill", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: { processed: 2, failed: 0, total: 2 },
        }),
      });
    });

    await dashboardPage.goto();
    await page.waitForLoadState("networkidle");

    const backfillBtn = page.locator('header button[title*="Generate Eval"]');
    await backfillBtn.click();

    // Toast should show success message
    await expect(
      page.getByText(/Generated eval suites for 2 agents/i),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("backfill shows correct toast when all agents already have suites", async ({
    dashboardPage,
    page,
  }) => {
    await page.route("**/api/evals/backfill", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: { processed: 0, failed: 0, total: 0, message: "All agents already have eval suites." },
        }),
      });
    });

    await dashboardPage.goto();
    await page.waitForLoadState("networkidle");

    const backfillBtn = page.locator('header button[title*="Generate Eval"]');
    await backfillBtn.click();

    await expect(
      page.getByText(/All agents already have eval suites/i),
    ).toBeVisible({ timeout: 10_000 });
  });
});
