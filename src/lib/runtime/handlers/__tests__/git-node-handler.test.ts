import { describe, it, expect, vi, beforeEach } from "vitest";
import { gitNodeHandler } from "../git-node-handler";
import type { RuntimeContext } from "../../types";

const mockExecFile = vi.fn();

vi.mock("node:child_process", () => ({
  execFile: (...args: unknown[]) => {
    const callback = args[args.length - 1];
    if (typeof callback === "function") {
      const result = mockExecFile(...args.slice(0, -1));
      if (result instanceof Promise) {
        result.then(
          (r: { stdout: string; stderr: string }) => callback(null, r.stdout, r.stderr),
          (e: Error) => callback(e),
        );
      }
    }
  },
}));

vi.mock("node:util", () => ({
  promisify: (fn: unknown) => (...args: unknown[]) => {
    return new Promise((resolve, reject) => {
      mockExecFile(...args)
        .then((r: { stdout: string; stderr: string }) => resolve(r))
        .catch((e: Error) => reject(e));
    });
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

function makeNode(overrides: Record<string, unknown> = {}) {
  return {
    id: "node-1",
    type: "git_node",
    data: {
      label: "Git",
      workingDir: "/tmp/project",
      branch: "feat/test-branch",
      commitMessage: "feat: test commit",
      operations: ["checkout_branch", "add", "commit", "push"],
      outputVariable: "gitResult",
      nextNodeId: "next-1",
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

describe("gitNodeHandler", () => {
  beforeEach(() => {
    mockExecFile.mockReset();
  });

  it("runs all git operations and returns success", async () => {
    mockExecFile.mockResolvedValue({ stdout: "[feat/test-branch abc1234] feat: test commit", stderr: "" });

    const result = await gitNodeHandler(makeNode() as never, makeContext());

    expect(result.nextNodeId).toBe("next-1");
    const output = result.updatedVariables?.gitResult as Record<string, unknown>;
    expect(output.success).toBe(true);
    expect(output.branch).toBe("feat/test-branch");
    expect(output.pushed).toBe(true);
  });

  it("runs only specified operations", async () => {
    mockExecFile.mockResolvedValue({ stdout: "", stderr: "" });

    const result = await gitNodeHandler(
      makeNode({ operations: ["add", "commit"] }) as never,
      makeContext(),
    );

    expect(result.nextNodeId).toBe("next-1");
    const output = result.updatedVariables?.gitResult as Record<string, unknown>;
    expect(output.pushed).toBe(false);
  });

  it("returns error result when git command fails", async () => {
    mockExecFile.mockRejectedValue(new Error("fatal: not a git repository"));

    const result = await gitNodeHandler(makeNode() as never, makeContext());

    expect(result.nextNodeId).toBeNull();
    const output = result.updatedVariables?.gitResult as Record<string, unknown>;
    expect(output.success).toBe(false);
    expect(output.message).toContain("Git operation failed");
  });

  it("interpolates branch variable from context", async () => {
    mockExecFile.mockResolvedValue({ stdout: "", stderr: "" });

    const result = await gitNodeHandler(
      makeNode({ branch: "feat/{{featureName}}" }) as never,
      makeContext({ featureName: "new-auth" }),
    );

    const output = result.updatedVariables?.gitResult as Record<string, unknown>;
    expect(output.branch).toBe("feat/new-auth");
  });

  it("does not throw when node data is empty", async () => {
    mockExecFile.mockResolvedValue({ stdout: "", stderr: "" });

    await expect(
      gitNodeHandler(
        { id: "n1", type: "git_node", data: {} } as never,
        makeContext(),
      ),
    ).resolves.toBeDefined();
  });
});
