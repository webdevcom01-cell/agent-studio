import { describe, it, expect, vi, beforeEach } from "vitest";

const mockExecuteJS = vi.fn();
const mockExecutePython = vi.fn();

vi.mock("@/lib/sandbox/js-sandbox", () => ({
  executeJS: (...args: unknown[]) => mockExecuteJS(...args),
}));

vi.mock("@/lib/sandbox/python-sandbox", () => ({
  executePython: (...args: unknown[]) => mockExecutePython(...args),
}));

import { codeInterpreterHandler } from "../code-interpreter-handler";
import type { RuntimeContext } from "../../types";
import type { FlowNode, FlowContent } from "@/types";

function makeNode(overrides: Record<string, unknown> = {}): FlowNode {
  return {
    id: "code-1",
    type: "code_interpreter",
    position: { x: 0, y: 0 },
    data: {
      language: "python",
      code: "print('hello')",
      timeout: 30,
      packages: "",
      captureOutput: true,
      outputVariable: "code_result",
      ...overrides,
    },
  };
}

function makeContext(overrides: Partial<RuntimeContext> = {}): RuntimeContext {
  return {
    conversationId: "conv-1",
    agentId: "agent-1",
    flowContent: { nodes: [], edges: [], variables: [] } as FlowContent,
    currentNodeId: "code-1",
    variables: {},
    messageHistory: [],
    isNewConversation: true,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("codeInterpreterHandler", () => {
  it("returns error when no code provided", async () => {
    const result = await codeInterpreterHandler(
      makeNode({ code: "" }),
      makeContext(),
    );
    expect(result.messages[0].content).toContain("no code");
  });

  it("executes Python and captures stdout", async () => {
    mockExecutePython.mockResolvedValueOnce({
      stdout: "hello",
      stderr: "",
      result: "hello",
      charts: [],
      executionTimeMs: 50,
      error: null,
      memoryUsedMb: 10,
    });

    const result = await codeInterpreterHandler(makeNode(), makeContext());
    const output = result.updatedVariables?.code_result as Record<string, unknown>;
    expect(output.stdout).toBe("hello");
    expect(output.error).toBeNull();
  });

  it("executes JavaScript in sandbox", async () => {
    mockExecuteJS.mockResolvedValueOnce({
      stdout: "42",
      stderr: "",
      result: 42,
      executionTimeMs: 10,
      error: null,
    });

    const result = await codeInterpreterHandler(
      makeNode({ language: "javascript", code: "console.log(42)" }),
      makeContext(),
    );
    const output = result.updatedVariables?.code_result as Record<string, unknown>;
    expect(output.result).toBe(42);
  });

  it("handles timeout gracefully", async () => {
    mockExecutePython.mockResolvedValueOnce({
      stdout: "",
      stderr: "Execution timed out after 30000ms",
      result: null,
      charts: [],
      executionTimeMs: 30000,
      error: "Execution timed out after 30000ms",
      memoryUsedMb: 0,
    });

    const result = await codeInterpreterHandler(makeNode(), makeContext());
    const output = result.updatedVariables?.code_result as Record<string, unknown>;
    expect(output.error).toContain("timed out");
  });

  it("blocks dangerous Python imports", async () => {
    mockExecutePython.mockResolvedValueOnce({
      stdout: "",
      stderr: "PermissionError: import of 'os' is not allowed in sandbox",
      result: null,
      charts: [],
      executionTimeMs: 5,
      error: "Blocked import: os",
      memoryUsedMb: 0,
    });

    const result = await codeInterpreterHandler(
      makeNode({ code: "import os\nos.system('ls')" }),
      makeContext(),
    );
    const output = result.updatedVariables?.code_result as Record<string, unknown>;
    expect(output.error).toContain("os");
  });

  it("blocks dangerous JS operations", async () => {
    mockExecuteJS.mockResolvedValueOnce({
      stdout: "",
      stderr: "require is not defined",
      result: null,
      executionTimeMs: 5,
      error: "require is not defined",
    });

    const result = await codeInterpreterHandler(
      makeNode({ language: "javascript", code: "require('os')" }),
      makeContext(),
    );
    const output = result.updatedVariables?.code_result as Record<string, unknown>;
    expect(output.error).toBeTruthy();
  });

  it("resolves template variables in code", async () => {
    mockExecutePython.mockResolvedValueOnce({
      stdout: "test_value",
      stderr: "",
      result: null,
      charts: [],
      executionTimeMs: 10,
      error: null,
      memoryUsedMb: 0,
    });

    await codeInterpreterHandler(
      makeNode({ code: "print('{{data}}')" }),
      makeContext({ variables: { data: "test_value" } }),
    );

    expect(mockExecutePython).toHaveBeenCalledWith(
      "print('test_value')",
      expect.objectContaining({}),
      expect.objectContaining({}),
    );
  });
});
