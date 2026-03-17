import { type Page, type Locator } from "@playwright/test";

/**
 * Webhooks management page POM — `/webhooks/[agentId]`
 *
 * Covers the two-panel layout:
 *   - Left sidebar: webhook list + "New Webhook" button
 *   - Right detail panel: trigger URL, secret, tabs (Executions / Configuration / Test)
 *
 * Since this page has no data-testid attributes we rely on roles, labels,
 * and stable text tokens — matching the project's existing POM conventions.
 */
export class WebhooksPage {
  // ── Top bar ─────────────────────────────────────────────────────────────────
  readonly heading: Locator;
  readonly newWebhookButton: Locator;
  readonly backLink: Locator;

  // ── Sidebar ──────────────────────────────────────────────────────────────────
  readonly webhookListItems: Locator;
  readonly emptyState: Locator;

  // ── Detail panel — header ────────────────────────────────────────────────────
  readonly enableToggle: Locator;
  readonly moreOptionsButton: Locator;

  // ── Detail panel — URL / secret strip ───────────────────────────────────────
  readonly triggerUrlDisplay: Locator;
  readonly copyUrlButton: Locator;
  readonly showSecretButton: Locator;
  readonly secretDisplay: Locator;

  // ── Detail panel — tabs ──────────────────────────────────────────────────────
  readonly tabExecutions: Locator;
  readonly tabConfig: Locator;
  readonly tabTest: Locator;

  // ── Configuration tab ────────────────────────────────────────────────────────
  readonly applyPresetButton: Locator;
  readonly eventFilterInput: Locator;
  readonly saveConfigButton: Locator;

  // ── Test tab ─────────────────────────────────────────────────────────────────
  readonly payloadTextarea: Locator;
  readonly eventTypeInput: Locator;
  readonly sendTestButton: Locator;
  readonly testResult: Locator;

  // ── Create dialog ────────────────────────────────────────────────────────────
  readonly createDialog: Locator;
  readonly createNameInput: Locator;
  readonly createDescriptionInput: Locator;
  readonly createConfirmButton: Locator;

  constructor(private page: Page) {
    // Top bar
    this.heading = page.getByRole("heading", { name: /webhooks/i });
    this.newWebhookButton = page.getByRole("button", { name: /new webhook/i });
    this.backLink = page.getByRole("link", { name: /back to builder/i });

    // Sidebar
    this.webhookListItems = page.locator('[class*="rounded-lg"][class*="px-3"][class*="py-2"]').filter({ hasText: /trigger/i }).or(
      // Primary selector: button elements inside the sidebar list
      page.locator("aside button, [class*='overflow-y-auto'] button[type='button']").filter({ hasText: /\d+ trigger/ })
    );
    // Use a simpler selector: buttons in the sidebar that show trigger counts
    this.emptyState = page.getByText(/no webhooks yet/i);

    // Detail panel — header actions
    this.enableToggle = page.locator("button[title*='webhook'], button[title*='Enable'], button[title*='Disable']").first();
    this.moreOptionsButton = page.locator("button").filter({ has: page.locator("svg") }).filter({ hasText: "" }).nth(-1);

    // URL / secret strip
    this.triggerUrlDisplay = page.locator("code").filter({ hasText: /\/api\/agents\// }).first();
    this.copyUrlButton = page.locator("button").filter({ hasText: /^Copy$/ }).first();
    this.showSecretButton = page.getByRole("button", { name: /^(show|hide)$/i });
    this.secretDisplay = page.locator("code").filter({ hasText: /[•]{10}|[A-Za-z0-9_-]{40,}/ }).first();

    // Tabs
    this.tabExecutions = page.getByRole("button", { name: /executions/i }).or(
      page.locator("button[type='button']").filter({ hasText: /executions/i })
    );
    this.tabConfig = page.getByRole("button", { name: /configuration/i }).or(
      page.locator("button[type='button']").filter({ hasText: /^configuration$/i })
    );
    this.tabTest = page.getByRole("button", { name: /^test$/i }).or(
      page.locator("button[type='button']").filter({ hasText: /^test$/i })
    );

    // Configuration tab
    this.applyPresetButton = page.getByRole("button", { name: /apply preset/i });
    this.eventFilterInput = page.getByPlaceholder(/e\.g\. push, payment_intent/i);
    this.saveConfigButton = page.getByRole("button", { name: /save configuration/i });

    // Test tab
    this.payloadTextarea = page.locator("textarea").filter({ hasText: /"event"/ }).or(
      page.locator("textarea").first()
    );
    this.eventTypeInput = page.getByPlaceholder(/e\.g\. push, pull_request/i);
    this.sendTestButton = page.getByRole("button", { name: /send test request/i });
    this.testResult = page.locator("[class*='rounded-md'][class*='border']").filter({
      hasText: /HTTP \d+/,
    });

    // Create dialog
    this.createDialog = page.getByRole("dialog");
    this.createNameInput = page.getByRole("dialog").getByPlaceholder(/e\.g\. GitHub Events/i);
    this.createDescriptionInput = page.getByRole("dialog").getByPlaceholder(/what events does/i);
    this.createConfirmButton = page.getByRole("dialog").getByRole("button", { name: /^create$/i });
  }

  /** Navigate to the webhooks management page for a given agent. */
  async goto(agentId: string) {
    await this.page.goto(`/webhooks/${agentId}`);
    await this.page.waitForLoadState("networkidle");
  }

  /**
   * Return all webhook list item buttons in the sidebar.
   * We cannot rely on testids so we match the sidebar buttons by their
   * unique trigger-count text pattern (e.g. "0 triggers").
   */
  get sidebarButtons(): Locator {
    return this.page
      .locator("[class*='overflow-y-auto'] button[type='button']")
      .filter({ hasText: /\d+ trigger/ });
  }

  /** Return the count of webhooks shown in the sidebar. */
  async getWebhookCount(): Promise<number> {
    return this.sidebarButtons.count();
  }

  /** Click on a webhook in the sidebar by its name. */
  async selectWebhook(name: string) {
    await this.page
      .locator("button[type='button']")
      .filter({ hasText: name })
      .first()
      .click();
    // Wait for detail panel to load
    await this.page
      .getByText(/Trigger URL/i)
      .waitFor({ state: "visible", timeout: 10_000 });
  }

  /**
   * Create a new webhook via the dialog.
   * Optionally supply a description.
   */
  async createWebhook(name: string, description?: string) {
    await this.newWebhookButton.click();
    await this.createDialog.waitFor({ state: "visible", timeout: 5_000 });

    await this.createNameInput.fill(name);
    if (description) {
      await this.createDescriptionInput.fill(description);
    }
    await this.createConfirmButton.click();

    // Wait for the webhook to appear in the sidebar
    await this.page
      .waitForResponse(
        (res) => res.url().includes("/webhooks") && res.request().method() === "POST",
        { timeout: 10_000 }
      );
  }

  /**
   * Create a new webhook with a given preset selected.
   * @param presetName - Display name of the preset (e.g. "GitHub")
   */
  async createWebhookWithPreset(webhookName: string, presetName: string) {
    await this.newWebhookButton.click();
    await this.createDialog.waitFor({ state: "visible", timeout: 5_000 });

    await this.createNameInput.fill(webhookName);

    // Click the preset button inside the dialog grid
    await this.page
      .getByRole("dialog")
      .locator("button")
      .filter({ hasText: new RegExp(presetName, "i") })
      .first()
      .click();

    await this.createConfirmButton.click();
    await this.page.waitForResponse(
      (res) => res.url().includes("/webhooks") && res.request().method() === "POST",
      { timeout: 10_000 }
    );
  }

  /** Switch to the Configuration tab in the detail panel. */
  async openConfigTab() {
    await this.page
      .locator("button[type='button']")
      .filter({ hasText: /^configuration$/i })
      .first()
      .click();
    await this.applyPresetButton.waitFor({ state: "visible", timeout: 5_000 });
  }

  /** Switch to the Test tab in the detail panel. */
  async openTestTab() {
    await this.page
      .locator("button[type='button']")
      .filter({ hasText: /^test$/i })
      .first()
      .click();
    await this.sendTestButton.waitFor({ state: "visible", timeout: 5_000 });
  }

  /** Apply a preset from the Configuration tab. */
  async applyPreset(presetName: string) {
    await this.applyPresetButton.click();
    // Wait for preset picker dialog
    await this.page.getByText("Apply Provider Preset").waitFor({ state: "visible", timeout: 5_000 });
    await this.page
      .getByRole("dialog")
      .locator("button")
      .filter({ hasText: new RegExp(presetName, "i") })
      .first()
      .click();
    // Dialog closes, config is now dirty
    await this.page.getByText("Apply Provider Preset").waitFor({ state: "hidden", timeout: 3_000 });
  }

  /**
   * Add an event filter tag by typing in the filter input and pressing Enter.
   */
  async addEventFilter(value: string) {
    await this.eventFilterInput.fill(value);
    await this.eventFilterInput.press("Enter");
  }

  /**
   * Remove an event filter tag by clicking its × button.
   */
  async removeEventFilter(value: string) {
    await this.page.getByRole("button", { name: `Remove ${value}` }).click();
  }

  /** Click "Save Configuration" and wait for the PATCH response. */
  async saveConfiguration() {
    await this.saveConfigButton.click();
    await this.page.waitForResponse(
      (res) => res.url().includes("/webhooks/") && res.request().method() === "PATCH",
      { timeout: 10_000 }
    );
  }

  /**
   * Toggle the webhook's enabled state via the toggle button in the detail header.
   */
  async toggleEnabled() {
    const toggle = this.page
      .locator("button[title]")
      .filter({ has: this.page.locator("span") })
      .first();
    await toggle.click();
    await this.page.waitForResponse(
      (res) => res.url().includes("/webhooks/") && res.request().method() === "PATCH",
      { timeout: 10_000 }
    );
  }

  /**
   * Rotate the webhook signing secret via the "⋮" dropdown.
   */
  async rotateSecret() {
    // Open the ⋮ dropdown in the detail header
    await this.page
      .locator("button")
      .filter({ has: this.page.locator('[class*="lucide-ellipsis-vertical"], [class*="more-vertical"]') })
      .or(
        this.page.locator('button[aria-label*="more"], button[aria-haspopup="menu"]').last()
      )
      .last()
      .click();

    await this.page.getByRole("menuitem", { name: /rotate secret/i }).click();
    await this.page.waitForResponse(
      (res) => res.url().includes("/rotate") && res.request().method() === "POST",
      { timeout: 10_000 }
    );
  }

  /**
   * Delete the currently selected webhook via the "⋮" dropdown + confirm dialog.
   */
  async deleteWebhook() {
    // Open dropdown
    await this.page
      .locator("button")
      .filter({ has: this.page.locator("svg") })
      .last()
      .click();

    await this.page.getByRole("menuitem", { name: /delete webhook/i }).click();

    // Confirm in the confirmation dialog
    await this.page
      .getByRole("dialog")
      .getByRole("button", { name: /delete webhook/i })
      .click();

    await this.page.waitForResponse(
      (res) => res.url().includes("/webhooks/") && res.request().method() === "DELETE",
      { timeout: 10_000 }
    );
  }

  /**
   * Show the signing secret in the detail panel.
   * After calling this, the secret is visible in the code element.
   */
  async revealSecret(): Promise<string> {
    const showBtn = this.page.getByRole("button", { name: /^show$/i });
    if (await showBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await showBtn.click();
    }
    // Wait for the actual secret characters (not bullets)
    const codeEl = this.page.locator("code").filter({ hasNot: this.page.locator("[class*='bullet']") }).nth(1);
    await codeEl.waitFor({ state: "visible", timeout: 3_000 });
    return codeEl.textContent().then((t) => t?.trim() ?? "");
  }
}
