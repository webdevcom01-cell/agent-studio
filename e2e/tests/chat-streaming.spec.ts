import { test, expect } from "../fixtures/base";
import { mockChatAPI } from "../mocks/handlers";

test.describe("Chat — Streaming", () => {
  test("chat page loads with agent name", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const count = await page.getByTestId("agent-card").count();
    if (count === 0) {
      test.skip();
      return;
    }

    const agentCard = page.getByTestId("agent-card").first();
    await agentCard.getByRole("link", { name: /chat/i }).click();
    await expect(page).toHaveURL(/\/chat\//);

    // Chat input should be visible
    await expect(page.getByTestId("chat-input")).toBeVisible();
    await expect(page.getByTestId("chat-send-btn")).toBeVisible();
  });

  test("send a message and receive streaming response", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const count = await page.getByTestId("agent-card").count();
    if (count === 0) {
      test.skip();
      return;
    }

    // Get agent ID from card link
    const chatLink = page
      .getByTestId("agent-card")
      .first()
      .getByRole("link", { name: /chat/i });
    const href = await chatLink.getAttribute("href");
    const agentId = href?.split("/chat/")[1];
    if (!agentId) {
      test.skip();
      return;
    }

    // Navigate to chat
    await page.goto(`/chat/${agentId}`);
    await page.waitForLoadState("networkidle");

    // Mock the internal chat API (client-side fetch to Next.js server).
    // page.route() only intercepts browser-originated requests.
    // Server-to-provider calls (DeepSeek/OpenAI) cannot be intercepted this way.
    await mockChatAPI(page, {
      agentId,
      content: "Hello! I am a test assistant. How can I help you today?",
    });

    // Type and send
    const input = page.getByTestId("chat-input");
    await input.fill("Hello!");
    await page.getByTestId("chat-send-btn").click();

    // User message should appear
    await expect(page.getByTestId("chat-message-user").first()).toBeVisible({
      timeout: 5_000,
    });

    // Wait for assistant response
    await expect(
      page.getByTestId("chat-message-assistant").first()
    ).toBeVisible({ timeout: 30_000 });
  });

  test("reset chat clears messages", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const count = await page.getByTestId("agent-card").count();
    if (count === 0) {
      test.skip();
      return;
    }

    const chatLink = page
      .getByTestId("agent-card")
      .first()
      .getByRole("link", { name: /chat/i });
    const href = await chatLink.getAttribute("href");
    const agentId = href?.split("/chat/")[1];
    if (!agentId) {
      test.skip();
      return;
    }

    await page.goto(`/chat/${agentId}`);
    await page.waitForLoadState("networkidle");

    await mockChatAPI(page, { agentId, content: "Test response" });

    // Send a message
    const input = page.getByTestId("chat-input");
    await input.fill("Hello");
    await page.getByTestId("chat-send-btn").click();

    // Wait for response
    await expect(
      page.getByTestId("chat-message-assistant").first()
    ).toBeVisible({ timeout: 30_000 });

    // Reset — button text is "New Chat" (see chat page source)
    await page.getByRole("button", { name: /new chat/i }).click();

    // Messages should be cleared
    await expect(page.getByTestId("chat-message-user")).toHaveCount(0, {
      timeout: 5_000,
    });
  });
});
