import { describe, it, expect, vi, beforeEach } from "vitest";
import { pythonCodeHandler } from "../python-code-handler";
import type { RuntimeContext } from "../../types";
import type { FlowNode } from "@/types";

// Mock the Python executor so tests don't need a live Python runtime
vi.mock("../../python-executor", () => ({
  executePython: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { executePython } from "../../python-executor";
const mockExecutePython = vi.mocked(executePython);

function makeNode(overrides: Partial<FlowNode["data"]> = {}): FlowNode {
  return {
    id: "py-1",
    type: "python_code",
    position: { x: 0, y: 0 },
    data: {
      label: "Python Code",
      code: "",
      outputVariable: "result",
      ...overrides,
    },
  };
}

function makeContext(variables: Record<string, unknown> = {}): RuntimeContext {
  return {
    conversationId: "conv-1",
    agentId: "agent-1",
    flowContent: { nodes: [], edges: [], variables: [] },
    currentNodeId: "py-1",
    variables,
    messageHistory: [],
    isNewConversation: false,
  };
}

describe("pythonCodeHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Empty code ─────────────────────────────────────────────────────────────

  it("returns empty result for empty code", async () => {
    const result = await pythonCodeHandler(makeNode({ code: "" }), makeContext());
    expect(result.messages).toHaveLength(0);
    expect(result.waitForInput).toBe(false);
    expect(mockExecutePython).not.toHaveBeenCalled();
  });

  it("returns empty result for whitespace-only code", async () => {
    const result = await pythonCodeHandler(makeNode({ code: "   \n\t  " }), makeContext());
    expect(result.messages).toHaveLength(0);
    expect(mockExecutePython).not.toHaveBeenCalled();
  });

  // ── Successful execution ───────────────────────────────────────────────────

  it("stores result in outputVariable on success", async () => {
    mockExecutePython.mockResolvedValueOnce({
      success: true,
      output: "",
      result: 42,
      plots: [],
    });

    const result = await pythonCodeHandler(
      makeNode({ code: "result = 6 * 7" }),
      makeContext(),
    );

    expect(result.updatedVariables).toEqual({ result: 42 });
    expect(result.waitForInput).toBe(false);
  });

  it("emits stdout as a message when output is non-empty", async () => {
    mockExecutePython.mockResolvedValueOnce({
      success: true,
      output: "Hello from Python!\n",
      result: null,
      plots: [],
    });

    const result = await pythonCodeHandler(
      makeNode({ code: 'print("Hello from Python!")' }),
      makeContext(),
    );

    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].content).toBe("Hello from Python!");
  });

  it("emits plot message when there are plots and no stdout", async () => {
    mockExecutePython.mockResolvedValueOnce({
      success: true,
      output: "",
      result: null,
      plots: ["data:image/png;base64,abc123"],
    });

    const result = await pythonCodeHandler(
      makeNode({ code: "import matplotlib.pyplot as plt\nplt.plot([1,2,3])\nplt.show()" }),
      makeContext(),
    );

    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].content).toContain("1 plot");
    expect(result.messages[0].metadata?.plots).toHaveLength(1);
  });

  it("includes plots in metadata when there is also stdout", async () => {
    mockExecutePython.mockResolvedValueOnce({
      success: true,
      output: "plot generated",
      result: null,
      plots: ["data:image/png;base64,abc123"],
    });

    const result = await pythonCodeHandler(
      makeNode({ code: "..." }),
      makeContext(),
    );

    expect(result.messages[0].metadata?.plots).toHaveLength(1);
  });

  it("does not set updatedVariables when outputVariable is empty", async () => {
    mockExecutePython.mockResolvedValueOnce({
      success: true,
      output: "",
      result: "hello",
      plots: [],
    });

    const result = await pythonCodeHandler(
      makeNode({ code: "result = 'hello'", outputVariable: "" }),
      makeContext(),
    );

    expect(result.updatedVariables).toBeUndefined();
  });

  it("passes context variables to the executor", async () => {
    mockExecutePython.mockResolvedValueOnce({
      success: true,
      output: "",
      result: 100,
      plots: [],
    });

    await pythonCodeHandler(
      makeNode({ code: "result = variables['x'] * 10" }),
      makeContext({ x: 10 }),
    );

    expect(mockExecutePython).toHaveBeenCalledWith(
      expect.objectContaining({ variables: { x: 10 } }),
    );
  });

  // ── Blocked patterns ───────────────────────────────────────────────────────

  it("blocks import os", async () => {
    const result = await pythonCodeHandler(
      makeNode({ code: "import os\nos.listdir('/')" }),
      makeContext(),
    );
    expect(result.messages[0].content).toContain("blocked");
    expect(mockExecutePython).not.toHaveBeenCalled();
  });

  it("blocks from os import", async () => {
    const result = await pythonCodeHandler(
      makeNode({ code: "from os import path" }),
      makeContext(),
    );
    expect(result.messages[0].content).toContain("blocked");
    expect(mockExecutePython).not.toHaveBeenCalled();
  });

  it("blocks import subprocess", async () => {
    const result = await pythonCodeHandler(
      makeNode({ code: "import subprocess\nsubprocess.run(['ls'])" }),
      makeContext(),
    );
    expect(result.messages[0].content).toContain("blocked");
    expect(mockExecutePython).not.toHaveBeenCalled();
  });

  it("blocks import socket", async () => {
    const result = await pythonCodeHandler(
      makeNode({ code: "import socket" }),
      makeContext(),
    );
    expect(result.messages[0].content).toContain("blocked");
    expect(mockExecutePython).not.toHaveBeenCalled();
  });

  it("blocks open() calls", async () => {
    const result = await pythonCodeHandler(
      makeNode({ code: "f = open('/etc/passwd')" }),
      makeContext(),
    );
    expect(result.messages[0].content).toContain("blocked");
    expect(mockExecutePython).not.toHaveBeenCalled();
  });

  it("blocks eval()", async () => {
    const result = await pythonCodeHandler(
      makeNode({ code: "eval('1+1')" }),
      makeContext(),
    );
    expect(result.messages[0].content).toContain("blocked");
    expect(mockExecutePython).not.toHaveBeenCalled();
  });

  it("blocks code exceeding max length", async () => {
    const longCode = "x = 1\n".repeat(5000);
    const result = await pythonCodeHandler(
      makeNode({ code: longCode }),
      makeContext(),
    );
    expect(result.messages[0].content).toContain("blocked");
    expect(mockExecutePython).not.toHaveBeenCalled();
  });

  // ── Execution errors ───────────────────────────────────────────────────────

  it("returns error message on Python execution failure", async () => {
    mockExecutePython.mockResolvedValueOnce({
      success: false,
      output: "",
      result: null,
      error: "NameError: name 'undefined_var' is not defined",
      plots: [],
    });

    const result = await pythonCodeHandler(
      makeNode({ code: "print(undefined_var)" }),
      makeContext(),
    );

    expect(result.messages[0].content).toContain("Python error");
    expect(result.messages[0].content).toContain("NameError");
    expect(result.updatedVariables).toBeUndefined();
  });

  it("returns timeout message when executePython throws timeout error", async () => {
    mockExecutePython.mockRejectedValueOnce(new Error("Python execution timed out"));

    const result = await pythonCodeHandler(
      makeNode({ code: "while True: pass" }),
      makeContext(),
    );

    expect(result.messages[0].content).toContain("timed out");
  });

  it("returns generic error message on unexpected executor throw", async () => {
    mockExecutePython.mockRejectedValueOnce(new Error("Worker crash"));

    const result = await pythonCodeHandler(
      makeNode({ code: "result = 1" }),
      makeContext(),
    );

    expect(result.messages[0].content).toContain("Error executing Python");
    expect(result.waitForInput).toBe(false);
  });

  // ── Edge cases ─────────────────────────────────────────────────────────────

  it("always returns nextNodeId as null", async () => {
    mockExecutePython.mockResolvedValueOnce({
      success: true,
      output: "",
      result: null,
      plots: [],
    });

    const result = await pythonCodeHandler(
      makeNode({ code: "pass" }),
      makeContext(),
    );

    expect(result.nextNodeId).toBeNull();
  });

  it("always returns waitForInput as false", async () => {
    mockExecutePython.mockResolvedValueOnce({
      success: true,
      output: "",
      result: null,
      plots: [],
    });

    const result = await pythonCodeHandler(
      makeNode({ code: "pass" }),
      makeContext(),
    );

    expect(result.waitForInput).toBe(false);
  });

  it("handles null result from Python gracefully", async () => {
    mockExecutePython.mockResolvedValueOnce({
      success: true,
      output: "",
      result: null,
      plots: [],
    });

    const result = await pythonCodeHandler(
      makeNode({ code: "result = None" }),
      makeContext(),
    );

    expect(result.updatedVariables).toEqual({ result: null });
  });

  it("stores complex object result correctly", async () => {
    const complexResult = { name: "test", values: [1, 2, 3] };
    mockExecutePython.mockResolvedValueOnce({
      success: true,
      output: "",
      result: complexResult,
      plots: [],
    });

    const result = await pythonCodeHandler(
      makeNode({ code: "result = {'name': 'test', 'values': [1, 2, 3]}" }),
      makeContext(),
    );

    expect(result.updatedVariables).toEqual({ result: complexResult });
  });
});
