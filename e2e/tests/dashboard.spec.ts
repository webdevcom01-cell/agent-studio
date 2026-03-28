import { test, expect } from "../fixtures/base";

test.describe("Dashboard — Agent Management", () => {
  test("displays the dashboard with agent list", async ({ dashboardPage }) => {
    await dashboardPage.goto();
    await expect(dashboardPage.heading).toBeVisible();
    await expect(dashboardPage.createAgentButton).toBeVisible();
  });

  test("create a new blank agent", async ({ dashboardPage, page }) => {
    await dashboardPage.goto();

    // Click New Agent
    await dashboardPage.createAgentButton.click();

    // Switch to Blank Agent tab
    await page.getByRole("button", { name: /start blank/i }).click();

    // Fill in name and description using placeholder selectors
    // (Label has no htmlFor, Input has no id, so getByLabel won't work)
    await page.getByPlaceholder("My Agent").fill("E2E Test Agent");
    await page
      .getByPlaceholder(/what does this agent/i)
      .fill("Created by Playwright E2E");

    // Wizard has 3 steps: Choose → Configure → Review
    // Step 2 (Configure) shows "Review" button to advance to step 3
    await page
      .getByRole("dialog")
      .getByRole("button", { name: /^review$/i })
      .click();

    // Step 3 (Review) shows "Create Agent" button to submit
    await page
      .getByRole("dialog")
      .getByRole("button", { name: /^create agent$/i })
      .click();

    // Should navigate to builder
    await expect(page).toHaveURL(/\/builder\//, { timeout: 15_000 });
  });

  test("shows agent cards with correct information", async ({
    dashboardPage,
  }) => {
    await dashboardPage.goto();

    const count = await dashboardPage.getAgentCount();
    if (count > 0) {
      const firstCard = dashboardPage.agentCards.first();
      await expect(
        firstCard.getByRole("link", { name: /edit flow/i })
      ).toBeVisible();
      await expect(
        firstCard.getByRole("link", { name: /chat/i })
      ).toBeVisible();
    }
  });

  test("navigate to builder from agent card", async ({
    dashboardPage,
    page,
  }) => {
    await dashboardPage.goto();

    const count = await dashboardPage.getAgentCount();
    if (count === 0) {
      test.skip();
      return;
    }

    const firstCard = dashboardPage.agentCards.first();
    await firstCard.getByRole("link", { name: /edit flow/i }).click();
    await expect(page).toHaveURL(/\/builder\//);
  });

  test("navigate to chat from agent card", async ({
    dashboardPage,
    page,
  }) => {
    await dashboardPage.goto();

    const count = await dashboardPage.getAgentCount();
    if (count === 0) {
      test.skip();
      return;
    }

    const firstCard = dashboardPage.agentCards.first();
    await firstCard.getByRole("link", { name: /chat/i }).click();
    await expect(page).toHaveURL(/\/chat\//);
  });
});
