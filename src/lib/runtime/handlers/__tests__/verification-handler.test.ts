import { describe, it, expect, vi, beforeEach } from "vitest";
import type { RuntimeContext } from "../../types";
import type { FlowContent } from "@/types";

// Mock verification-commands module
vi.mock("../../verification-commands", () => ({
  runVerificationCommands: vi.fn(),
}));

// Mock logger
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { verificationHandler } from "../verification-handler";
import { runVerificationCommands } from "../../verification-commands";

const mockRunCommands = vi.mocked(runVerificationCommands);

function makeContext(overrides?: Partial<RuntimeContext>): RuntimeContext {
  return {
    agentId: "test-agent",
    conversationId: "test-conv",
    flowContent: { nodes: [], edges: [], variables: [] } as FlowContent,
    variables: {},
    messages: [],
    ...overrides,
  };
}

function makeNode(data: Record<string, unknown> = {}) {
  return {
    id: "verify-1",
    type: "verification" as const,
    position: { x: 0, y: 0 },
    data: { label: "Verify", ...data },
  };
}

describe("verificationHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("auto-passes when no checks are configured", async () => {
    const result = await verificationHandler(
      makeNode({ checks: [] }),
      makeContext(),
    );

    expect(result.nextNodeId).toBe("passed");
    expect(result.messages[0].content).toContain("no checks configured");
    expect(result.updatedVariables?.verificationResults).toEqual([]);
  });

  it("auto-passes when checks is not an array", async () => {
    const result = await verificationHandler(
      makeNode({ checks: "invalid" }),
      makeContext(),
    );

    expect(result.nextNodeId).toBe("passed");
  });

  it("routes to passed when all checks succeed", async () => {
    mockRunCommands.mockResolvedValueOnce({
      allPassed: true,
      output: "✅ npm test\nAll good",
      results: [
        { command: "npm test", passed: true, output: "All good", durationMs: 100 },
      ],
    });

    const result = await verificationHandler(
      makeNode({
        checks: [{ type: "test", command: "npm test", label: "Tests" }],
      }),
      makeContext(),
    );

    expect(result.nextNodeId).toBe("passed");
    expect(result.messages[0].content).toContain("✅");
    expect(result.messages[0].content).toContain("passed");
    const results = result.updatedVariables?.verificationResults as Record<string, unknown>[];
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      type: "test",
      command: "npm test",
      label: "Tests",
      exitCode: 0,
    });
  });

  it("routes to failed when any check fails", async () => {
    mockRunCommands.mockResolvedValueOnce({
      allPassed: false,
      output: "❌ eslint src/\nError found",
      results: [
        { command: "npm test", passed: true, output: "ok", durationMs: 50 },
        { command: "eslint src/", passed: false, output: "Error found", durationMs: 80 },
      ],
    });

    const result = await verificationHandler(
      makeNode({
        checks: [
          { type: "test", command: "npm test" },
          { type: "lint", command: "eslint src/" },
        ],
      }),
      makeContext(),
    );

    expect(result.nextNodeId).toBe("failed");
    expect(result.messages[0].content).toContain("❌");
    const results = result.updatedVariables?.verificationResults as Record<string, unknown>[];
    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({ exitCode: 0 });
    expect(results[1]).toMatchObject({ exitCode: 1 });
  });

  it("stores results in custom outputVariable", async () => {
    mockRunCommands.mockResolvedValueOnce({
      allPassed: true,
      output: "✅",
      results: [
        { command: "tsc --noEmit", passed: true, output: "ok", durationMs: 200 },
      ],
    });

    const result = await verificationHandler(
      makeNode({
        checks: [{ type: "build", command: "tsc --noEmit" }],
        outputVariable: "buildResults",
      }),
      makeContext(),
    );

    expect(result.updatedVariables?.buildResults).toBeDefined();
    expect(result.updatedVariables?.verificationResults).toBeUndefined();
  });

  it("handles errors gracefully (returns failed, never throws)", async () => {
    mockRunCommands.mockRejectedValueOnce(new Error("execFile crashed"));

    const result = await verificationHandler(
      makeNode({
        checks: [{ type: "test", command: "npm test" }],
      }),
      makeContext(),
    );

    expect(result.nextNodeId).toBe("failed");
    expect(result.messages[0].content).toContain("error");
  });

  it("filters out invalid check entries", async () => {
    mockRunCommands.mockResolvedValueOnce({
      allPassed: true,
      output: "✅",
      results: [
        { command: "npm test", passed: true, output: "ok", durationMs: 50 },
      ],
    });

    const result = await verificationHandler(
      makeNode({
        checks: [
          { type: "test", command: "npm test" },
          null,
          "not an object",
          { type: "build" }, // missing command
          { command: 123 }, // command not a string
        ],
      }),
      makeContext(),
    );

    // Only the first valid check should be processed
    expect(mockRunCommands).toHaveBeenCalledWith(["npm test"], "test-agent");
  });

  it("defaults check type to custom for unknown types", async () => {
    mockRunCommands.mockResolvedValueOnce({
      allPassed: true,
      output: "✅",
      results: [
        { command: "npm test", passed: true, output: "ok", durationMs: 50 },
      ],
    });

    const result = await verificationHandler(
      makeNode({
        checks: [{ type: "unknown_type", command: "npm test" }],
      }),
      makeContext(),
    );

    const results = result.updatedVariables?.verificationResults as Record<string, unknown>[];
    expect(results[0]).toMatchObject({ type: "custom" });
  });

  it("passes agentId to runVerificationCommands", async () => {
    mockRunCommands.mockResolvedValueOnce({
      allPassed: true,
      output: "",
      results: [
        { command: "npm test", passed: true, output: "", durationMs: 10 },
      ],
    });

    await verificationHandler(
      makeNode({ checks: [{ type: "test", command: "npm test" }] }),
      makeContext({ agentId: "my-agent-id" }),
    );

    expect(mockRunCommands).toHaveBeenCalledWith(["npm test"], "my-agent-id");
  });

  it("reports correct passed and failed counts in summary", async () => {
    mockRunCommands.mockResolvedValueOnce({
      allPassed: false,
      output: "",
      results: [
        { command: "npm test", passed: true, output: "", durationMs: 10 },
        { command: "eslint .", passed: false, output: "err", durationMs: 20 },
        { command: "tsc", passed: true, output: "", durationMs: 15 },
      ],
    });

    const result = await verificationHandler(
      makeNode({
        checks: [
          { type: "test", command: "npm test" },
          { type: "lint", command: "eslint ." },
          { type: "build", command: "tsc" },
        ],
      }),
      makeContext(),
    );

    expect(result.messages[0].content).toContain("1/3 checks failed");
  });
});
