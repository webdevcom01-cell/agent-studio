import { test, expect } from "@playwright/test";

/**
 * Agent CRUD API tests — no browser, direct HTTP requests.
 * These use the storageState from global setup for auth.
 */
test.describe("Agents API", () => {
  let createdAgentId: string | null = null;

  test("GET /api/agents returns agent list", async ({ request }) => {
    const response = await request.get("/api/agents");
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
  });

  test("POST /api/agents creates a new agent", async ({ request }) => {
    const response = await request.post("/api/agents", {
      data: {
        name: "E2E API Test Agent",
        description: "Created via Playwright API test",
      },
    });

    expect(response.status()).toBe(201);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBeTruthy();
    expect(body.data.name).toBe("E2E API Test Agent");

    createdAgentId = body.data.id;
  });

  test("GET /api/agents/[agentId] returns agent details", async ({
    request,
  }) => {
    if (!createdAgentId) {
      test.skip();
      return;
    }

    const response = await request.get(`/api/agents/${createdAgentId}`);
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(createdAgentId);
    expect(body.data.name).toBe("E2E API Test Agent");
    expect(body.data.flow).toBeDefined();
    expect(body.data.knowledgeBase).toBeDefined();
  });

  test("PATCH /api/agents/[agentId] updates agent", async ({ request }) => {
    if (!createdAgentId) {
      test.skip();
      return;
    }

    const response = await request.patch(`/api/agents/${createdAgentId}`, {
      data: { name: "E2E API Test Agent (Updated)" },
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.name).toBe("E2E API Test Agent (Updated)");
  });

  test("GET /api/agents/[agentId]/flow returns flow content", async ({
    request,
  }) => {
    if (!createdAgentId) {
      test.skip();
      return;
    }

    const response = await request.get(`/api/agents/${createdAgentId}/flow`);
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.content.nodes).toBeDefined();
    expect(body.data.content.edges).toBeDefined();
  });

  test("DELETE /api/agents/[agentId] removes agent", async ({ request }) => {
    if (!createdAgentId) {
      test.skip();
      return;
    }

    const response = await request.delete(`/api/agents/${createdAgentId}`);
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);

    // Verify agent is gone
    const getResponse = await request.get(`/api/agents/${createdAgentId}`);
    expect(getResponse.status()).toBe(404);

    createdAgentId = null;
  });
});
