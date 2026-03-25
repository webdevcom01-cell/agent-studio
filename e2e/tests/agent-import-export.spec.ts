import { test, expect } from "../fixtures/base";
import path from "path";

test.describe("Agent Import/Export", () => {
  test("export agent returns valid JSON", async ({ page }) => {
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

    const response = await page.request.get(`/api/agents/${agentId}/export`);
    expect(response.status()).toBe(200);

    // Export route returns bare AgentExportData (no { success, data } wrapper)
    const data = await response.json();
    expect(data.version).toBe(1);
    expect(data.exportedAt).toBeDefined();
    expect(data.agent).toBeDefined();
    expect(data.agent.name).toBeTruthy();
    expect(data.flow).toBeDefined();
    expect(data.flow.nodes).toBeDefined();
    expect(data.flow.edges).toBeDefined();
  });

  test("import agent from JSON file", async ({ page }) => {
    const samplePath = path.join(
      __dirname,
      "..",
      "test-data",
      "sample-agent.json"
    );

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const initialCount = await page.getByTestId("agent-card").count();

    // Use the hidden file input for import
    const fileInput = page.getByTestId("import-file-input");
    await fileInput.setInputFiles(samplePath);

    // Import API returns 201 for created agents
    await page.waitForResponse(
      (res) =>
        res.url().includes("/api/agents/import") &&
        (res.status() === 200 || res.status() === 201),
      { timeout: 10_000 }
    );

    // Refresh and verify agent count increased
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const newCount = await page.getByTestId("agent-card").count();
    expect(newCount).toBeGreaterThan(initialCount);
  });

  test("import rejects invalid JSON", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Try importing via API with invalid data
    const response = await page.request.post("/api/agents/import", {
      data: { invalid: true },
      headers: { "Content-Type": "application/json" },
    });

    // Should fail validation (422 Unprocessable Entity)
    expect(response.status()).toBe(422);
    const json = await response.json();
    expect(json.success).toBe(false);
  });

  test("full export-import cycle preserves flow content", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const count = await page.getByTestId("agent-card").count();
    if (count === 0) {
      test.skip();
      return;
    }

    // Step 1: Export an agent (returns bare AgentExportData)
    const firstCard = page.getByTestId("agent-card").first();
    const editLink = firstCard.getByRole("link", { name: /edit flow/i });
    const href = await editLink.getAttribute("href");
    const agentId = href?.split("/builder/")[1];

    const exportResponse = await page.request.get(
      `/api/agents/${agentId}/export`
    );
    const exported = await exportResponse.json();
    expect(exported.version).toBe(1);

    // Step 2: Import the exported data (send the full export object)
    const importResponse = await page.request.post("/api/agents/import", {
      data: exported,
      headers: { "Content-Type": "application/json" },
    });
    // Import returns 201
    expect(importResponse.status()).toBe(201);
    const imported = await importResponse.json();
    expect(imported.success).toBe(true);

    // Step 3: Verify imported agent has the same flow
    const importedAgentId = imported.data.id;
    const flowResponse = await page.request.get(
      `/api/agents/${importedAgentId}/flow`
    );
    const flow = await flowResponse.json();
    expect(flow.success).toBe(true);

    // Node count should match
    expect(flow.data.content.nodes.length).toBe(exported.flow.nodes.length);
    expect(flow.data.content.edges.length).toBe(exported.flow.edges.length);
  });
});
