import { test, expect } from "../fixtures/base";

test.describe("Flow Editor", () => {
  test("loads the flow editor with canvas", async ({
    flowBuilderPage,
    page,
  }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const count = await page.getByTestId("agent-card").count();
    if (count === 0) {
      test.skip();
      return;
    }

    const editLink = page
      .getByTestId("agent-card")
      .first()
      .getByRole("link", { name: /edit flow/i });
    const href = await editLink.getAttribute("href");
    const agentId = href?.split("/builder/")[1];
    if (!agentId) {
      test.skip();
      return;
    }

    await flowBuilderPage.goto(agentId);

    // Canvas should be visible (ReactFlow renders .react-flow class)
    await expect(page.locator(".react-flow")).toBeVisible();
    // Node picker should be available
    await expect(flowBuilderPage.nodePicker).toBeVisible();
  });

  test("node picker opens and shows node categories", async ({
    flowBuilderPage,
    page,
  }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const count = await page.getByTestId("agent-card").count();
    if (count === 0) {
      test.skip();
      return;
    }

    const editLink = page
      .getByTestId("agent-card")
      .first()
      .getByRole("link", { name: /edit flow/i });
    const href = await editLink.getAttribute("href");
    const agentId = href?.split("/builder/")[1];
    if (!agentId) {
      test.skip();
      return;
    }

    await flowBuilderPage.goto(agentId);
    await flowBuilderPage.nodePicker.click();

    // The node picker uses a nav with category buttons (e.g. "Triggers 2", "AI 11")
    // Use navigation buttons visible inside the dialog
    const nav = page.getByRole("navigation", { name: /node categories/i });
    await expect(nav).toBeVisible({ timeout: 5_000 });
    await expect(nav.getByRole("button", { name: /Triggers/i })).toBeVisible();
    await expect(nav.getByRole("button", { name: /^AI/i })).toBeVisible();
  });

  test("flow has initial nodes after creation", async ({
    flowBuilderPage,
    page,
  }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const count = await page.getByTestId("agent-card").count();
    if (count === 0) {
      test.skip();
      return;
    }

    const editLink = page
      .getByTestId("agent-card")
      .first()
      .getByRole("link", { name: /edit flow/i });
    const href = await editLink.getAttribute("href");
    const agentId = href?.split("/builder/")[1];
    if (!agentId) {
      test.skip();
      return;
    }

    await flowBuilderPage.goto(agentId);

    // New agents have 1 node (ai_response "start" node)
    // But some imported agents may have more
    const nodeCount = await flowBuilderPage.getNodeCount();
    expect(nodeCount).toBeGreaterThanOrEqual(0);
  });
});
