import { describe, it, expect, vi, beforeEach } from "vitest";
import { processRunnerHandler } from "../process-runner-handler";
import type { RuntimeContext } from "../../types";

const mockRunVerificationCommands = vi.fn();

vi.mock("../../verification-commands", () => ({
  runVerificationCommands: (...args: unknown[]) => mockRunVerificationCommands(...args),
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

function makeNode(overrides: Record<string, unknown> = {}) {
  return {
    id: "node-1",
    type: "process_runner",
    data: {
      label: "Process Runner",
      command: "pnpm build",
      workingDir: "/tmp/project",
      timeoutMs: 300000,
      outputVariable: "processResult",
      ...overrides,
    },
  };
}

function makeContext(): RuntimeContext {
  return {
    agentId: "agent-1",
    conversationId: "conv-1",
    variables: {},
    history: [],
    nodes: [],
    edges: [],
  } as unknown as RuntimeContext;
}

describe("processRunnerHandler", () => {
  beforeEach(() => {
    mockRunVerificationCommands.mockReset();
  });

  it("returns passed nextNodeId when command succeeds", async () => {
    mockRunVerificationCommands.mockResolvedValue({
      allPassed: true,
      output: "Build succeeded",
      results: [{ command: "pnpm build", passed: true, output: "Build succeeded", durationMs: 5000 }],
    });

    const result = await processRunnerHandler(makeNode() as never, makeContext());

    expect(result.nextNodeId).toBe("passed");
    const output = result.updatedVariables?.processResult as Record<string, unknown>;
    expect(output.success).toBe(true);
    expect(output.exitCode).toBe(0);
  });

  it("returns failed nextNodeId when command fails", async () => {
    mockRunVerificationCommands.mockResolvedValue({
      allPassed: false,
      output: "Build failed",
      results: [{ command: "pnpm build", passed: false, output: "Build failed", durationMs: 3000 }],
    });

    const result = await processRunnerHandler(makeNode() as never, makeContext());

    expect(result.nextNodeId).toBe("failed");
    const output = result.updatedVariables?.processResult as Record<string, unknown>;
    expect(output.success).toBe(false);
    expect(output.exitCode).toBe(1);
  });

  it("returns failed when command is empty", async () => {
    const result = await processRunnerHandler(
      makeNode({ command: "" }) as never,
      makeContext(),
    );

    expect(result.nextNodeId).toBe("failed");
    const output = result.updatedVariables?.processResult as Record<string, unknown>;
    expect(output.success).toBe(false);
    expect(mockRunVerificationCommands).not.toHaveBeenCalled();
  });

  it("returns failed when command is blocked by whitelist", async () => {
    mockRunVerificationCommands.mockResolvedValue({
      allPassed: false,
      output: "⛔ BLOCKED",
      results: [],
    });

    const result = await processRunnerHandler(makeNode() as never, makeContext());

    expect(result.nextNodeId).toBe("failed");
  });

  it("does not throw when runVerificationCommands throws", async () => {
    mockRunVerificationCommands.mockRejectedValue(new Error("unexpected crash"));

    await expect(
      processRunnerHandler(makeNode() as never, makeContext()),
    ).resolves.toBeDefined();

    const result = await processRunnerHandler(makeNode() as never, makeContext());
    expect(result.nextNodeId).toBe("failed");
  });

  it("passes custom timeoutMs to runVerificationCommands", async () => {
    mockRunVerificationCommands.mockResolvedValue({
      allPassed: true,
      output: "",
      results: [{ command: "pnpm test", passed: true, output: "", durationMs: 1000 }],
    });

    await processRunnerHandler(makeNode({ timeoutMs: 120000 }) as never, makeContext());

    expect(mockRunVerificationCommands).toHaveBeenCalledWith(
      ["pnpm build"],
      "agent-1",
      120000,
    );
  });
});
