import { type Page, type Locator } from "@playwright/test";

/**
 * Knowledge Base page POM — `/knowledge/[agentId]`
 * Handles source management (URL, Text, File), search testing,
 * and status monitoring.
 */
export class KnowledgePage {
  readonly addSourceButton: Locator;
  readonly sourceList: Locator;
  readonly sourceItems: Locator;
  readonly searchInput: Locator;
  readonly searchButton: Locator;
  readonly searchResults: Locator;

  constructor(private page: Page) {
    this.addSourceButton = page.getByTestId("kb-add-source");
    this.sourceList = page.getByTestId("kb-source-list");
    this.sourceItems = page.getByTestId("kb-source-item");
    this.searchInput = page.getByTestId("kb-search-input");
    this.searchButton = page.getByTestId("kb-search-btn");
    this.searchResults = page.getByTestId("kb-search-result");
  }

  async goto(agentId: string) {
    await this.page.goto(`/knowledge/${agentId}`);
    await this.page.waitForLoadState("networkidle");
  }

  /**
   * Add a text source to the knowledge base.
   */
  async addTextSource(title: string, content: string) {
    await this.addSourceButton.click();

    // Switch to Text tab in the dialog
    await this.page.getByRole("tab", { name: /text/i }).click();
    await this.page.getByLabel(/title|name/i).fill(title);
    await this.page.getByLabel(/content|text/i).fill(content);
    await this.page
      .getByRole("dialog")
      .getByRole("button", { name: /add|create|save/i })
      .click();

    // Wait for source creation API response
    await this.page.waitForResponse(
      (res) =>
        res.url().includes("/knowledge/sources") && res.status() === 200
    );
  }

  /**
   * Add a URL source to the knowledge base.
   */
  async addUrlSource(url: string) {
    await this.addSourceButton.click();

    // URL tab should be default
    await this.page.getByLabel(/url/i).fill(url);
    await this.page
      .getByRole("dialog")
      .getByRole("button", { name: /add|create|save/i })
      .click();

    await this.page.waitForResponse(
      (res) =>
        res.url().includes("/knowledge/sources") && res.status() === 200
    );
  }

  /**
   * Wait for a source to reach READY status.
   * Polls the source list until the status changes.
   */
  async waitForSourceReady(sourceName: string, timeoutMs = 30_000) {
    const source = this.sourceItems.filter({ hasText: sourceName });
    await source
      .getByText(/ready/i)
      .waitFor({ state: "visible", timeout: timeoutMs });
  }

  /**
   * Delete a source by name.
   */
  async deleteSource(sourceName: string) {
    const source = this.sourceItems.filter({ hasText: sourceName });
    await source.getByRole("button", { name: /delete|remove/i }).click();

    // Confirm deletion
    await this.page
      .getByRole("dialog")
      .getByRole("button", { name: /delete|confirm/i })
      .click();
  }

  /**
   * Perform a hybrid search and return the number of results.
   */
  async search(query: string): Promise<number> {
    await this.searchInput.fill(query);
    await this.searchButton.click();

    // Wait for search response
    await this.page.waitForResponse(
      (res) =>
        res.url().includes("/knowledge/search") && res.status() === 200
    );

    return this.searchResults.count();
  }

  async getSourceCount(): Promise<number> {
    return this.sourceItems.count();
  }
}
