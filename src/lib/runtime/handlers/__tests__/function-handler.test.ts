import { describe, it, expect, vi } from "vitest";
import { functionHandler } from "../function-handler";
import type { RuntimeContext } from "../../types";
import type { FlowNode } from "@/types";

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

function makeNode(overrides: Partial<FlowNode["data"]> = {}): FlowNode {
  return {
    id: "fn-1",
    type: "function",
    position: { x: 0, y: 0 },
    data: {
      label: "Function",
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
    currentNodeId: "fn-1",
    variables,
    messageHistory: [],
    isNewConversation: false,
  };
}

describe("functionHandler (vm sandbox)", () => {
  it("returns empty result for empty code", async () => {
    const result = await functionHandler(makeNode({ code: "" }), makeContext());
    expect(result.messages).toHaveLength(0);
    expect(result.waitForInput).toBe(false);
  });

  it("executes basic math and stores result", async () => {
    const result = await functionHandler(
      makeNode({ code: "return 2 + 3;" }),
      makeContext(),
    );
    expect(result.updatedVariables).toEqual({ result: 5 });
    expect(result.messages).toHaveLength(0);
  });

  it("can access variables passed into sandbox", async () => {
    const result = await functionHandler(
      makeNode({ code: "return variables.x * variables.y;" }),
      makeContext({ x: 4, y: 5 }),
    );
    expect(result.updatedVariables).toEqual({ result: 20 });
  });

  it("supports string manipulation", async () => {
    const result = await functionHandler(
      makeNode({ code: 'return "hello".toUpperCase() + " " + "world";' }),
      makeContext(),
    );
    expect(result.updatedVariables).toEqual({ result: "HELLO world" });
  });

  it("supports array methods", async () => {
    const result = await functionHandler(
      makeNode({ code: "return [1, 2, 3].map(n => n * 2).filter(n => n > 2);" }),
      makeContext(),
    );
    expect(result.updatedVariables).toEqual({ result: [4, 6] });
  });

  it("supports Math operations", async () => {
    const result = await functionHandler(
      makeNode({ code: "return Math.max(10, 20, 5);" }),
      makeContext(),
    );
    expect(result.updatedVariables).toEqual({ result: 20 });
  });

  it("supports JSON.parse and JSON.stringify", async () => {
    const result = await functionHandler(
      makeNode({ code: 'return JSON.parse(JSON.stringify({ a: 1 }));' }),
      makeContext(),
    );
    expect(result.updatedVariables).toEqual({ result: { a: 1 } });
  });

  it("supports Date construction", async () => {
    const result = await functionHandler(
      makeNode({ code: 'return new Date("2024-01-01").getFullYear();' }),
      makeContext(),
    );
    expect(result.updatedVariables).toEqual({ result: 2024 });
  });

  it("supports RegExp", async () => {
    const result = await functionHandler(
      makeNode({ code: 'return /^hello/.test("hello world");' }),
      makeContext(),
    );
    expect(result.updatedVariables).toEqual({ result: true });
  });

  it("supports Map and Set", async () => {
    const result = await functionHandler(
      makeNode({ code: "var s = new Set([1, 2, 2, 3]); return s.size;" }),
      makeContext(),
    );
    expect(result.updatedVariables).toEqual({ result: 3 });
  });

  it("uses __function_result fallback when outputVariable is empty", async () => {
    const result = await functionHandler(
      makeNode({ code: "return 42;", outputVariable: "" }),
      makeContext(),
    );
    expect(result.updatedVariables).toEqual({ __function_result: 42 });
  });

  it("blocks code with process keyword", async () => {
    const result = await functionHandler(
      makeNode({ code: "return process.env;" }),
      makeContext(),
    );
    expect(result.messages[0].content).toBe("Function blocked due to policy restriction.");
  });

  it("blocks code with require keyword", async () => {
    const result = await functionHandler(
      makeNode({ code: 'return require("fs");' }),
      makeContext(),
    );
    expect(result.messages[0].content).toBe("Function blocked due to policy restriction.");
  });

  it("blocks code with eval keyword", async () => {
    const result = await functionHandler(
      makeNode({ code: 'return eval("1+1");' }),
      makeContext(),
    );
    expect(result.messages[0].content).toBe("Function blocked due to policy restriction.");
  });

  it("blocks code with globalThis keyword", async () => {
    const result = await functionHandler(
      makeNode({ code: "return globalThis;" }),
      makeContext(),
    );
    expect(result.messages[0].content).toBe("Function blocked due to policy restriction.");
  });

  it("blocks code exceeding max length", async () => {
    const longCode = "var x = 1;\n".repeat(2000);
    const result = await functionHandler(
      makeNode({ code: longCode }),
      makeContext(),
    );
    expect(result.messages[0].content).toBe("Function blocked due to policy restriction.");
  });

  it("blocks setTimeout in regex layer (defense-in-depth)", async () => {
    // setTimeout is now caught by BLOCKED_PATTERNS before reaching vm sandbox
    const node = makeNode({ code: "return typeof setTimeout;" });
    const result = await functionHandler(node, makeContext());
    expect(result.messages[0].content).toBe("Function blocked due to policy restriction.");
  });

  it("blocks Promise in regex layer (defense-in-depth)", async () => {
    // Promise could be used to escape timeout enforcement
    const node = makeNode({ code: "return new Promise(r => r(1));" });
    const result = await functionHandler(node, makeContext());
    expect(result.messages[0].content).toBe("Function blocked due to policy restriction.");
  });

  it("sandbox context does not expose dangerous globals", async () => {
    // Test that even safe-looking code cannot access host globals
    // Use 'typeof' on something that's genuinely not blocked by regex
    // but also not provided in sandbox — like 'Buffer'
    const node = makeNode({ code: "return typeof console;" });
    const result = await functionHandler(node, makeContext());
    expect(result.updatedVariables).toEqual({ result: "undefined" });
  });

  it("handles runtime errors gracefully", async () => {
    const result = await functionHandler(
      makeNode({ code: "return undefinedVar.something;" }),
      makeContext(),
    );
    expect(result.messages[0].content).toBe("Error executing function.");
  });

  it("handles syntax errors gracefully", async () => {
    const result = await functionHandler(
      makeNode({ code: "return {{{;" }),
      makeContext(),
    );
    expect(result.messages[0].content).toBe("Error executing function.");
  });

  it("does not mutate original context variables", async () => {
    const ctx = makeContext({ items: [1, 2, 3] });
    await functionHandler(
      makeNode({ code: "variables.items.push(4); return variables.items;" }),
      ctx,
    );
    expect(ctx.variables.items).toEqual([1, 2, 3]);
  });

  it("timeout produces specific error message", async () => {
    const result = await functionHandler(
      makeNode({ code: "while(true) {}" }),
      makeContext(),
    );
    expect(result.messages[0].content).toBe("Function execution timed out.");
  }, 10_000);

  // ── outputVariable handling (P-14) ──────────────────────────────────────

  describe("outputVariable handling (P-14)", () => {
    it("warns when outputVariable is not configured", async () => {
      const { logger } = await import("@/lib/logger");

      await functionHandler(
        makeNode({ code: "return 1;", outputVariable: undefined }),
        makeContext(),
      );

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining("no outputVariable"),
        expect.objectContaining({ fallback: "__function_result" }),
      );
    });

    it("warns when outputVariable is empty string", async () => {
      const { logger } = await import("@/lib/logger");

      await functionHandler(
        makeNode({ code: "return 1;", outputVariable: "" }),
        makeContext(),
      );

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining("no outputVariable"),
        expect.anything(),
      );
    });

    it("stores result in named outputVariable", async () => {
      const result = await functionHandler(
        makeNode({ code: "return 'hello';", outputVariable: "greeting" }),
        makeContext(),
      );

      expect(result.updatedVariables).toEqual({ greeting: "hello" });
    });

    it("stores string return value as string", async () => {
      const result = await functionHandler(
        makeNode({ code: "return 'test string';" }),
        makeContext(),
      );

      expect(result.updatedVariables?.result).toBe("test string");
    });

    it("stores object return value as object", async () => {
      const result = await functionHandler(
        makeNode({ code: "return { a: 1, b: 2 };" }),
        makeContext(),
      );

      expect(result.updatedVariables?.result).toEqual({ a: 1, b: 2 });
    });
  });
});
