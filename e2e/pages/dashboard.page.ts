import { type Page, type Locator } from "@playwright/test";

/**
 * Dashboard page POM — `/`
 * Handles agent CRUD, import/export, and navigation to sub-pages.
 */
export class DashboardPage {
  readonly heading: Locator;
  readonly createAgentButton: Locator;
  readonly importAgentButton: Locator;
  readonly agentCards: Locator;
  readonly mcpServersButton: Locator;

  constructor(private page: Page) {
    this.heading = page.getByRole("heading", { name: /my agents|agents/i });
    this.createAgentButton = page.getByTestId("create-agent-btn");
    this.importAgentButton = page.getByTestId("import-agent-btn");
    this.agentCards = page.getByTestId("agent-card");
    this.mcpServersButton = page.getByRole("button", {
      name: /mcp servers/i,
    });
  }

  async goto() {
    await this.page.goto("/");
    await this.page.waitForLoadState("networkidle");
  }

  async createAgent(name: string, description?: string) {
    await this.createAgentButton.click();

    // Fill in the create agent dialog
    await this.page.getByLabel(/name/i).fill(name);
    if (description) {
      await this.page.getByLabel(/description/i).fill(description);
    }

    // Submit — click the confirm button inside dialog
    await this.page
      .getByRole("dialog")
      .getByRole("button", { name: /create/i })
      .click();

    // Wait for the agent to appear in the list
    await this.page.waitForResponse(
      (res) => res.url().includes("/api/agents") && res.status() === 200
    );
  }

  async getAgentCount(): Promise<number> {
    return this.agentCards.count();
  }

  async getAgentCardByName(name: string): Promise<Locator> {
    return this.agentCards.filter({ hasText: name });
  }

  async deleteAgent(name: string) {
    const card = this.agentCards.filter({ hasText: name });

    // Open the dropdown menu on the card
    await card.getByRole("button", { name: /more|options|menu/i }).click();
    await this.page.getByRole("menuitem", { name: /delete/i }).click();

    // Confirm deletion dialog
    await this.page
      .getByRole("dialog")
      .getByRole("button", { name: /delete|confirm/i })
      .click();
  }

  async navigateToBuilder(name: string) {
    const card = this.agentCards.filter({ hasText: name });
    await card.getByRole("link", { name: /edit|builder|build/i }).click();
    await this.page.waitForURL(/\/builder\//);
  }

  async navigateToChat(name: string) {
    const card = this.agentCards.filter({ hasText: name });
    await card.getByRole("link", { name: /chat|test/i }).click();
    await this.page.waitForURL(/\/chat\//);
  }

  async navigateToKnowledge(name: string) {
    const card = this.agentCards.filter({ hasText: name });
    await card.getByRole("link", { name: /knowledge/i }).click();
    await this.page.waitForURL(/\/knowledge\//);
  }

  async importAgent(filePath: string) {
    await this.importAgentButton.click();

    // Handle file upload in the dialog
    const fileInput = this.page.getByTestId("import-file-input");
    await fileInput.setInputFiles(filePath);

    await this.page
      .getByRole("dialog")
      .getByRole("button", { name: /import/i })
      .click();

    await this.page.waitForResponse(
      (res) =>
        res.url().includes("/api/agents/import") && res.status() === 200
    );
  }
}
