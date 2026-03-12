import { type Page, type Locator } from "@playwright/test";

/**
 * Chat page POM — `/chat/[agentId]`
 * Handles message sending, streaming response verification,
 * and conversation management.
 */
export class ChatPage {
  readonly messageInput: Locator;
  readonly sendButton: Locator;
  readonly messages: Locator;
  readonly assistantMessages: Locator;
  readonly userMessages: Locator;
  readonly resetButton: Locator;
  readonly loadingIndicator: Locator;

  constructor(private page: Page) {
    this.messageInput = page.getByTestId("chat-input");
    this.sendButton = page.getByTestId("chat-send-btn");
    this.messages = page.getByTestId("chat-message");
    this.assistantMessages = page.getByTestId("chat-message-assistant");
    this.userMessages = page.getByTestId("chat-message-user");
    this.resetButton = page.getByRole("button", { name: /reset|new chat/i });
    this.loadingIndicator = page.getByTestId("chat-loading");
  }

  async goto(agentId: string) {
    await this.page.goto(`/chat/${agentId}`);
    await this.page.waitForLoadState("networkidle");
  }

  async sendMessage(text: string) {
    await this.messageInput.fill(text);
    await this.sendButton.click();
  }

  /**
   * Send a message and wait for the streaming response to complete.
   * Returns the text content of the last assistant message.
   */
  async sendMessageAndWaitForResponse(text: string): Promise<string> {
    await this.sendMessage(text);

    // Wait for loading to appear then disappear (stream complete)
    await this.loadingIndicator.waitFor({ state: "visible", timeout: 5000 }).catch(() => {
      // Loading might be too fast to catch — that's OK
    });
    await this.loadingIndicator.waitFor({ state: "hidden", timeout: 30_000 });

    // Get the last assistant message
    const lastAssistant = this.assistantMessages.last();
    await lastAssistant.waitFor({ state: "visible" });
    return (await lastAssistant.textContent()) ?? "";
  }

  async getMessageCount(): Promise<number> {
    return this.messages.count();
  }

  async getLastAssistantMessage(): Promise<string> {
    const last = this.assistantMessages.last();
    return (await last.textContent()) ?? "";
  }

  async resetChat() {
    await this.resetButton.click();
  }
}
