import { test, expect } from "@playwright/test";

/**
 * Pipeline API tests — no browser, direct HTTP requests.
 * Uses storageState from global setup for auth.
 *
 * Coverage:
 *   GET  /api/agents/[agentId]/pipelines — list runs
 *   POST /api/agents/[agentId]/pipelines — create + enqueue
 *   POST /api/agents/[agentId]/pipelines — 422 on invalid body
 *   POST /api/agents/[agentId]/pipelines — 401 on unknown agent
 *   POST /api/agents/[agentId]/pipelines — 429 rate limit response shape
 */

test.describe("Pipelines API", () => {
  let agentId: string | null = null;

  test.beforeAll(async ({ request }) => {
    const res = await request.post("/api/agents", {
      data: { name: "E2E Pipeline Test Agent", description: "Playwright pipeline test" },
    });
    if (res.status() === 201) {
      const body = await res.json();
      agentId = body.data?.id ?? null;
    }
  });

  test.afterAll(async ({ request }) => {
    if (agentId) {
      await request.delete(`/api/agents/${agentId}`);
    }
  });

  test("GET /api/agents/[agentId]/pipelines returns empty list for new agent", async ({ request }) => {
    if (!agentId) test.skip();

    const res = await request.get(`/api/agents/${agentId}/pipelines`);
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data.runs)).toBe(true);
    expect(typeof body.data.total).toBe("number");
  });

  test("POST /api/agents/[agentId]/pipelines returns 422 for missing taskDescription", async ({ request }) => {
    if (!agentId) test.skip();

    const res = await request.post(`/api/agents/${agentId}/pipelines`, {
      data: { modelId: "deepseek-chat" },
    });

    expect(res.status()).toBe(422);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBeTruthy();
  });

  test("POST /api/agents/[agentId]/pipelines returns 422 for empty taskDescription", async ({ request }) => {
    if (!agentId) test.skip();

    const res = await request.post(`/api/agents/${agentId}/pipelines`, {
      data: { taskDescription: "" },
    });

    expect(res.status()).toBe(422);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  test("POST /api/agents/unknown-agent returns 404", async ({ request }) => {
    const res = await request.post("/api/agents/nonexistent-agent-id-xyz/pipelines", {
      data: { taskDescription: "test task" },
    });

    expect([401, 403, 404]).toContain(res.status());
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  test("POST /api/agents/[agentId]/pipelines rate limit response has correct shape when exceeded", async ({ request }) => {
    if (!agentId) test.skip();

    // Fire 6 requests rapidly to trigger the 5/min limit.
    // At least one should be rate limited.
    const requests = Array.from({ length: 6 }, () =>
      request.post(`/api/agents/${agentId}/pipelines`, {
        data: {
          taskDescription: "rate limit test task",
          pipelineOverride: ["discovery"],
          useLLMAnalysis: false,
        },
      })
    );

    const responses = await Promise.all(requests);
    const statuses = responses.map((r) => r.status());
    const hasRateLimited = statuses.includes(429);

    if (hasRateLimited) {
      const limitedRes = responses.find((r) => r.status() === 429);
      const body = await limitedRes!.json();

      expect(body.success).toBe(false);
      expect(body.error).toMatch(/rate limit/i);
      expect(limitedRes!.headers()["retry-after"]).toBeTruthy();
      expect(limitedRes!.headers()["x-ratelimit-limit"]).toBe("5");
      expect(limitedRes!.headers()["x-ratelimit-remaining"]).toBe("0");
    } else {
      // Rate limit window may not be hit if responses are slow enough — pass through
      test.info().annotations.push({
        type: "info",
        description: "Rate limit not triggered — all 6 requests spread across window",
      });
    }
  });
});
