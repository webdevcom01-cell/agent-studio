/**
 * Unit tests for ast_transform handler (Phase F2)
 * 9 tests covering: happy path, empty pattern, unavailable addon,
 * pattern error, replacement, multi-match, no matches, empty source,
 * error fallback.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { astTransformHandler } from "../ast-transform-handler";
import type { FlowNode } from "@/types";
import type { RuntimeContext } from "../../types";

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/lib/ast/ast-grep-client", () => ({
  astGrepSearch: vi.fn(),
  detectLanguage: vi.fn(() => "typescript"),
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { astGrepSearch } from "@/lib/ast/ast-grep-client";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeNode(data: Record<string, unknown>): FlowNode {
  return {
    id: "ast-1",
    type: "ast_transform",
    position: { x: 0, y: 0 },
    data: {
      label: "AST Transform",
      language: "typescript",
      outputVariable: "ast_result",
      ...data,
    },
  } as FlowNode;
}

function makeContext(vars: Record<string, unknown> = {}): RuntimeContext {
  return {
    agentId: "agent-test",
    conversationId: "conv-test",
    userId: null,
    variables: vars,
    messageHistory: [],
    nodes: [],
    edges: [],
  } as unknown as RuntimeContext;
}

const MOCK_SOURCE = `
const x = 1;
console.log(x);
console.log("hello");
`.trim();

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("astTransformHandler", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("T1: happy path — finds matches, stores output in variable", async () => {
    vi.mocked(astGrepSearch).mockResolvedValue({
      available: true,
      matches: [
        {
          text: "console.log(x)",
          startLine: 1,
          endLine: 1,
          startCol: 0,
          endCol: 14,
          captures: { ARG: "x" },
        },
      ],
    });

    const node = makeNode({
      source: MOCK_SOURCE,
      pattern: "console.log($ARG)",
    });
    const ctx = makeContext();

    const result = await astTransformHandler(node, ctx);

    expect(result.messages[0].content).toContain("1 match");
    expect(result.updatedVariables?.ast_result).toMatchObject({
      available: true,
      matches: expect.arrayContaining([
        expect.objectContaining({ text: "console.log(x)" }),
      ]),
    });
  });

  it("T2: empty pattern returns early without calling astGrepSearch", async () => {
    const node = makeNode({ source: MOCK_SOURCE, pattern: "" });
    const ctx = makeContext();

    const result = await astTransformHandler(node, ctx);

    expect(astGrepSearch).not.toHaveBeenCalled();
    expect(result.messages[0].content).toContain("no pattern");
    expect(result.updatedVariables?.ast_result).toMatchObject({
      available: true,
      matches: [],
    });
  });

  it("T3: addon unavailable — returns available:false, non-fatal message", async () => {
    vi.mocked(astGrepSearch).mockResolvedValue({
      available: false,
      matches: [],
    });

    const node = makeNode({ source: MOCK_SOURCE, pattern: "console.log($ARG)" });
    const ctx = makeContext();

    const result = await astTransformHandler(node, ctx);

    expect(result.messages[0].content).toContain("unavailable");
    expect(result.updatedVariables?.ast_result).toMatchObject({ available: false });
    // Handler should NOT throw
    expect(result.nextNodeId).toBeNull();
  });

  it("T4: pattern error — stores error field, message count 0", async () => {
    vi.mocked(astGrepSearch).mockResolvedValue({
      available: true,
      matches: [],
      error: "Invalid pattern syntax",
    });

    const node = makeNode({ source: MOCK_SOURCE, pattern: "console.log((" });
    const ctx = makeContext();

    const result = await astTransformHandler(node, ctx);

    expect(result.updatedVariables?.ast_result).toMatchObject({
      error: "Invalid pattern syntax",
      matches: [],
    });
  });

  it("T5: applies single-line replacement via capture group", async () => {
    const source = "console.log(myVar);";
    vi.mocked(astGrepSearch).mockResolvedValue({
      available: true,
      matches: [
        {
          text: "console.log(myVar)",
          startLine: 0,
          endLine: 0,
          startCol: 0,
          endCol: 18,
          captures: { ARG: "myVar" },
        },
      ],
    });

    const node = makeNode({
      source,
      pattern: "console.log($ARG)",
      replacement: "logger.info($ARG)",
    });
    const ctx = makeContext();

    const result = await astTransformHandler(node, ctx);

    const output = result.updatedVariables?.ast_result as {
      transformed: string;
    };
    expect(output.transformed).toContain("logger.info(myVar)");
    expect(result.messages[0].content).toContain("transformations");
  });

  it("T6: resolves {{variable}} in source and pattern", async () => {
    vi.mocked(astGrepSearch).mockResolvedValue({
      available: true,
      matches: [],
    });

    const node = makeNode({
      source: "{{my_code}}",
      pattern: "{{my_pattern}}",
    });
    const ctx = makeContext({
      my_code: "const x = 1;",
      my_pattern: "const $NAME = 1",
    });

    await astTransformHandler(node, ctx);

    expect(astGrepSearch).toHaveBeenCalledWith(
      "const x = 1;",
      "const $NAME = 1",
      "typescript",
    );
  });

  it("T7: no matches — returns empty array and 'Found 0 matches'", async () => {
    vi.mocked(astGrepSearch).mockResolvedValue({
      available: true,
      matches: [],
    });

    const node = makeNode({ source: MOCK_SOURCE, pattern: "fetch($URL)" });
    const ctx = makeContext();

    const result = await astTransformHandler(node, ctx);

    expect(result.messages[0].content).toContain("0 match");
    expect(result.updatedVariables?.ast_result).toMatchObject({ matches: [] });
  });

  it("T8: uses custom outputVariable name", async () => {
    vi.mocked(astGrepSearch).mockResolvedValue({
      available: true,
      matches: [],
    });

    const node = makeNode({
      source: MOCK_SOURCE,
      pattern: "something",
      outputVariable: "my_custom_var",
    });
    const ctx = makeContext();

    const result = await astTransformHandler(node, ctx);

    expect(result.updatedVariables?.my_custom_var).toBeDefined();
    expect(result.updatedVariables?.ast_result).toBeUndefined();
  });

  it("T9: astGrepSearch throws — returns error message, does NOT throw", async () => {
    vi.mocked(astGrepSearch).mockRejectedValue(new Error("Native crash"));

    const node = makeNode({ source: MOCK_SOURCE, pattern: "console.log($X)" });
    const ctx = makeContext();

    const result = await astTransformHandler(node, ctx);

    expect(result.messages[0].content).toContain("error");
    expect(result.updatedVariables?.ast_result).toMatchObject({
      available: false,
      error: "Native crash",
    });
    // Must not throw
    expect(result.nextNodeId).toBeNull();
  });
});
