/**
 * E2E tests — Inbound Webhooks
 *
 * Covers:
 *   1. Webhooks UI — navigation, empty state, create dialog, list, detail panel
 *   2. Webhooks UI — Configuration tab (presets, event filters, save)
 *   3. Webhooks UI — Test tab (payload, event type, filter warning)
 *   4. Webhooks UI — Detail actions (enable/disable, rotate secret, delete)
 *   5. Webhooks API — CRUD (create, list, get, patch, delete, rotate)
 *   6. Webhooks API — Trigger endpoint (valid HMAC → 200, invalid HMAC → 400,
 *                      filtered event → skipped)
 *   7. Flow Builder integration — "Webhooks" button + webhook_trigger node
 *
 * UI tests use page.route() mocks so they never hit a live AI or DB.
 * API tests use the `request` fixture and require a running backend with DB.
 */

import { createHmac } from "crypto";
import { test, expect } from "../fixtures/base";
import {
  mockWebhooksAPI,
  mockWebhookTrigger,
  MOCK_WEBHOOK,
  MOCK_WEBHOOK_WITH_FILTERS,
} from "../mocks/handlers";

// ─── helpers ─────────────────────────────────────────────────────────────────

/**
 * Create a fresh agent via the dashboard UI and return its ID.
 * The caller is responsible for cleanup.
 */
async function createTestAgent(
  dashboardPage: import("../pages/dashboard.page").DashboardPage,
  page: import("@playwright/test").Page,
  name: string
): Promise<string> {
  await dashboardPage.goto();
  await dashboardPage.createAgentButton.click();
  await page.getByRole("tab", { name: /blank/i }).click();
  await page.getByPlaceholder("My Agent").fill(name);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /^create$/i })
    .click();
  await expect(page).toHaveURL(/\/builder\//, { timeout: 15_000 });
  const url = page.url();
  return url.split("/builder/")[1];
}

/**
 * Generate a valid Standard Webhooks HMAC-SHA256 signature string.
 * Returns the full value for the x-webhook-signature header: "v1,<base64>".
 */
function signWebhook(
  webhookId: string,
  timestamp: string,
  rawBody: string,
  secret: string
): string {
  const toSign = `${webhookId}.${timestamp}.${rawBody}`;
  const sig = createHmac("sha256", secret).update(toSign).digest("base64");
  return `v1,${sig}`;
}

// ─── 1. Webhooks UI — navigation & page structure ────────────────────────────

test.describe("Webhooks UI — page structure", () => {
  test("renders the page heading and New Webhook button", async ({
    dashboardPage,
    webhooksPage,
    page,
  }) => {
    const agentId = await createTestAgent(dashboardPage, page, "Webhooks UI Agent");

    // Mock the webhooks list so it returns our mock data
    await mockWebhooksAPI(page, { agentId });

    await webhooksPage.goto(agentId);

    await expect(page.getByText(/^webhooks$/i, { exact: false })).toBeVisible({
      timeout: 10_000,
    });
    await expect(webhooksPage.newWebhookButton).toBeVisible();
  });

  test("shows empty state when agent has no webhooks", async ({
    dashboardPage,
    webhooksPage,
    page,
  }) => {
    const agentId = await createTestAgent(dashboardPage, page, "Empty Webhooks Agent");

    await mockWebhooksAPI(page, { agentId, returnEmpty: true });

    await webhooksPage.goto(agentId);

    await expect(webhooksPage.emptyState).toBeVisible({ timeout: 10_000 });
    // Empty state should contain a call-to-action
    await expect(
      page.getByRole("button", { name: /create webhook/i })
    ).toBeVisible();
  });

  test("renders webhook items in the sidebar when webhooks exist", async ({
    dashboardPage,
    webhooksPage,
    page,
  }) => {
    const agentId = await createTestAgent(dashboardPage, page, "Sidebar Webhooks Agent");

    await mockWebhooksAPI(page, {
      agentId,
      webhooks: [MOCK_WEBHOOK, MOCK_WEBHOOK_WITH_FILTERS],
    });

    await webhooksPage.goto(agentId);
    await page.waitForLoadState("networkidle");

    // Both webhook names should be visible in the sidebar
    await expect(
      page.getByText(MOCK_WEBHOOK.name as string).first()
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByText(MOCK_WEBHOOK_WITH_FILTERS.name as string).first()
    ).toBeVisible();
  });

  test("shows filter count badge in sidebar for webhooks with event filters", async ({
    dashboardPage,
    webhooksPage,
    page,
  }) => {
    const agentId = await createTestAgent(dashboardPage, page, "Filter Badge Agent");

    await mockWebhooksAPI(page, {
      agentId,
      webhooks: [MOCK_WEBHOOK_WITH_FILTERS],
    });

    await webhooksPage.goto(agentId);
    await page.waitForLoadState("networkidle");

    // Should show "2 filters" badge since MOCK_WEBHOOK_WITH_FILTERS has 2 event filters
    await expect(
      page.getByText(/2 filter/i).first()
    ).toBeVisible({ timeout: 10_000 });
  });
});

// ─── 2. Webhooks UI — Create dialog ──────────────────────────────────────────

test.describe("Webhooks UI — create dialog", () => {
  test("create dialog opens with name and description fields", async ({
    dashboardPage,
    webhooksPage,
    page,
  }) => {
    const agentId = await createTestAgent(dashboardPage, page, "Create Dialog Agent");
    await mockWebhooksAPI(page, { agentId, returnEmpty: true });

    await webhooksPage.goto(agentId);
    await webhooksPage.newWebhookButton.click();

    await expect(webhooksPage.createDialog).toBeVisible({ timeout: 5_000 });
    await expect(webhooksPage.createNameInput).toBeVisible();
    await expect(webhooksPage.createDescriptionInput).toBeVisible();
    await expect(webhooksPage.createConfirmButton).toBeVisible();
  });

  test("create dialog shows preset selection grid", async ({
    dashboardPage,
    webhooksPage,
    page,
  }) => {
    const agentId = await createTestAgent(dashboardPage, page, "Preset Grid Agent");
    await mockWebhooksAPI(page, { agentId, returnEmpty: true });

    await webhooksPage.goto(agentId);
    await webhooksPage.newWebhookButton.click();
    await webhooksPage.createDialog.waitFor({ state: "visible", timeout: 5_000 });

    // The preset grid should show GitHub, Stripe, Slack, Generic
    await expect(page.getByRole("dialog").getByText("GitHub").first()).toBeVisible();
    await expect(page.getByRole("dialog").getByText("Stripe").first()).toBeVisible();
    await expect(page.getByRole("dialog").getByText("Slack").first()).toBeVisible();
  });

  test("selecting a preset in the create dialog shows a summary banner", async ({
    dashboardPage,
    webhooksPage,
    page,
  }) => {
    const agentId = await createTestAgent(dashboardPage, page, "Preset Summary Agent");
    await mockWebhooksAPI(page, { agentId, returnEmpty: true });

    await webhooksPage.goto(agentId);
    await webhooksPage.newWebhookButton.click();
    await webhooksPage.createDialog.waitFor({ state: "visible", timeout: 5_000 });

    // Click the GitHub preset
    await page
      .getByRole("dialog")
      .locator("button")
      .filter({ hasText: "GitHub" })
      .first()
      .click();

    // A summary banner should appear mentioning "GitHub preset selected"
    await expect(
      page.getByText(/github.*preset selected/i)
    ).toBeVisible({ timeout: 5_000 });
  });

  test("Create button is disabled until a name is entered", async ({
    dashboardPage,
    webhooksPage,
    page,
  }) => {
    const agentId = await createTestAgent(dashboardPage, page, "Disabled Btn Agent");
    await mockWebhooksAPI(page, { agentId, returnEmpty: true });

    await webhooksPage.goto(agentId);
    await webhooksPage.newWebhookButton.click();
    await webhooksPage.createDialog.waitFor({ state: "visible", timeout: 5_000 });

    await expect(webhooksPage.createConfirmButton).toBeDisabled();

    await webhooksPage.createNameInput.fill("My Webhook");
    await expect(webhooksPage.createConfirmButton).toBeEnabled();
  });
});

// ─── 3. Webhooks UI — Detail panel ───────────────────────────────────────────

test.describe("Webhooks UI — detail panel", () => {
  test("selecting a webhook shows the trigger URL in the detail panel", async ({
    dashboardPage,
    webhooksPage,
    page,
  }) => {
    const agentId = await createTestAgent(dashboardPage, page, "Detail URL Agent");
    await mockWebhooksAPI(page, { agentId });

    await webhooksPage.goto(agentId);
    await page.waitForLoadState("networkidle");

    // The trigger URL should contain the trigger path
    await expect(
      page.getByText(/\/api\/agents\/.*\/trigger\//i).first()
    ).toBeVisible({ timeout: 10_000 });
  });

  test("signing secret is masked by default", async ({
    dashboardPage,
    webhooksPage,
    page,
  }) => {
    const agentId = await createTestAgent(dashboardPage, page, "Secret Mask Agent");
    await mockWebhooksAPI(page, { agentId });

    await webhooksPage.goto(agentId);
    await page.waitForLoadState("networkidle");

    // Secret should be shown as bullets (not the real value)
    await expect(
      page.getByText(/•{10,}/).first()
    ).toBeVisible({ timeout: 10_000 });
  });

  test("clicking Show reveals the signing secret", async ({
    dashboardPage,
    webhooksPage,
    page,
  }) => {
    const agentId = await createTestAgent(dashboardPage, page, "Reveal Secret Agent");
    await mockWebhooksAPI(page, { agentId });

    await webhooksPage.goto(agentId);
    await page.waitForLoadState("networkidle");

    const showBtn = page.getByRole("button", { name: /^show$/i });
    await expect(showBtn).toBeVisible({ timeout: 10_000 });
    await showBtn.click();

    // Bullets should be gone; the secret value should appear
    await expect(page.getByRole("button", { name: /^hide$/i })).toBeVisible();
    await expect(
      page.getByText(MOCK_WEBHOOK.secret as string)
    ).toBeVisible({ timeout: 5_000 });
  });

  test("detail panel has Executions, Configuration, and Test tabs", async ({
    dashboardPage,
    webhooksPage,
    page,
  }) => {
    const agentId = await createTestAgent(dashboardPage, page, "Tabs Agent");
    await mockWebhooksAPI(page, { agentId });

    await webhooksPage.goto(agentId);
    await page.waitForLoadState("networkidle");

    // All three tabs must be visible
    await expect(
      page.locator("button[type='button']").filter({ hasText: /executions/i }).first()
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      page.locator("button[type='button']").filter({ hasText: /^configuration$/i }).first()
    ).toBeVisible();
    await expect(
      page.locator("button[type='button']").filter({ hasText: /^test$/i }).first()
    ).toBeVisible();
  });

  test("Executions tab shows execution history rows", async ({
    dashboardPage,
    webhooksPage,
    page,
  }) => {
    const agentId = await createTestAgent(dashboardPage, page, "Executions Tab Agent");
    await mockWebhooksAPI(page, { agentId });

    await webhooksPage.goto(agentId);
    await page.waitForLoadState("networkidle");

    // The mock webhook has 1 execution with status COMPLETED
    await expect(
      page.getByText(/completed/i).first()
    ).toBeVisible({ timeout: 10_000 });
  });

  test("webhook status badge shows Active when enabled", async ({
    dashboardPage,
    webhooksPage,
    page,
  }) => {
    const agentId = await createTestAgent(dashboardPage, page, "Status Badge Agent");
    await mockWebhooksAPI(page, { agentId, webhooks: [{ ...MOCK_WEBHOOK, enabled: true }] });

    await webhooksPage.goto(agentId);
    await page.waitForLoadState("networkidle");

    await expect(page.getByText(/^active$/i).first()).toBeVisible({ timeout: 10_000 });
  });

  test("webhook status badge shows Disabled when disabled", async ({
    dashboardPage,
    webhooksPage,
    page,
  }) => {
    const agentId = await createTestAgent(dashboardPage, page, "Disabled Badge Agent");
    await mockWebhooksAPI(page, {
      agentId,
      webhooks: [{ ...MOCK_WEBHOOK, enabled: false }],
    });

    await webhooksPage.goto(agentId);
    await page.waitForLoadState("networkidle");

    await expect(page.getByText(/^disabled$/i).first()).toBeVisible({ timeout: 10_000 });
  });
});

// ─── 4. Webhooks UI — Configuration tab ──────────────────────────────────────

test.describe("Webhooks UI — Configuration tab", () => {
  test("Configuration tab shows Apply Preset button and Event Filters section", async ({
    dashboardPage,
    webhooksPage,
    page,
  }) => {
    const agentId = await createTestAgent(dashboardPage, page, "Config Tab Agent");
    await mockWebhooksAPI(page, { agentId });

    await webhooksPage.goto(agentId);
    await page.waitForLoadState("networkidle");

    // Switch to config tab
    await page
      .locator("button[type='button']")
      .filter({ hasText: /^configuration$/i })
      .first()
      .click();

    await expect(webhooksPage.applyPresetButton).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText(/event filters/i).first()).toBeVisible();
  });

  test("Apply Preset button opens the preset picker dialog", async ({
    dashboardPage,
    webhooksPage,
    page,
  }) => {
    const agentId = await createTestAgent(dashboardPage, page, "Preset Picker Agent");
    await mockWebhooksAPI(page, { agentId });

    await webhooksPage.goto(agentId);
    await page.waitForLoadState("networkidle");

    await page
      .locator("button[type='button']")
      .filter({ hasText: /^configuration$/i })
      .first()
      .click();
    await webhooksPage.applyPresetButton.waitFor({ state: "visible", timeout: 5_000 });
    await webhooksPage.applyPresetButton.click();

    await expect(
      page.getByText("Apply Provider Preset")
    ).toBeVisible({ timeout: 5_000 });

    // All 4 presets should be in the dialog
    await expect(page.getByRole("dialog").getByText("GitHub").first()).toBeVisible();
    await expect(page.getByRole("dialog").getByText("Stripe").first()).toBeVisible();
    await expect(page.getByRole("dialog").getByText("Slack").first()).toBeVisible();
    await expect(page.getByRole("dialog").getByText("Generic").first()).toBeVisible();
  });

  test("event filter input accepts typed values via Enter key", async ({
    dashboardPage,
    webhooksPage,
    page,
  }) => {
    const agentId = await createTestAgent(dashboardPage, page, "Filter Input Agent");
    await mockWebhooksAPI(page, { agentId });

    await webhooksPage.goto(agentId);
    await page.waitForLoadState("networkidle");

    await page
      .locator("button[type='button']")
      .filter({ hasText: /^configuration$/i })
      .first()
      .click();
    await webhooksPage.eventFilterInput.waitFor({ state: "visible", timeout: 5_000 });

    await webhooksPage.eventFilterInput.fill("push");
    await webhooksPage.eventFilterInput.press("Enter");

    // The "push" tag chip should appear
    await expect(page.getByText("push").first()).toBeVisible({ timeout: 3_000 });
    // Input should be cleared
    await expect(webhooksPage.eventFilterInput).toHaveValue("");
  });

  test("event filter tags can be removed with the × button", async ({
    dashboardPage,
    webhooksPage,
    page,
  }) => {
    const agentId = await createTestAgent(dashboardPage, page, "Remove Filter Agent");
    // Mock with existing event filters
    await mockWebhooksAPI(page, {
      agentId,
      webhooks: [{ ...MOCK_WEBHOOK_WITH_FILTERS }],
    });

    await webhooksPage.goto(agentId);
    await page.waitForLoadState("networkidle");

    await page
      .locator("button[type='button']")
      .filter({ hasText: /^configuration$/i })
      .first()
      .click();

    // The "push" tag should be visible from the mock
    await expect(page.getByText("push").first()).toBeVisible({ timeout: 5_000 });

    // Click the aria-label="Remove push" button
    await page.getByRole("button", { name: /remove push/i }).click();

    // "push" tag should be gone
    await expect(
      page.getByRole("button", { name: /remove push/i })
    ).not.toBeVisible({ timeout: 3_000 });
  });

  test("empty event filter state shows descriptive placeholder", async ({
    dashboardPage,
    webhooksPage,
    page,
  }) => {
    const agentId = await createTestAgent(dashboardPage, page, "Empty Filter Agent");
    await mockWebhooksAPI(page, { agentId });

    await webhooksPage.goto(agentId);
    await page.waitForLoadState("networkidle");

    await page
      .locator("button[type='button']")
      .filter({ hasText: /^configuration$/i })
      .first()
      .click();

    await expect(
      page.getByText(/no filters.*all events are accepted/i)
    ).toBeVisible({ timeout: 5_000 });
  });

  test("Save Configuration button is disabled when config is unchanged", async ({
    dashboardPage,
    webhooksPage,
    page,
  }) => {
    const agentId = await createTestAgent(dashboardPage, page, "Save Disabled Agent");
    await mockWebhooksAPI(page, { agentId });

    await webhooksPage.goto(agentId);
    await page.waitForLoadState("networkidle");

    await page
      .locator("button[type='button']")
      .filter({ hasText: /^configuration$/i })
      .first()
      .click();

    await webhooksPage.saveConfigButton.waitFor({ state: "visible", timeout: 5_000 });
    await expect(webhooksPage.saveConfigButton).toBeDisabled();
  });

  test("Save Configuration becomes enabled after adding an event filter", async ({
    dashboardPage,
    webhooksPage,
    page,
  }) => {
    const agentId = await createTestAgent(dashboardPage, page, "Save Enabled Agent");
    await mockWebhooksAPI(page, { agentId });

    await webhooksPage.goto(agentId);
    await page.waitForLoadState("networkidle");

    await page
      .locator("button[type='button']")
      .filter({ hasText: /^configuration$/i })
      .first()
      .click();

    await webhooksPage.eventFilterInput.waitFor({ state: "visible", timeout: 5_000 });
    await webhooksPage.eventFilterInput.fill("release");
    await webhooksPage.eventFilterInput.press("Enter");

    await expect(webhooksPage.saveConfigButton).toBeEnabled({ timeout: 3_000 });
  });
});

// ─── 5. Webhooks UI — Test tab ────────────────────────────────────────────────

test.describe("Webhooks UI — Test tab", () => {
  test("Test tab shows payload textarea and event type input", async ({
    dashboardPage,
    webhooksPage,
    page,
  }) => {
    const agentId = await createTestAgent(dashboardPage, page, "Test Tab Agent");
    await mockWebhooksAPI(page, { agentId });

    await webhooksPage.goto(agentId);
    await page.waitForLoadState("networkidle");

    await page
      .locator("button[type='button']")
      .filter({ hasText: /^test$/i })
      .first()
      .click();

    await expect(webhooksPage.sendTestButton).toBeVisible({ timeout: 5_000 });
    await expect(page.getByLabel(/payload/i)).toBeVisible();
    await expect(page.getByLabel(/event type/i)).toBeVisible();
  });

  test("Test tab shows amber warning banner when event filters are active", async ({
    dashboardPage,
    webhooksPage,
    page,
  }) => {
    const agentId = await createTestAgent(dashboardPage, page, "Filter Warning Agent");
    await mockWebhooksAPI(page, {
      agentId,
      webhooks: [{ ...MOCK_WEBHOOK_WITH_FILTERS }],
    });

    await webhooksPage.goto(agentId);
    await page.waitForLoadState("networkidle");

    await page
      .locator("button[type='button']")
      .filter({ hasText: /^test$/i })
      .first()
      .click();

    // Amber warning about active event filters
    await expect(
      page.getByText(/event filters are active/i)
    ).toBeVisible({ timeout: 5_000 });
    await expect(
      page.getByText(/push.*pull_request/i).or(page.getByText(/pull_request.*push/i))
    ).toBeVisible();
  });

  test("Send Test Request button is disabled when webhook is disabled", async ({
    dashboardPage,
    webhooksPage,
    page,
  }) => {
    const agentId = await createTestAgent(dashboardPage, page, "Disabled Test Agent");
    await mockWebhooksAPI(page, {
      agentId,
      webhooks: [{ ...MOCK_WEBHOOK, enabled: false }],
    });

    await webhooksPage.goto(agentId);
    await page.waitForLoadState("networkidle");

    await page
      .locator("button[type='button']")
      .filter({ hasText: /^test$/i })
      .first()
      .click();

    await expect(webhooksPage.sendTestButton).toBeDisabled({ timeout: 5_000 });
  });

  test("sending a test request shows HTTP 200 success response", async ({
    dashboardPage,
    webhooksPage,
    page,
  }) => {
    const agentId = await createTestAgent(dashboardPage, page, "Send Test Agent");

    // Mock the detail endpoint AND the trigger endpoint
    await mockWebhooksAPI(page, { agentId });
    await mockWebhookTrigger(page, { agentId });

    await webhooksPage.goto(agentId);
    await page.waitForLoadState("networkidle");

    await page
      .locator("button[type='button']")
      .filter({ hasText: /^test$/i })
      .first()
      .click();

    await webhooksPage.sendTestButton.waitFor({ state: "visible", timeout: 5_000 });
    await webhooksPage.sendTestButton.click();

    // Result area should show HTTP 200 — Success
    await expect(
      page.getByText(/HTTP 200/i)
    ).toBeVisible({ timeout: 10_000 });
  });
});

// ─── 6. Webhooks UI — Detail actions ─────────────────────────────────────────

test.describe("Webhooks UI — detail actions", () => {
  test("more options dropdown contains Rotate Secret and Delete Webhook items", async ({
    dashboardPage,
    webhooksPage,
    page,
  }) => {
    const agentId = await createTestAgent(dashboardPage, page, "More Options Agent");
    await mockWebhooksAPI(page, { agentId });

    await webhooksPage.goto(agentId);
    await page.waitForLoadState("networkidle");

    // Open the ⋮ dropdown in the detail panel header
    await page.locator("button").filter({
      has: page.locator("svg"),
    }).last().click();

    await expect(
      page.getByRole("menuitem", { name: /rotate secret/i })
    ).toBeVisible({ timeout: 5_000 });
    await expect(
      page.getByRole("menuitem", { name: /delete webhook/i })
    ).toBeVisible();
  });

  test("rotating secret shows success toast and reveals the new secret", async ({
    dashboardPage,
    webhooksPage,
    page,
  }) => {
    const agentId = await createTestAgent(dashboardPage, page, "Rotate Secret Agent");
    await mockWebhooksAPI(page, { agentId });

    // The detail endpoint for the rotate call is already mocked by mockWebhooksAPI
    await webhooksPage.goto(agentId);
    await page.waitForLoadState("networkidle");

    // Open ⋮ dropdown and click Rotate Secret
    await page.locator("button").filter({ has: page.locator("svg") }).last().click();
    await page.getByRole("menuitem", { name: /rotate secret/i }).click();

    // Should show "rotated" success toast
    await expect(
      page.getByText(/secret rotated/i)
    ).toBeVisible({ timeout: 10_000 });
  });

  test("delete webhook triggers confirmation dialog with webhook name", async ({
    dashboardPage,
    webhooksPage,
    page,
  }) => {
    const agentId = await createTestAgent(dashboardPage, page, "Delete Dialog Agent");
    await mockWebhooksAPI(page, { agentId });

    await webhooksPage.goto(agentId);
    await page.waitForLoadState("networkidle");

    // Open ⋮ dropdown and click Delete
    await page.locator("button").filter({ has: page.locator("svg") }).last().click();
    await page.getByRole("menuitem", { name: /delete webhook/i }).click();

    // Confirm dialog should mention the webhook name
    await expect(
      page.getByRole("dialog").getByText(new RegExp(MOCK_WEBHOOK.name as string, "i"))
    ).toBeVisible({ timeout: 5_000 });
  });
});

// ─── 7. Webhooks API — CRUD ───────────────────────────────────────────────────

test.describe("Webhooks API — CRUD", () => {
  let webhookAgentId: string | null = null;
  let webhookId: string | null = null;

  test("POST /api/agents/[agentId]/webhooks creates a webhook with secret", async ({
    request,
  }) => {
    // First create an agent
    const agentRes = await request.post("/api/agents", {
      data: { name: "Webhook API CRUD Agent" },
    });
    expect(agentRes.status()).toBe(201);
    const agentBody = await agentRes.json();
    webhookAgentId = agentBody.data.id;

    const res = await request.post(`/api/agents/${webhookAgentId}/webhooks`, {
      data: {
        name: "E2E Test Webhook",
        description: "Created by E2E API test",
        eventFilters: ["push", "pull_request"],
      },
    });
    expect(res.status()).toBe(201);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBeTruthy();
    expect(body.data.name).toBe("E2E Test Webhook");
    expect(body.data.secret).toBeTruthy();
    expect(body.data.secret.length).toBeGreaterThan(20);
    expect(body.data.eventFilters).toEqual(["push", "pull_request"]);
    expect(body.data.enabled).toBe(true);

    webhookId = body.data.id;
  });

  test("GET /api/agents/[agentId]/webhooks lists created webhook", async ({
    request,
  }) => {
    if (!webhookAgentId) {
      test.skip();
      return;
    }

    const res = await request.get(`/api/agents/${webhookAgentId}/webhooks`);
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThanOrEqual(1);

    const wh = body.data.find((w: { name: string }) => w.name === "E2E Test Webhook");
    expect(wh).toBeDefined();
    // Secret must NOT be returned in the list endpoint
    expect(wh?.secret).toBeUndefined();
    expect(wh?.eventFilters).toEqual(["push", "pull_request"]);
  });

  test("GET /api/agents/[agentId]/webhooks/[id] returns detail with secret", async ({
    request,
  }) => {
    if (!webhookAgentId || !webhookId) {
      test.skip();
      return;
    }

    const res = await request.get(
      `/api/agents/${webhookAgentId}/webhooks/${webhookId}`
    );
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(webhookId);
    expect(body.data.secret).toBeTruthy();
    expect(body.data.executions).toBeDefined();
    expect(Array.isArray(body.data.executions)).toBe(true);
  });

  test("PATCH /api/agents/[agentId]/webhooks/[id] updates name and eventFilters", async ({
    request,
  }) => {
    if (!webhookAgentId || !webhookId) {
      test.skip();
      return;
    }

    const res = await request.patch(
      `/api/agents/${webhookAgentId}/webhooks/${webhookId}`,
      {
        data: {
          name: "E2E Test Webhook (Updated)",
          eventFilters: ["release"],
        },
      }
    );
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.name).toBe("E2E Test Webhook (Updated)");
    expect(body.data.eventFilters).toEqual(["release"]);
  });

  test("PATCH /api/agents/[agentId]/webhooks/[id] can disable a webhook", async ({
    request,
  }) => {
    if (!webhookAgentId || !webhookId) {
      test.skip();
      return;
    }

    const res = await request.patch(
      `/api/agents/${webhookAgentId}/webhooks/${webhookId}`,
      { data: { enabled: false } }
    );
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.enabled).toBe(false);

    // Re-enable for subsequent tests
    await request.patch(`/api/agents/${webhookAgentId}/webhooks/${webhookId}`, {
      data: { enabled: true },
    });
  });

  test("POST .../rotate returns a new secret of correct length", async ({
    request,
  }) => {
    if (!webhookAgentId || !webhookId) {
      test.skip();
      return;
    }

    // Capture old secret
    const detailBefore = await request
      .get(`/api/agents/${webhookAgentId}/webhooks/${webhookId}`)
      .then((r) => r.json());
    const oldSecret: string = detailBefore.data.secret;

    const res = await request.post(
      `/api/agents/${webhookAgentId}/webhooks/${webhookId}/rotate`
    );
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.secret).toBeTruthy();
    // New secret must differ from old
    expect(body.data.secret).not.toBe(oldSecret);
    // Standard Webhooks secret: 43 chars (base64url of 32 bytes)
    expect(body.data.secret.length).toBe(43);
  });

  test("DELETE /api/agents/[agentId]/webhooks/[id] removes the webhook", async ({
    request,
  }) => {
    if (!webhookAgentId || !webhookId) {
      test.skip();
      return;
    }

    const res = await request.delete(
      `/api/agents/${webhookAgentId}/webhooks/${webhookId}`
    );
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);

    // Verify it no longer appears in the list
    const listRes = await request.get(`/api/agents/${webhookAgentId}/webhooks`);
    const listBody = await listRes.json();
    const found = listBody.data.find(
      (w: { id: string }) => w.id === webhookId
    );
    expect(found).toBeUndefined();

    // Clean up the agent
    if (webhookAgentId) {
      await request.delete(`/api/agents/${webhookAgentId}`);
      webhookAgentId = null;
      webhookId = null;
    }
  });
});

// ─── 8. Webhooks API — Trigger endpoint (HMAC) ───────────────────────────────

test.describe("Webhooks API — trigger endpoint", () => {
  let triggerAgentId: string | null = null;
  let triggerWebhookId: string | null = null;
  let triggerSecret: string | null = null;

  // Set up a real webhook for trigger tests
  test.beforeAll(async ({ request }) => {
    const agentRes = await request.post("/api/agents", {
      data: { name: "Webhook Trigger E2E Agent" },
    });
    if (agentRes.status() !== 201) return;
    const agentBody = await agentRes.json();
    triggerAgentId = agentBody.data.id;

    const whRes = await request.post(`/api/agents/${triggerAgentId}/webhooks`, {
      data: { name: "Trigger Test Webhook" },
    });
    if (whRes.status() !== 201) return;
    const whBody = await whRes.json();
    triggerWebhookId = whBody.data.id;
    triggerSecret = whBody.data.secret;
  });

  test.afterAll(async ({ request }) => {
    if (triggerAgentId) {
      await request.delete(`/api/agents/${triggerAgentId}`);
    }
  });

  test("valid HMAC-SHA256 signature → 200 accepted", async ({ request }) => {
    if (!triggerAgentId || !triggerWebhookId || !triggerSecret) {
      test.skip();
      return;
    }

    const body = JSON.stringify({
      event: "test",
      data: { message: "hello from E2E" },
    });
    const webhookId = `e2e-${Date.now()}`;
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = signWebhook(webhookId, timestamp, body, triggerSecret);

    const res = await request.post(
      `/api/agents/${triggerAgentId}/trigger/${triggerWebhookId}`,
      {
        data: body,
        headers: {
          "Content-Type": "application/json",
          "x-webhook-id": webhookId,
          "x-webhook-timestamp": timestamp,
          "x-webhook-signature": signature,
        },
      }
    );

    // 200 or 202 — the trigger was accepted; execution may fail without a full flow
    // but the signature was valid so it must not be 400/401
    expect([200, 202]).toContain(res.status());

    const resBody = await res.json();
    expect(resBody.success).toBe(true);
    // Must NOT be skipped
    expect(resBody.skipped).toBeFalsy();
  });

  test("invalid HMAC signature → 400 signature mismatch", async ({ request }) => {
    if (!triggerAgentId || !triggerWebhookId) {
      test.skip();
      return;
    }

    const body = JSON.stringify({ event: "test" });
    const webhookId = `e2e-bad-${Date.now()}`;
    const timestamp = Math.floor(Date.now() / 1000).toString();

    const res = await request.post(
      `/api/agents/${triggerAgentId}/trigger/${triggerWebhookId}`,
      {
        data: body,
        headers: {
          "Content-Type": "application/json",
          "x-webhook-id": webhookId,
          "x-webhook-timestamp": timestamp,
          // Deliberately wrong signature
          "x-webhook-signature": "v1,aGVsbG8gd29ybGQ=",
        },
      }
    );

    expect(res.status()).toBe(400);
    const resBody = await res.json();
    expect(resBody.success).toBe(false);
    expect(resBody.error).toMatch(/signature/i);
  });

  test("missing signature headers → 400", async ({ request }) => {
    if (!triggerAgentId || !triggerWebhookId) {
      test.skip();
      return;
    }

    const res = await request.post(
      `/api/agents/${triggerAgentId}/trigger/${triggerWebhookId}`,
      {
        data: JSON.stringify({ event: "test" }),
        headers: { "Content-Type": "application/json" },
        // No x-webhook-id / x-webhook-timestamp / x-webhook-signature
      }
    );

    expect(res.status()).toBe(400);
  });

  test("event filter — matching event type is accepted, non-matching is skipped", async ({
    request,
  }) => {
    if (!triggerAgentId || !triggerSecret) {
      test.skip();
      return;
    }

    // Create a dedicated filtered webhook
    const whRes = await request.post(`/api/agents/${triggerAgentId}/webhooks`, {
      data: {
        name: "Filtered E2E Webhook",
        eventFilters: ["push"],
      },
    });
    if (whRes.status() !== 201) {
      test.skip();
      return;
    }
    const whBody = await whRes.json();
    const filteredId: string = whBody.data.id;
    const filteredSecret: string = whBody.data.secret;

    // ── Case A: event type matches → accepted ──────────────────────────────
    const bodyA = JSON.stringify({ action: "opened" });
    const idA = `e2e-match-${Date.now()}`;
    const tsA = Math.floor(Date.now() / 1000).toString();
    const sigA = signWebhook(idA, tsA, bodyA, filteredSecret);

    const resA = await request.post(
      `/api/agents/${triggerAgentId}/trigger/${filteredId}`,
      {
        data: bodyA,
        headers: {
          "Content-Type": "application/json",
          "x-webhook-id": idA,
          "x-webhook-timestamp": tsA,
          "x-webhook-signature": sigA,
          "x-webhook-event": "push",  // matches the filter
        },
      }
    );

    expect([200, 202]).toContain(resA.status());
    const bodyResA = await resA.json();
    expect(bodyResA.skipped).toBeFalsy();

    // ── Case B: event type does NOT match → skipped ────────────────────────
    const bodyB = JSON.stringify({ action: "closed" });
    const idB = `e2e-skip-${Date.now()}`;
    const tsB = Math.floor(Date.now() / 1000).toString();
    const sigB = signWebhook(idB, tsB, bodyB, filteredSecret);

    const resB = await request.post(
      `/api/agents/${triggerAgentId}/trigger/${filteredId}`,
      {
        data: bodyB,
        headers: {
          "Content-Type": "application/json",
          "x-webhook-id": idB,
          "x-webhook-timestamp": tsB,
          "x-webhook-signature": sigB,
          "x-webhook-event": "pull_request",  // does NOT match "push"
        },
      }
    );

    expect(resB.status()).toBe(200);
    const bodyResB = await resB.json();
    expect(bodyResB.success).toBe(true);
    expect(bodyResB.skipped).toBe(true);
  });

  test("idempotency — duplicate x-webhook-id returns 409", async ({
    request,
  }) => {
    if (!triggerAgentId || !triggerWebhookId || !triggerSecret) {
      test.skip();
      return;
    }

    const body = JSON.stringify({ event: "idempotency_test" });
    const webhookId = `e2e-idempotent-${Date.now()}`;
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = signWebhook(webhookId, timestamp, body, triggerSecret);

    const headers = {
      "Content-Type": "application/json",
      "x-webhook-id": webhookId,
      "x-webhook-timestamp": timestamp,
      "x-webhook-signature": signature,
    };

    // First request — should succeed
    const res1 = await request.post(
      `/api/agents/${triggerAgentId}/trigger/${triggerWebhookId}`,
      { data: body, headers }
    );
    expect([200, 202]).toContain(res1.status());

    // Second request with same webhookId — should be rejected as duplicate
    const res2 = await request.post(
      `/api/agents/${triggerAgentId}/trigger/${triggerWebhookId}`,
      { data: body, headers }
    );
    expect(res2.status()).toBe(409);
  });
});

// ─── 9. Flow Builder integration ─────────────────────────────────────────────

test.describe("Flow Builder — webhook integration", () => {
  test("flow builder header has a Webhooks navigation button", async ({
    dashboardPage,
    page,
  }) => {
    await dashboardPage.goto();
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

    await page.goto(`/builder/${agentId}`);
    await page.waitForLoadState("networkidle");

    // The builder header should contain a "Webhooks" link or button
    await expect(
      page.getByRole("link", { name: /webhooks/i }).or(
        page.getByRole("button", { name: /webhooks/i })
      )
    ).toBeVisible({ timeout: 10_000 });
  });

  test("node picker contains the webhook_trigger node type", async ({
    dashboardPage,
    flowBuilderPage,
    page,
  }) => {
    await dashboardPage.goto();
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

    // The "Webhook Trigger" node should be listed in the picker
    await expect(
      page.getByRole("menuitem", { name: /webhook trigger/i }).or(
        page.locator('[data-slot="dropdown-menu-item"]').filter({ hasText: /webhook trigger/i })
      )
    ).toBeVisible({ timeout: 5_000 });
  });
});
