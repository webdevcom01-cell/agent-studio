import { describe, it, expect, vi, beforeEach } from "vitest";
import { deployTriggerHandler } from "../deploy-trigger-handler";
import type { RuntimeContext } from "../../types";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

function makeNode(overrides: Record<string, unknown> = {}) {
  return {
    id: "node-1",
    type: "deploy_trigger",
    data: {
      label: "Deploy",
      target: "staging",
      projectId: "prj-test",
      pollIntervalMs: 10,
      timeoutMs: 100,
      outputVariable: "deployResult",
      ...overrides,
    },
  };
}

function makeContext(variables: Record<string, unknown> = {}): RuntimeContext {
  return {
    agentId: "agent-1",
    conversationId: "conv-1",
    variables,
    history: [],
    nodes: [],
    edges: [],
  } as unknown as RuntimeContext;
}

describe("deployTriggerHandler", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    vi.stubEnv("VERCEL_TOKEN", "test-token");
  });

  it("returns passed nextNodeId when deployment reaches READY", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "dpl_123", url: "my-project.vercel.app" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ readyState: "READY", url: "my-project.vercel.app" }),
      });

    const result = await deployTriggerHandler(makeNode() as never, makeContext());

    expect(result.nextNodeId).toBe("passed");
    const output = result.updatedVariables?.deployResult as Record<string, unknown>;
    expect(output.status).toBe("READY");
    expect(output.deploymentId).toBe("dpl_123");
  });

  it("returns failed nextNodeId when deployment reaches ERROR", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "dpl_456", url: "my-project.vercel.app" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ readyState: "ERROR" }),
      });

    const result = await deployTriggerHandler(makeNode() as never, makeContext());

    expect(result.nextNodeId).toBe("failed");
    const output = result.updatedVariables?.deployResult as Record<string, unknown>;
    expect(output.status).toBe("ERROR");
  });

  it("returns failed when VERCEL_TOKEN is not set", async () => {
    vi.stubEnv("VERCEL_TOKEN", "");

    const result = await deployTriggerHandler(makeNode() as never, makeContext());

    expect(result.nextNodeId).toBe("failed");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns failed when projectId is not configured", async () => {
    const result = await deployTriggerHandler(
      makeNode({ projectId: "" }) as never,
      makeContext(),
    );

    expect(result.nextNodeId).toBe("failed");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns failed when Vercel API call fails", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ error: { message: "Unauthorized" } }),
    });

    const result = await deployTriggerHandler(makeNode() as never, makeContext());

    expect(result.nextNodeId).toBe("failed");
  });

  it("reads branch from gitResult variable when not specified on node", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "dpl_789", url: "x.vercel.app" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ readyState: "READY" }),
      });

    const context = makeContext({
      gitResult: { branch: "feat/auto-branch", pushed: true, success: true },
    });

    await deployTriggerHandler(makeNode() as never, context);

    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string) as Record<string, unknown>;
    const gitSource = body.gitSource as Record<string, unknown>;
    expect(gitSource.ref).toBe("feat/auto-branch");
  });

  it("does not throw when fetch throws unexpectedly", async () => {
    mockFetch.mockRejectedValue(new Error("network error"));

    await expect(
      deployTriggerHandler(makeNode() as never, makeContext()),
    ).resolves.toBeDefined();
  });
});
