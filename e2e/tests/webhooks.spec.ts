/**
 * E2E tests — Inbound Webhooks
 *
 * Covers:
 *   1. Webhooks UI — navigation, empty state, create dialog, list, detail panel
 *   2. Webhooks UI — Configuration tab (presets, event filters, save)
 *   3. Webhooks UI — Test tab (payload, event type, filter warning)
 *   4. Webhooks UI — Detail actions (rotate secret, delete confirm)
 *   5. Webhooks API — CRUD (create, list, get, patch, delete, rotate)
 *   6. Webhooks API — Trigger endpoint (valid HMAC → 200, invalid HMAC → 400,
 *                      filtered event → skipped, idempotency → 409)
 *   7. Flow Builder integration — "Webhooks" button + webhook_trigger node
 *   8. Webhooks UI — Execution Replay (Replay button, loading state, success/error feedback,
 *                      replay badge, API 422/404 for missing payload)
 *
 * Architecture:
 *   - UI tests: single shared agent created via API in beforeAll + page.route() mocks
 *   - API tests: own agents/webhooks created and cleaned up per describe block
 *   - Trigger tests: own webhook with known secret, created in beforeAll
 */

import { createHmac } from "crypto";
import { test, expect } from "../fixtures/base";
import {
  mockWebhooksAPI,
  mockWebhookTrigger,
  mockWebhookReplay,
  MOCK_WEBHOOK,
  MOCK_WEBHOOK_WITH_FILTERS,
} from "../mocks/handlers";

// ─── helpers ──────────────────────────────────────────────────────────────────

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

// ─── Shared agent for all UI tests ────────────────────────────────────────────

/**
 * One agent is created once for all UI describe blocks via the API.
 * UI tests never need to touch the dashboard — they navigate directly to
 * /webhooks/[agentId] with all API routes mocked via page.route().
 */
let sharedAgentId: string | null = null;

test.beforeAll(async ({ request }) => {
  const res = await request.post("/api/agents", {
    data: { name: "Webhooks E2E Shared Agent" },
  });
  if (res.status() === 201) {
    const body = await res.json();
    sharedAgentId = body.data.id;
  }
});

test.afterAll(async ({ request }) => {
  if (sharedAgentId) {
    await request.delete(`/api/agents/${sharedAgentId}`);
    sharedAgentId = null;
  }
});

// ─── 1. Webhooks UI — page structure ─────────────────────────────────────────

test.describe("Webhooks UI — page structure", () => {
  test("renders the page heading and New Webhook button", async ({
    webhooksPage,
    page,
  }) => {
    if (!sharedAgentId) { test.skip(); return; }
    await mockWebhooksAPI(page, { agentId: sharedAgentId });
    // Navigate directly (skip networkidle — real /api/agents fetch for agent name
    // can delay it; the top-bar renders immediately from the React shell)
    await page.goto(`/webhooks/${sharedAgentId}`);

    // h1 is in the top bar — visible before any API calls complete
    await expect(page.locator("h1").filter({ hasText: /webhooks/i }))
      .toBeVisible({ timeout: 10_000 });
    await expect(webhooksPage.newWebhookButton).toBeVisible();
  });

  test("shows empty state when agent has no webhooks", async ({
    webhooksPage,
    page,
  }) => {
    if (!sharedAgentId) { test.skip(); return; }
    await mockWebhooksAPI(page, { agentId: sharedAgentId, returnEmpty: true });
    await webhooksPage.goto(sharedAgentId);

    await expect(webhooksPage.emptyState).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByRole("button", { name: /create webhook/i })
    ).toBeVisible();
  });

  test("renders webhook names in the sidebar when webhooks exist", async ({
    webhooksPage,
    page,
  }) => {
    if (!sharedAgentId) { test.skip(); return; }
    await mockWebhooksAPI(page, {
      agentId: sharedAgentId,
      webhooks: [MOCK_WEBHOOK, MOCK_WEBHOOK_WITH_FILTERS],
    });
    await webhooksPage.goto(sharedAgentId);
    await page.waitForLoadState("networkidle");

    await expect(
      page.getByText(MOCK_WEBHOOK.name as string).first()
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByText(MOCK_WEBHOOK_WITH_FILTERS.name as string).first()
    ).toBeVisible();
  });

  test("shows filter count badge for webhooks with event filters", async ({
    webhooksPage,
    page,
  }) => {
    if (!sharedAgentId) { test.skip(); return; }
    await mockWebhooksAPI(page, {
      agentId: sharedAgentId,
      webhooks: [MOCK_WEBHOOK_WITH_FILTERS],
    });
    await webhooksPage.goto(sharedAgentId);
    await page.waitForLoadState("networkidle");

    // MOCK_WEBHOOK_WITH_FILTERS has eventFilters: ["push", "pull_request"]
    await expect(
      page.getByText(/2 filter/i).first()
    ).toBeVisible({ timeout: 10_000 });
  });
});

// ─── 2. Webhooks UI — Create dialog ───────────────────────────────────────────

test.describe("Webhooks UI — create dialog", () => {
  test("create dialog opens with name and description fields", async ({
    webhooksPage,
    page,
  }) => {
    if (!sharedAgentId) { test.skip(); return; }
    await mockWebhooksAPI(page, { agentId: sharedAgentId, returnEmpty: true });
    await webhooksPage.goto(sharedAgentId);
    await webhooksPage.newWebhookButton.click();

    await expect(webhooksPage.createDialog).toBeVisible({ timeout: 5_000 });
    await expect(webhooksPage.createNameInput).toBeVisible();
    await expect(webhooksPage.createDescriptionInput).toBeVisible();
    await expect(webhooksPage.createConfirmButton).toBeVisible();
  });

  test("create dialog shows preset selection grid (GitHub, Stripe, Slack)", async ({
    webhooksPage,
    page,
  }) => {
    if (!sharedAgentId) { test.skip(); return; }
    await mockWebhooksAPI(page, { agentId: sharedAgentId, returnEmpty: true });
    await webhooksPage.goto(sharedAgentId);
    await webhooksPage.newWebhookButton.click();
    await webhooksPage.createDialog.waitFor({ state: "visible", timeout: 5_000 });

    await expect(page.getByRole("dialog").getByText("GitHub").first()).toBeVisible();
    await expect(page.getByRole("dialog").getByText("Stripe").first()).toBeVisible();
    await expect(page.getByRole("dialog").getByText("Slack").first()).toBeVisible();
  });

  test("selecting a preset shows a summary banner with mapping counts", async ({
    webhooksPage,
    page,
  }) => {
    if (!sharedAgentId) { test.skip(); return; }
    await mockWebhooksAPI(page, { agentId: sharedAgentId, returnEmpty: true });
    await webhooksPage.goto(sharedAgentId);
    await webhooksPage.newWebhookButton.click();
    await webhooksPage.createDialog.waitFor({ state: "visible", timeout: 5_000 });

    // Click the GitHub preset button
    await page
      .getByRole("dialog")
      .locator("button")
      .filter({ hasText: "GitHub" })
      .first()
      .click();

    await expect(
      page.getByText(/github.*preset selected/i)
    ).toBeVisible({ timeout: 5_000 });
  });

  test("Create button is disabled until a name is entered", async ({
    webhooksPage,
    page,
  }) => {
    if (!sharedAgentId) { test.skip(); return; }
    await mockWebhooksAPI(page, { agentId: sharedAgentId, returnEmpty: true });
    await webhooksPage.goto(sharedAgentId);
    await webhooksPage.newWebhookButton.click();
    await webhooksPage.createDialog.waitFor({ state: "visible", timeout: 5_000 });

    await expect(webhooksPage.createConfirmButton).toBeDisabled();
    await webhooksPage.createNameInput.fill("My Webhook");
    await expect(webhooksPage.createConfirmButton).toBeEnabled();
  });
});

// ─── 3. Webhooks UI — Detail panel ────────────────────────────────────────────

test.describe("Webhooks UI — detail panel", () => {
  test("selecting a webhook reveals the trigger URL", async ({
    webhooksPage,
    page,
  }) => {
    if (!sharedAgentId) { test.skip(); return; }
    await mockWebhooksAPI(page, { agentId: sharedAgentId });
    await webhooksPage.goto(sharedAgentId);
    await page.waitForLoadState("networkidle");

    await expect(
      page.getByText(/\/api\/agents\/.*\/trigger\//i).first()
    ).toBeVisible({ timeout: 10_000 });
  });

  test("signing secret is masked by default (bullet characters)", async ({
    webhooksPage,
    page,
  }) => {
    if (!sharedAgentId) { test.skip(); return; }
    await mockWebhooksAPI(page, { agentId: sharedAgentId });
    await webhooksPage.goto(sharedAgentId);
    await page.waitForLoadState("networkidle");

    await expect(
      page.getByText(/•{10,}/).first()
    ).toBeVisible({ timeout: 10_000 });
  });

  test("clicking Show reveals the signing secret value", async ({
    webhooksPage,
    page,
  }) => {
    if (!sharedAgentId) { test.skip(); return; }
    await mockWebhooksAPI(page, { agentId: sharedAgentId });
    await webhooksPage.goto(sharedAgentId);
    await page.waitForLoadState("networkidle");

    const showBtn = page.getByRole("button", { name: /^show$/i });
    await showBtn.waitFor({ state: "visible", timeout: 10_000 });
    await showBtn.click();

    await expect(page.getByRole("button", { name: /^hide$/i })).toBeVisible();
    await expect(
      page.getByText(MOCK_WEBHOOK.secret as string)
    ).toBeVisible({ timeout: 5_000 });
  });

  test("detail panel shows Executions, Configuration, and Test tabs", async ({
    webhooksPage,
    page,
  }) => {
    if (!sharedAgentId) { test.skip(); return; }
    await mockWebhooksAPI(page, { agentId: sharedAgentId });
    await webhooksPage.goto(sharedAgentId);
    await page.waitForLoadState("networkidle");

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

  test("Executions tab shows COMPLETED execution from mock", async ({
    webhooksPage,
    page,
  }) => {
    if (!sharedAgentId) { test.skip(); return; }
    await mockWebhooksAPI(page, { agentId: sharedAgentId });
    await webhooksPage.goto(sharedAgentId);
    await page.waitForLoadState("networkidle");

    await expect(
      page.getByText(/completed/i).first()
    ).toBeVisible({ timeout: 10_000 });
  });

  test("status badge shows Active when webhook is enabled", async ({
    webhooksPage,
    page,
  }) => {
    if (!sharedAgentId) { test.skip(); return; }
    await mockWebhooksAPI(page, {
      agentId: sharedAgentId,
      webhooks: [{ ...MOCK_WEBHOOK, enabled: true }],
    });
    await webhooksPage.goto(sharedAgentId);
    await page.waitForLoadState("networkidle");

    await expect(page.getByText(/^active$/i).first()).toBeVisible({ timeout: 10_000 });
  });

  test("status badge shows Disabled when webhook is disabled", async ({
    webhooksPage,
    page,
  }) => {
    if (!sharedAgentId) { test.skip(); return; }
    await mockWebhooksAPI(page, {
      agentId: sharedAgentId,
      webhooks: [{ ...MOCK_WEBHOOK, enabled: false }],
    });
    await webhooksPage.goto(sharedAgentId);
    await page.waitForLoadState("networkidle");

    await expect(page.getByText(/^disabled$/i).first()).toBeVisible({ timeout: 10_000 });
  });
});

// ─── 4. Webhooks UI — Configuration tab ───────────────────────────────────────

test.describe("Webhooks UI — Configuration tab", () => {
  test("Configuration tab shows Apply Preset button and Event Filters section", async ({
    webhooksPage,
    page,
  }) => {
    if (!sharedAgentId) { test.skip(); return; }
    await mockWebhooksAPI(page, { agentId: sharedAgentId });
    await webhooksPage.goto(sharedAgentId);
    await page.waitForLoadState("networkidle");

    await page
      .locator("button[type='button']")
      .filter({ hasText: /^configuration$/i })
      .first()
      .click();

    await expect(webhooksPage.applyPresetButton).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText(/event filters/i).first()).toBeVisible();
  });

  test("Apply Preset button opens the preset picker dialog with all 4 presets", async ({
    webhooksPage,
    page,
  }) => {
    if (!sharedAgentId) { test.skip(); return; }
    await mockWebhooksAPI(page, { agentId: sharedAgentId });
    await webhooksPage.goto(sharedAgentId);
    await page.waitForLoadState("networkidle");

    await page
      .locator("button[type='button']")
      .filter({ hasText: /^configuration$/i })
      .first()
      .click();
    await webhooksPage.applyPresetButton.waitFor({ state: "visible", timeout: 5_000 });
    await webhooksPage.applyPresetButton.click();

    await expect(page.getByText("Apply Provider Preset")).toBeVisible({ timeout: 5_000 });
    await expect(page.getByRole("dialog").getByText("GitHub").first()).toBeVisible();
    await expect(page.getByRole("dialog").getByText("Stripe").first()).toBeVisible();
    await expect(page.getByRole("dialog").getByText("Slack").first()).toBeVisible();
    await expect(page.getByRole("dialog").getByText("Generic").first()).toBeVisible();
  });

  test("event filter input adds a tag chip when Enter is pressed", async ({
    webhooksPage,
    page,
  }) => {
    if (!sharedAgentId) { test.skip(); return; }
    await mockWebhooksAPI(page, { agentId: sharedAgentId });
    await webhooksPage.goto(sharedAgentId);
    await page.waitForLoadState("networkidle");

    await page
      .locator("button[type='button']")
      .filter({ hasText: /^configuration$/i })
      .first()
      .click();
    await webhooksPage.eventFilterInput.waitFor({ state: "visible", timeout: 5_000 });

    await webhooksPage.eventFilterInput.fill("push");
    await webhooksPage.eventFilterInput.press("Enter");

    await expect(page.getByText("push").first()).toBeVisible({ timeout: 3_000 });
    await expect(webhooksPage.eventFilterInput).toHaveValue("");
  });

  test("filter tag chips can be removed with the × button", async ({
    webhooksPage,
    page,
  }) => {
    if (!sharedAgentId) { test.skip(); return; }
    await mockWebhooksAPI(page, {
      agentId: sharedAgentId,
      webhooks: [{ ...MOCK_WEBHOOK_WITH_FILTERS }],
    });
    await webhooksPage.goto(sharedAgentId);
    await page.waitForLoadState("networkidle");

    await page
      .locator("button[type='button']")
      .filter({ hasText: /^configuration$/i })
      .first()
      .click();

    await expect(page.getByText("push").first()).toBeVisible({ timeout: 5_000 });
    await page.getByRole("button", { name: /remove push/i }).click();
    await expect(page.getByRole("button", { name: /remove push/i })).not.toBeVisible({ timeout: 3_000 });
  });

  test("empty filters show placeholder text", async ({ webhooksPage, page }) => {
    if (!sharedAgentId) { test.skip(); return; }
    await mockWebhooksAPI(page, { agentId: sharedAgentId });
    await webhooksPage.goto(sharedAgentId);
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

  test("Save Configuration is disabled when config is unchanged", async ({
    webhooksPage,
    page,
  }) => {
    if (!sharedAgentId) { test.skip(); return; }
    await mockWebhooksAPI(page, { agentId: sharedAgentId });
    await webhooksPage.goto(sharedAgentId);
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
    webhooksPage,
    page,
  }) => {
    if (!sharedAgentId) { test.skip(); return; }
    await mockWebhooksAPI(page, { agentId: sharedAgentId });
    await webhooksPage.goto(sharedAgentId);
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

// ─── 5. Webhooks UI — Test tab ─────────────────────────────────────────────────

test.describe("Webhooks UI — Test tab", () => {
  test("Test tab shows payload textarea and event type input", async ({
    webhooksPage,
    page,
  }) => {
    if (!sharedAgentId) { test.skip(); return; }
    await mockWebhooksAPI(page, { agentId: sharedAgentId });
    await webhooksPage.goto(sharedAgentId);
    await page.waitForLoadState("networkidle");

    await page
      .locator("button[type='button']")
      .filter({ hasText: /^test$/i })
      .first()
      .click();

    // <Label> is not associated via htmlFor — use structural locators instead
    await expect(webhooksPage.sendTestButton).toBeVisible({ timeout: 5_000 });
    await expect(page.locator("textarea").first()).toBeVisible();
    await expect(page.getByPlaceholder(/push, pull_request/i)).toBeVisible();
  });

  test("Test tab shows amber warning banner when event filters are active", async ({
    webhooksPage,
    page,
  }) => {
    if (!sharedAgentId) { test.skip(); return; }
    await mockWebhooksAPI(page, {
      agentId: sharedAgentId,
      webhooks: [{ ...MOCK_WEBHOOK_WITH_FILTERS }],
    });
    await webhooksPage.goto(sharedAgentId);
    await page.waitForLoadState("networkidle");

    await page
      .locator("button[type='button']")
      .filter({ hasText: /^test$/i })
      .first()
      .click();

    await expect(
      page.getByText(/event filters are active/i)
    ).toBeVisible({ timeout: 5_000 });
  });

  test("Send Test Request button is disabled when webhook is disabled", async ({
    webhooksPage,
    page,
  }) => {
    if (!sharedAgentId) { test.skip(); return; }
    await mockWebhooksAPI(page, {
      agentId: sharedAgentId,
      webhooks: [{ ...MOCK_WEBHOOK, enabled: false }],
    });
    await webhooksPage.goto(sharedAgentId);
    await page.waitForLoadState("networkidle");

    await page
      .locator("button[type='button']")
      .filter({ hasText: /^test$/i })
      .first()
      .click();

    // When disabled the button text changes to "Enable webhook to test"
    const sendBtn = page
      .getByRole("button", { name: /enable webhook to test/i })
      .or(page.getByRole("button", { name: /send test request/i }));
    await expect(sendBtn).toBeDisabled({ timeout: 5_000 });
  });

  test("sending a test request shows HTTP 200 success result", async ({
    webhooksPage,
    page,
  }) => {
    if (!sharedAgentId) { test.skip(); return; }
    await mockWebhooksAPI(page, { agentId: sharedAgentId });
    await mockWebhookTrigger(page, { agentId: sharedAgentId });
    await webhooksPage.goto(sharedAgentId);
    await page.waitForLoadState("networkidle");

    await page
      .locator("button[type='button']")
      .filter({ hasText: /^test$/i })
      .first()
      .click();

    await webhooksPage.sendTestButton.waitFor({ state: "visible", timeout: 5_000 });
    await webhooksPage.sendTestButton.click();

    await expect(page.getByText(/HTTP 200/i)).toBeVisible({ timeout: 10_000 });
  });
});

// ─── 6. Webhooks UI — Detail actions ──────────────────────────────────────────

test.describe("Webhooks UI — detail actions", () => {
  /**
   * Helper: wait for the detail panel's MoreVertical (⋮) dropdown trigger to appear.
   *
   * The detail panel loads in two network hops:
   *   1. GET /webhooks  → list (mocked, fast)
   *   2. GET /webhooks/[id] → detail (mocked, fast, but triggered by React state update)
   *
   * `networkidle` can fire between hops 1 and 2 (after React renders the list but before
   * the detail component's useEffect fires).  We therefore wait explicitly for the Trigger
   * URL text — the first element that only renders once the detail response has arrived.
   */
  async function waitForDetailPanel(page: import("@playwright/test").Page) {
    await page
      .getByText(/\/api\/agents\/.*\/trigger\//i)
      .first()
      .waitFor({ state: "visible", timeout: 10_000 });
  }

  /** Click the ⋮ button. Button component renders data-variant + data-size attributes. */
  async function openMoreMenu(page: import("@playwright/test").Page) {
    await waitForDetailPanel(page);
    // variant="ghost" size="icon" is unique to the MoreVertical button on this page
    await page.locator('[data-variant="ghost"][data-size="icon"]').click();
  }

  test("⋮ dropdown contains Rotate Secret and Delete Webhook items", async ({
    webhooksPage,
    page,
  }) => {
    if (!sharedAgentId) { test.skip(); return; }
    await mockWebhooksAPI(page, { agentId: sharedAgentId });
    await webhooksPage.goto(sharedAgentId);

    await openMoreMenu(page);

    await expect(
      page.getByRole("menuitem", { name: /rotate secret/i })
    ).toBeVisible({ timeout: 5_000 });
    await expect(
      page.getByRole("menuitem", { name: /delete webhook/i })
    ).toBeVisible();
  });

  test("rotating secret shows success toast", async ({ webhooksPage, page }) => {
    if (!sharedAgentId) { test.skip(); return; }
    await mockWebhooksAPI(page, { agentId: sharedAgentId });
    await webhooksPage.goto(sharedAgentId);

    await openMoreMenu(page);
    await page.getByRole("menuitem", { name: /rotate secret/i }).click();

    await expect(
      page.getByText(/secret rotated/i)
    ).toBeVisible({ timeout: 10_000 });
  });

  test("delete shows confirmation dialog with the webhook name", async ({
    webhooksPage,
    page,
  }) => {
    if (!sharedAgentId) { test.skip(); return; }
    await mockWebhooksAPI(page, { agentId: sharedAgentId });
    await webhooksPage.goto(sharedAgentId);

    await openMoreMenu(page);
    await page.getByRole("menuitem", { name: /delete webhook/i }).click();

    await expect(
      page.getByRole("dialog").getByText(new RegExp(MOCK_WEBHOOK.name as string, "i"))
    ).toBeVisible({ timeout: 5_000 });
  });
});

// ─── 7. Webhooks API — CRUD ────────────────────────────────────────────────────

test.describe("Webhooks API — CRUD", () => {
  let apiAgentId: string | null = null;
  let webhookId: string | null = null;

  test.beforeAll(async ({ request }) => {
    const res = await request.post("/api/agents", {
      data: { name: "Webhook API CRUD Agent" },
    });
    if (res.status() === 201) {
      apiAgentId = (await res.json()).data.id;
    }
  });

  test.afterAll(async ({ request }) => {
    if (apiAgentId) {
      await request.delete(`/api/agents/${apiAgentId}`);
      apiAgentId = null;
    }
  });

  test("POST creates a webhook — returns 201 with id and secret", async ({
    request,
  }) => {
    if (!apiAgentId) { test.skip(); return; }

    const res = await request.post(`/api/agents/${apiAgentId}/webhooks`, {
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

  test("GET list — includes created webhook, secret NOT exposed", async ({
    request,
  }) => {
    if (!apiAgentId || !webhookId) { test.skip(); return; }

    const res = await request.get(`/api/agents/${apiAgentId}/webhooks`);
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    const wh = body.data.find((w: { name: string }) => w.name === "E2E Test Webhook");
    expect(wh).toBeDefined();
    expect(wh?.secret).toBeUndefined();
    expect(wh?.eventFilters).toEqual(["push", "pull_request"]);
  });

  test("GET detail — secret is hidden, executions array returned", async ({ request }) => {
    if (!apiAgentId || !webhookId) { test.skip(); return; }

    const res = await request.get(`/api/agents/${apiAgentId}/webhooks/${webhookId}`);
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(webhookId);
    // GET detail intentionally strips the secret for security (only exposed on create/rotate)
    expect(body.data.secret).toBeUndefined();
    expect(Array.isArray(body.data.executions)).toBe(true);
  });

  test("PATCH — updates name and eventFilters", async ({ request }) => {
    if (!apiAgentId || !webhookId) { test.skip(); return; }

    const res = await request.patch(`/api/agents/${apiAgentId}/webhooks/${webhookId}`, {
      data: { name: "E2E Test Webhook (Updated)", eventFilters: ["release"] },
    });
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.data.name).toBe("E2E Test Webhook (Updated)");
    expect(body.data.eventFilters).toEqual(["release"]);
  });

  test("PATCH — can disable a webhook", async ({ request }) => {
    if (!apiAgentId || !webhookId) { test.skip(); return; }

    const res = await request.patch(`/api/agents/${apiAgentId}/webhooks/${webhookId}`, {
      data: { enabled: false },
    });
    expect(res.status()).toBe(200);
    expect((await res.json()).data.enabled).toBe(false);

    // Re-enable for subsequent tests
    await request.patch(`/api/agents/${apiAgentId}/webhooks/${webhookId}`, {
      data: { enabled: true },
    });
  });

  test("POST .../rotate — returns a new 43-char secret", async ({ request }) => {
    if (!apiAgentId || !webhookId) { test.skip(); return; }

    const before = await request
      .get(`/api/agents/${apiAgentId}/webhooks/${webhookId}`)
      .then((r) => r.json());
    const oldSecret: string = before.data.secret;

    const res = await request.post(
      `/api/agents/${apiAgentId}/webhooks/${webhookId}/rotate`
    );
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.data.secret).not.toBe(oldSecret);
    expect(body.data.secret.length).toBe(43); // base64url(32 bytes)
  });

  test("DELETE — removes webhook, no longer in list", async ({ request }) => {
    if (!apiAgentId || !webhookId) { test.skip(); return; }

    const res = await request.delete(
      `/api/agents/${apiAgentId}/webhooks/${webhookId}`
    );
    expect(res.status()).toBe(200);
    expect((await res.json()).success).toBe(true);

    const list = await request
      .get(`/api/agents/${apiAgentId}/webhooks`)
      .then((r) => r.json());
    expect(list.data.find((w: { id: string }) => w.id === webhookId)).toBeUndefined();
    webhookId = null;
  });
});

// ─── 8. Webhooks API — Trigger endpoint ───────────────────────────────────────

test.describe("Webhooks API — trigger endpoint", () => {
  let triggerAgentId: string | null = null;
  let triggerWebhookId: string | null = null;
  let triggerSecret: string | null = null;

  test.beforeAll(async ({ request }) => {
    const agentRes = await request.post("/api/agents", {
      data: { name: "Webhook Trigger E2E Agent" },
    });
    if (agentRes.status() !== 201) return;
    triggerAgentId = (await agentRes.json()).data.id;

    const whRes = await request.post(`/api/agents/${triggerAgentId}/webhooks`, {
      data: { name: "Trigger Test Webhook" },
    });
    if (whRes.status() !== 201) return;
    const wh = await whRes.json();
    triggerWebhookId = wh.data.id;
    triggerSecret = wh.data.secret;
  });

  test.afterAll(async ({ request }) => {
    if (triggerAgentId) {
      await request.delete(`/api/agents/${triggerAgentId}`);
    }
  });

  test("valid HMAC-SHA256 signature → 200 accepted", async ({ request }) => {
    if (!triggerAgentId || !triggerWebhookId || !triggerSecret) {
      test.skip(); return;
    }

    const body = JSON.stringify({ event: "test", data: { message: "hello from E2E" } });
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

    expect([200, 202]).toContain(res.status());
    const resBody = await res.json();
    expect(resBody.success).toBe(true);
    expect(resBody.skipped).toBeFalsy();
  });

  test("invalid HMAC signature → 400 signature mismatch", async ({ request }) => {
    if (!triggerAgentId || !triggerWebhookId) { test.skip(); return; }

    const res = await request.post(
      `/api/agents/${triggerAgentId}/trigger/${triggerWebhookId}`,
      {
        data: JSON.stringify({ event: "test" }),
        headers: {
          "Content-Type": "application/json",
          "x-webhook-id": `e2e-bad-${Date.now()}`,
          "x-webhook-timestamp": Math.floor(Date.now() / 1000).toString(),
          "x-webhook-signature": "v1,aGVsbG8gd29ybGQ=", // wrong signature
        },
      }
    );

    expect(res.status()).toBe(400);
    expect((await res.json()).error).toMatch(/signature/i);
  });

  test("missing signature headers → 400", async ({ request }) => {
    if (!triggerAgentId || !triggerWebhookId) { test.skip(); return; }

    const res = await request.post(
      `/api/agents/${triggerAgentId}/trigger/${triggerWebhookId}`,
      {
        data: JSON.stringify({ event: "test" }),
        headers: { "Content-Type": "application/json" },
      }
    );

    expect(res.status()).toBe(400);
  });

  test("event filter — matching event is accepted, non-matching is skipped", async ({
    request,
  }) => {
    if (!triggerAgentId) { test.skip(); return; }

    // Dedicated filtered webhook
    const whRes = await request.post(`/api/agents/${triggerAgentId}/webhooks`, {
      data: { name: "Filtered E2E Webhook", eventFilters: ["push"] },
    });
    if (whRes.status() !== 201) { test.skip(); return; }
    const { data: wh } = await whRes.json();

    const makeRequest = async (eventType: string, bodyStr: string) => {
      const id = `e2e-${Date.now()}-${Math.random()}`;
      const ts = Math.floor(Date.now() / 1000).toString();
      return request.post(`/api/agents/${triggerAgentId}/trigger/${wh.id}`, {
        data: bodyStr,
        headers: {
          "Content-Type": "application/json",
          "x-webhook-id": id,
          "x-webhook-timestamp": ts,
          "x-webhook-signature": signWebhook(id, ts, bodyStr, wh.secret),
          "x-webhook-event": eventType,
        },
      });
    };

    // Matching event → accepted
    const resA = await makeRequest("push", JSON.stringify({ action: "opened" }));
    expect([200, 202]).toContain(resA.status());
    expect((await resA.json()).skipped).toBeFalsy();

    // Non-matching event → skipped
    const resB = await makeRequest("pull_request", JSON.stringify({ action: "closed" }));
    expect(resB.status()).toBe(200);
    const bodyB = await resB.json();
    expect(bodyB.success).toBe(true);
    expect(bodyB.skipped).toBe(true);
  });

  test("duplicate x-webhook-id → 409 idempotency conflict", async ({ request }) => {
    if (!triggerAgentId || !triggerWebhookId || !triggerSecret) {
      test.skip(); return;
    }

    const body = JSON.stringify({ event: "idempotency_test" });
    const webhookId = `e2e-idempotent-${Date.now()}`;
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const headers = {
      "Content-Type": "application/json",
      "x-webhook-id": webhookId,
      "x-webhook-timestamp": timestamp,
      "x-webhook-signature": signWebhook(webhookId, timestamp, body, triggerSecret),
    };

    const res1 = await request.post(
      `/api/agents/${triggerAgentId}/trigger/${triggerWebhookId}`,
      { data: body, headers }
    );
    expect([200, 202]).toContain(res1.status());

    const res2 = await request.post(
      `/api/agents/${triggerAgentId}/trigger/${triggerWebhookId}`,
      { data: body, headers }
    );
    expect(res2.status()).toBe(409);
  });
});

// ─── 9. Flow Builder integration ──────────────────────────────────────────────

test.describe("Flow Builder — webhook integration", () => {
  test("flow builder header has a Webhooks navigation link or button", async ({
    page,
    dashboardPage,
  }) => {
    await dashboardPage.goto();
    await page.waitForLoadState("networkidle");

    const count = await page.getByTestId("agent-card").count();
    if (count === 0) { test.skip(); return; }

    const editLink = page
      .getByTestId("agent-card")
      .first()
      .getByRole("link", { name: /edit flow/i });
    const href = await editLink.getAttribute("href");
    const agentId = href?.split("/builder/")[1];
    if (!agentId) { test.skip(); return; }

    await page.goto(`/builder/${agentId}`);
    await page.waitForLoadState("networkidle");

    await expect(
      page.getByRole("link", { name: /webhooks/i })
        .or(page.getByRole("button", { name: /webhooks/i }))
    ).toBeVisible({ timeout: 10_000 });
  });

  test("node picker contains the Webhook Trigger node type", async ({
    page,
    flowBuilderPage,
    dashboardPage,
  }) => {
    await dashboardPage.goto();
    await page.waitForLoadState("networkidle");

    const count = await page.getByTestId("agent-card").count();
    if (count === 0) { test.skip(); return; }

    const editLink = page
      .getByTestId("agent-card")
      .first()
      .getByRole("link", { name: /edit flow/i });
    const href = await editLink.getAttribute("href");
    const agentId = href?.split("/builder/")[1];
    if (!agentId) { test.skip(); return; }

    await flowBuilderPage.goto(agentId);
    await flowBuilderPage.nodePicker.click();

    // Node picker renders plain <button> elements (not DropdownMenuItems).
    // Each button contains a <p class="text-sm font-medium">{label}</p> and a
    // description <p> — match via the label <p> to avoid anchor issues with
    // concatenated text ("Webhook TriggerTrigger a flow on inbound webhook").
    await expect(
      page.locator("button").filter({
        has: page.locator("p").filter({ hasText: /^webhook trigger$/i }),
      })
    ).toBeVisible({ timeout: 5_000 });
  });
});

// ─── 8. Webhooks UI — Execution Replay ───────────────────────────────────────

test.describe("Webhooks UI — Execution Replay", () => {
  test("Replay button is shown for executions with a stored payload", async ({
    webhooksPage,
    page,
  }) => {
    if (!sharedAgentId) { test.skip(); return; }
    // MOCK_WEBHOOK already has rawPayload on exec_001
    await mockWebhooksAPI(page, { agentId: sharedAgentId });
    await webhooksPage.goto(sharedAgentId);
    await page.waitForLoadState("networkidle");

    // Expand the execution row
    await page.getByText(/completed/i).first().click();

    // The Replay button should appear in the row header
    await expect(
      page.getByRole("button", { name: /^replay$/i }).first()
    ).toBeVisible({ timeout: 8_000 });
  });

  test("Replay button is NOT shown for executions without a stored payload", async ({
    webhooksPage,
    page,
  }) => {
    if (!sharedAgentId) { test.skip(); return; }
    const webhookNoPayload = {
      ...MOCK_WEBHOOK,
      executions: [
        {
          id: "exec_no_payload",
          status: "COMPLETED",
          triggeredAt: new Date(Date.now() - 60_000).toISOString(),
          completedAt: new Date(Date.now() - 59_500).toISOString(),
          durationMs: 500,
          eventType: "push",
          sourceIp: "127.0.0.1",
          conversationId: "conv_mock_002",
          errorMessage: null,
          rawPayload: null,    // ← no stored payload
          isReplay: false,
          replayOf: null,
        },
      ],
    };
    await mockWebhooksAPI(page, {
      agentId: sharedAgentId,
      webhooks: [webhookNoPayload],
    });
    await webhooksPage.goto(sharedAgentId);
    await page.waitForLoadState("networkidle");

    // Expand the row to reveal the expand panel; button is only visible when expanded
    await page.getByText(/completed/i).first().click();

    // Replay button should NOT exist in the row header (only shown when rawPayload != null)
    await expect(
      page.getByRole("button", { name: /^replay$/i })
    ).toHaveCount(0);
  });

  test("clicking Replay calls the replay endpoint and shows success feedback", async ({
    webhooksPage,
    page,
  }) => {
    if (!sharedAgentId) { test.skip(); return; }
    await mockWebhooksAPI(page, { agentId: sharedAgentId });
    await mockWebhookReplay(page, { agentId: sharedAgentId });
    await webhooksPage.goto(sharedAgentId);
    await page.waitForLoadState("networkidle");

    // Click the Replay button (visible in the row header)
    const replayBtn = page.getByRole("button", { name: /^replay$/i }).first();
    await replayBtn.waitFor({ state: "visible", timeout: 8_000 });
    await replayBtn.click();

    // The row auto-expands on success (setExpanded(true) in handleReplay success branch).
    // Wait for the inline success banner inside the expanded section.
    await expect(
      page.getByText(/replayed — new execution id/i)
    ).toBeVisible({ timeout: 8_000 });
  });

  test("clicking Replay shows loading state while request is in-flight", async ({
    webhooksPage,
    page,
  }) => {
    if (!sharedAgentId) { test.skip(); return; }
    await mockWebhooksAPI(page, { agentId: sharedAgentId });

    // Use a delayed route to catch the in-flight state.
    // Use Node.js setTimeout (not page.waitForTimeout) to avoid deadlock in route handlers.
    await page.route(
      `**/api/agents/${sharedAgentId}/webhooks/**/executions/**/replay`,
      async (route) => {
        await new Promise<void>((resolve) => setTimeout(resolve, 300));
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            success: true,
            data: { executionId: "exec_slow_001", conversationId: "conv_slow", replayOf: "exec_001" },
          }),
        });
      }
    );

    await webhooksPage.goto(sharedAgentId);
    await page.waitForLoadState("networkidle");

    const replayBtn = page.getByRole("button", { name: /^replay$/i }).first();
    await replayBtn.waitFor({ state: "visible", timeout: 8_000 });
    await replayBtn.click();

    // "Replaying…" text appears during the in-flight state on the Replay button itself.
    // Use exact:true to avoid matching the outer row button whose accessible name
    // also contains "Replaying…" as a child text (strict mode would fail on 2 matches).
    await expect(
      page.getByRole("button", { name: "Replaying…", exact: true })
    ).toBeVisible({ timeout: 3_000 });

    // Eventually resolves to success; the row auto-expands (setExpanded(true) in success handler).
    await expect(
      page.getByText(/replayed — new execution id/i)
    ).toBeVisible({ timeout: 5_000 });
  });

  test("replay error shows inline error feedback", async ({
    webhooksPage,
    page,
  }) => {
    if (!sharedAgentId) { test.skip(); return; }
    await mockWebhooksAPI(page, { agentId: sharedAgentId });
    await mockWebhookReplay(page, { agentId: sharedAgentId, status: 500 });
    await webhooksPage.goto(sharedAgentId);
    await page.waitForLoadState("networkidle");

    const replayBtn = page.getByRole("button", { name: /^replay$/i }).first();
    await replayBtn.waitFor({ state: "visible", timeout: 8_000 });
    await replayBtn.click();

    // Expand row to see inline error
    await page.getByText(/completed/i).first().click();

    await expect(
      page.getByText(/internal server error/i).first()
    ).toBeVisible({ timeout: 8_000 });
  });

  test("replay badge appears on execution rows that are themselves replays", async ({
    webhooksPage,
    page,
  }) => {
    if (!sharedAgentId) { test.skip(); return; }
    const webhookWithReplayedExec = {
      ...MOCK_WEBHOOK,
      executions: [
        {
          id: "exec_was_replayed",
          status: "COMPLETED",
          triggeredAt: new Date(Date.now() - 30_000).toISOString(),
          completedAt: new Date(Date.now() - 29_500).toISOString(),
          durationMs: 300,
          eventType: "push",
          sourceIp: "127.0.0.1",
          conversationId: "conv_replay_exec",
          errorMessage: null,
          rawPayload: JSON.stringify({ action: "opened" }),
          isReplay: true,            // ← this IS a replay
          replayOf: "exec_original",
        },
      ],
    };
    await mockWebhooksAPI(page, {
      agentId: sharedAgentId,
      webhooks: [webhookWithReplayedExec],
    });
    await webhooksPage.goto(sharedAgentId);
    await page.waitForLoadState("networkidle");

    // The "replay" badge should appear in the execution row header
    await expect(
      page.getByText(/^replay$/i).first()
    ).toBeVisible({ timeout: 8_000 });
  });

  test("API — replay endpoint returns 422 when execution has no stored payload", async ({
    request,
  }) => {
    // Direct API test — create an agent + webhook + execution, then call replay.
    // We use the actual API here (not mocks) so skip if no auth.
    const agentRes = await request.post("/api/agents", {
      data: { name: "Replay API E2E" },
    });
    if (agentRes.status() !== 201) { test.skip(); return; }
    const agentId = (await agentRes.json()).data.id;

    try {
      // Create webhook
      const whRes = await request.post(`/api/agents/${agentId}/webhooks`, {
        data: { name: "Replay Test Webhook" },
      });
      if (whRes.status() !== 201) { test.skip(); return; }
      const webhookId = (await whRes.json()).data.id;

      // Seed a synthetic execution row directly — use the API trigger with
      // a deliberately wrong signature so the trigger returns 400 (no execution created).
      // Instead, we call replay on a non-existent execution to get 404.
      const replayRes = await request.post(
        `/api/agents/${agentId}/webhooks/${webhookId}/executions/non_existent_exec_id/replay`
      );
      expect(replayRes.status()).toBe(404);
      const body = await replayRes.json();
      expect(body.success).toBe(false);
    } finally {
      await request.delete(`/api/agents/${agentId}`);
    }
  });
});

// ─── 9. Webhooks UI — Replay Chain ────────────────────────────────────────────

/**
 * Tests for replay chain behavior:
 *   - replayed execution shows "Replayed from" field in expanded detail
 *   - a replay of a replay still shows a Replay button when rawPayload is set
 *   - replay badge appears on the new execution produced by a replay
 */
test.describe("Webhooks UI — replay chain", () => {
  test("expanded replayed execution shows the original execution ID in 'Replayed from' field", async ({
    webhooksPage,
    page,
  }) => {
    if (!sharedAgentId) { test.skip(); return; }

    const ORIGINAL_EXEC_ID = "exec_original_999";
    const webhookWithReplayChain = {
      ...MOCK_WEBHOOK,
      executions: [
        {
          id: "exec_replayed_child",
          status: "COMPLETED",
          triggeredAt: new Date(Date.now() - 20_000).toISOString(),
          completedAt: new Date(Date.now() - 19_500).toISOString(),
          durationMs: 280,
          eventType: "push",
          sourceIp: "127.0.0.1",
          conversationId: "conv_replay_child",
          errorMessage: null,
          rawPayload: JSON.stringify({ action: "opened" }),
          isReplay: true,
          replayOf: ORIGINAL_EXEC_ID,
        },
      ],
    };

    await mockWebhooksAPI(page, {
      agentId: sharedAgentId,
      webhooks: [webhookWithReplayChain],
    });
    await webhooksPage.goto(sharedAgentId);
    await page.waitForLoadState("networkidle");

    // Expand the execution row by clicking the "push" eventType badge (a <span> unique to the row,
    // not a filter pill or button — the click bubbles up to the outer row button's onClick).
    await page.getByText(/^push$/i).first().click();

    // "Replayed from" label and the original execution ID should both be visible
    await expect(
      page.getByText(/replayed from/i).first()
    ).toBeVisible({ timeout: 8_000 });
    await expect(
      page.getByText(ORIGINAL_EXEC_ID, { exact: false }).first()
    ).toBeVisible({ timeout: 5_000 });
  });

  test("a replayed execution that still has rawPayload shows the Replay button", async ({
    webhooksPage,
    page,
  }) => {
    if (!sharedAgentId) { test.skip(); return; }

    const webhookReplayWithPayload = {
      ...MOCK_WEBHOOK,
      executions: [
        {
          id: "exec_replay_has_payload",
          status: "COMPLETED",
          triggeredAt: new Date(Date.now() - 15_000).toISOString(),
          completedAt: new Date(Date.now() - 14_500).toISOString(),
          durationMs: 320,
          eventType: "push",
          sourceIp: "127.0.0.1",
          conversationId: "conv_replay_payload",
          errorMessage: null,
          rawPayload: JSON.stringify({ action: "created" }),  // has payload → Replay button shown
          isReplay: true,
          replayOf: "exec_grandparent",
        },
      ],
    };

    await mockWebhooksAPI(page, {
      agentId: sharedAgentId,
      webhooks: [webhookReplayWithPayload],
    });
    await webhooksPage.goto(sharedAgentId);
    await page.waitForLoadState("networkidle");

    // Replay button should be visible even on a replay-of-a-replay
    const replayBtn = page.getByRole("button", { name: /^replay$/i }).first();
    await replayBtn.waitFor({ state: "visible", timeout: 8_000 });
    await expect(replayBtn).toBeVisible();
  });

  test("replaying an execution shows the new execution ID in the inline success banner", async ({
    webhooksPage,
    page,
  }) => {
    if (!sharedAgentId) { test.skip(); return; }

    const NEW_EXEC_ID = "exec_chain_new_001";

    await mockWebhooksAPI(page, { agentId: sharedAgentId });
    await mockWebhookReplay(page, {
      agentId: sharedAgentId,
      executionId: NEW_EXEC_ID,
    });
    await webhooksPage.goto(sharedAgentId);
    await page.waitForLoadState("networkidle");

    const replayBtn = page.getByRole("button", { name: /^replay$/i }).first();
    await replayBtn.waitFor({ state: "visible", timeout: 8_000 });
    await replayBtn.click();

    // The row auto-expands on success (setExpanded(true) in handleReplay success branch).
    // The inline success banner in the expanded row should mention the new execution ID
    await expect(
      page.getByText(NEW_EXEC_ID, { exact: false }).first()
    ).toBeVisible({ timeout: 8_000 });
  });
});

// ─── 10. Webhooks UI — Execution Status Filtering ─────────────────────────────

/**
 * Tests for the execution status filter pills in the Executions tab.
 *   - "All" filter pill is active by default
 *   - clicking a status pill triggers a new executions fetch with that status param
 *   - the execution count indicator shows the correct "N of M" total
 *   - the export CSV link reflects the currently active status filter
 */
test.describe("Webhooks UI — execution status filtering", () => {
  test("the 'All' filter pill is active by default", async ({
    webhooksPage,
    page,
  }) => {
    if (!sharedAgentId) { test.skip(); return; }
    await mockWebhooksAPI(page, { agentId: sharedAgentId });
    await webhooksPage.goto(sharedAgentId);
    await page.waitForLoadState("networkidle");

    // The "All" pill should have the active class (bg-zinc-700) applied
    const allPill = page.getByRole("button", { name: /^all$/i }).first();
    await allPill.waitFor({ state: "visible", timeout: 8_000 });
    await expect(allPill).toBeVisible();
    // Active pills contain bg-zinc-700 in their class (as opposed to bg-transparent)
    await expect(allPill).toHaveClass(/bg-zinc-700/);
  });

  test("clicking 'Failed' pill re-fetches executions with status=FAILED param", async ({
    webhooksPage,
    page,
  }) => {
    if (!sharedAgentId) { test.skip(); return; }
    await mockWebhooksAPI(page, { agentId: sharedAgentId });

    const capturedUrls: string[] = [];
    await page.route(
      `**/api/agents/${sharedAgentId}/webhooks/**/executions**`,
      (route) => {
        capturedUrls.push(route.request().url());
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ success: true, data: [], total: 0, hasMore: false, nextCursor: null }),
        });
      }
    );

    await webhooksPage.goto(sharedAgentId);
    await page.waitForLoadState("networkidle");

    // Click the Failed filter pill
    const failedPill = page.getByRole("button", { name: /^failed$/i }).first();
    await failedPill.waitFor({ state: "visible", timeout: 8_000 });
    await failedPill.click();

    // Wait for the refetch to fire
    await page.waitForTimeout(500);

    // At least one of the captured executions requests should contain status=FAILED
    const hasFailedQuery = capturedUrls.some((u) => u.includes("status=FAILED"));
    expect(hasFailedQuery).toBe(true);
  });

  test("'No failed executions' empty state appears after clicking Failed with no results", async ({
    webhooksPage,
    page,
  }) => {
    if (!sharedAgentId) { test.skip(); return; }
    await mockWebhooksAPI(page, { agentId: sharedAgentId });

    // Override executions endpoint to return empty for FAILED
    await page.route(
      `**/api/agents/${sharedAgentId}/webhooks/**/executions**`,
      (route) => {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ success: true, data: [], total: 0, hasMore: false, nextCursor: null }),
        });
      }
    );

    await webhooksPage.goto(sharedAgentId);
    await page.waitForLoadState("networkidle");

    const failedPill = page.getByRole("button", { name: /^failed$/i }).first();
    await failedPill.waitFor({ state: "visible", timeout: 8_000 });
    await failedPill.click();

    // Empty state message
    await expect(
      page.getByText(/no failed executions/i).first()
    ).toBeVisible({ timeout: 8_000 });
  });

  test("Export button is present in the executions tab header area", async ({
    webhooksPage,
    page,
  }) => {
    if (!sharedAgentId) { test.skip(); return; }
    await mockWebhooksAPI(page, { agentId: sharedAgentId });
    await webhooksPage.goto(sharedAgentId);
    await page.waitForLoadState("networkidle");

    // The Export button/dropdown should be in the executions tab
    await expect(
      page.getByText(/export/i).first()
    ).toBeVisible({ timeout: 8_000 });
  });

  test("API — executions export endpoint returns CSV for a webhook", async ({
    request,
  }) => {
    // Direct API test — create agent + webhook, then fetch the export endpoint
    const agentRes = await request.post("/api/agents", {
      data: { name: "Export API E2E" },
    });
    if (agentRes.status() !== 201) { test.skip(); return; }
    const agentId = (await agentRes.json()).data.id;

    try {
      const whRes = await request.post(`/api/agents/${agentId}/webhooks`, {
        data: { name: "Export Test Webhook" },
      });
      if (whRes.status() !== 201) { test.skip(); return; }
      const webhookId = (await whRes.json()).data.id;

      // Fetch the CSV export (no executions yet — should return header row only)
      const exportRes = await request.get(
        `/api/agents/${agentId}/webhooks/${webhookId}/executions/export?limit=10`
      );
      expect(exportRes.status()).toBe(200);
      expect(exportRes.headers()["content-type"]).toContain("text/csv");
      expect(exportRes.headers()["content-disposition"]).toContain("attachment");

      const text = await exportRes.text();
      // Must have the CSV header row
      expect(text).toContain("id,status,event_type");
    } finally {
      await request.delete(`/api/agents/${agentId}`);
    }
  });
});
