import { test, expect } from "../fixtures/base";
import { mockEmbeddings } from "../mocks/handlers";

test.describe("Knowledge Base", () => {
  test.beforeEach(async ({ page }) => {
    await mockEmbeddings(page);
  });

  test("knowledge base page loads with sources tab", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const count = await page.getByTestId("agent-card").count();
    if (count === 0) {
      test.skip();
      return;
    }

    const firstCard = page.getByTestId("agent-card").first();
    const editLink = firstCard.getByRole("link", { name: /edit flow/i });
    const href = await editLink.getAttribute("href");
    const agentId = href?.split("/builder/")[1];
    if (!agentId) {
      test.skip();
      return;
    }

    await page.goto(`/knowledge/${agentId}`);
    await page.waitForLoadState("networkidle");

    await expect(
      page.getByRole("heading", { name: /knowledge base/i })
    ).toBeVisible();
    await expect(page.getByTestId("kb-add-source")).toBeVisible();
  });

  test("add text source to knowledge base", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const count = await page.getByTestId("agent-card").count();
    if (count === 0) {
      test.skip();
      return;
    }

    const firstCard = page.getByTestId("agent-card").first();
    const editLink = firstCard.getByRole("link", { name: /edit flow/i });
    const href = await editLink.getAttribute("href");
    const agentId = href?.split("/builder/")[1];
    if (!agentId) {
      test.skip();
      return;
    }

    await page.goto(`/knowledge/${agentId}`);
    await page.waitForLoadState("networkidle");

    // Click "Add Source" button
    await page.getByTestId("kb-add-source").click();

    // Switch to text tab (tab value="TEXT", text includes "Text")
    await page.getByRole("tab", { name: /text/i }).click();

    // Fill in the form — Label has no htmlFor, so use placeholders
    // TEXT tab Name input has placeholder "e.g. Product Info"
    await page
      .getByPlaceholder("e.g. Product Info")
      .fill("E2E Test Source");

    // TEXT tab Content textarea has placeholder "Paste your text content here..."
    await page
      .getByPlaceholder(/paste your text/i)
      .fill("This is test content for the knowledge base.");

    // Click "Add Source" button inside dialog footer
    await page
      .getByRole("dialog")
      .getByRole("button", { name: /add source/i })
      .click();

    // Source should appear in the list (with longer timeout for processing)
    await expect(
      page
        .getByTestId("kb-source-item")
        .filter({ hasText: /e2e test source/i })
    ).toBeVisible({ timeout: 15_000 });
  });

  test("search tab is available and functional", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const count = await page.getByTestId("agent-card").count();
    if (count === 0) {
      test.skip();
      return;
    }

    const firstCard = page.getByTestId("agent-card").first();
    const editLink = firstCard.getByRole("link", { name: /edit flow/i });
    const href = await editLink.getAttribute("href");
    const agentId = href?.split("/builder/")[1];
    if (!agentId) {
      test.skip();
      return;
    }

    await page.goto(`/knowledge/${agentId}`);
    await page.waitForLoadState("networkidle");

    // Switch to search tab
    await page.getByRole("tab", { name: /search/i }).click();

    await expect(page.getByTestId("kb-search-input")).toBeVisible();
    await expect(page.getByTestId("kb-search-btn")).toBeVisible();
  });
});
