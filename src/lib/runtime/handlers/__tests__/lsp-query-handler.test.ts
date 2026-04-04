/**
 * Unit tests for lsp_query handler (Phase F1)
 * 9 tests covering: happy path (hover/definition/completion/diagnostics),
 * empty source, server unavailable, unknown operation, custom outputVariable,
 * handler never throws.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { lspQueryHandler } from "../lsp-query-handler";
import type { FlowNode } from "@/types";
import type { RuntimeContext } from "../../types";

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/lib/lsp/pool", () => ({
  acquireLspClient: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { acquireLspClient } from "@/lib/lsp/pool";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeNode(data: Record<string, unknown>): FlowNode {
  return {
    id: "lsp-1",
    type: "lsp_query",
    position: { x: 0, y: 0 },
    data: {
      label: "LSP Query",
      language: "typescript",
      operation: "hover",
      line: 0,
      character: 0,
      outputVariable: "lsp_result",
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

function makeMockClient(overrides: Record<string, unknown> = {}) {
  return {
    executeOperation: vi.fn(),
    closed: false,
    initialized: true,
    ...overrides,
  };
}

const MOCK_SOURCE = `const x: number = 42;\nconsole.log(x);`;

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("lspQueryHandler", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("T1: hover — returns type info, stores in lsp_result", async () => {
    const client = makeMockClient();
    vi.mocked(acquireLspClient).mockResolvedValue(client as never);
    vi.mocked(client.executeOperation).mockResolvedValue({
      contents: "const x: number",
    });

    const node = makeNode({ operation: "hover", source: MOCK_SOURCE });
    const result = await lspQueryHandler(node, makeContext());

    expect(result.messages[0].content).toContain("Hover");
    expect(result.updatedVariables?.lsp_result).toMatchObject({
      available: true,
      operation: "hover",
      result: { contents: "const x: number" },
    });
  });

  it("T2: definition — reports location count", async () => {
    const client = makeMockClient();
    vi.mocked(acquireLspClient).mockResolvedValue(client as never);
    vi.mocked(client.executeOperation).mockResolvedValue({
      locations: [{ uri: "file:///src/foo.ts", range: {} }],
    });

    const node = makeNode({ operation: "definition", source: MOCK_SOURCE, line: 1, character: 12 });
    const result = await lspQueryHandler(node, makeContext());

    expect(result.messages[0].content).toContain("1 location");
    expect(result.updatedVariables?.lsp_result).toMatchObject({
      available: true,
      operation: "definition",
    });
  });

  it("T3: completion — reports item count", async () => {
    const client = makeMockClient();
    vi.mocked(acquireLspClient).mockResolvedValue(client as never);
    vi.mocked(client.executeOperation).mockResolvedValue({
      items: [{ label: "console" }, { label: "const" }],
      isIncomplete: false,
    });

    const node = makeNode({ operation: "completion", source: MOCK_SOURCE });
    const result = await lspQueryHandler(node, makeContext());

    expect(result.messages[0].content).toContain("2 items");
    expect(result.updatedVariables?.lsp_result).toMatchObject({
      available: true,
      operation: "completion",
    });
  });

  it("T4: diagnostics — reports errors and warnings", async () => {
    const client = makeMockClient();
    vi.mocked(acquireLspClient).mockResolvedValue(client as never);
    vi.mocked(client.executeOperation).mockResolvedValue({
      diagnostics: [
        { range: {}, severity: 1, message: "Type error" },
        { range: {}, severity: 2, message: "Unused var" },
      ],
    });

    const node = makeNode({ operation: "diagnostics", source: MOCK_SOURCE });
    const result = await lspQueryHandler(node, makeContext());

    expect(result.messages[0].content).toContain("1 error");
    expect(result.messages[0].content).toContain("1 warning");
    expect(result.updatedVariables?.lsp_result).toMatchObject({
      available: true,
      operation: "diagnostics",
    });
  });

  it("T5: empty source returns early without calling acquireLspClient", async () => {
    const node = makeNode({ source: "" });
    const result = await lspQueryHandler(node, makeContext());

    expect(acquireLspClient).not.toHaveBeenCalled();
    expect(result.messages[0].content).toContain("no source");
    expect(result.updatedVariables?.lsp_result).toMatchObject({
      available: true,
      result: null,
      error: "No source provided",
    });
  });

  it("T6: server unavailable (ENOENT) — available:false, non-fatal", async () => {
    vi.mocked(acquireLspClient).mockRejectedValue(new Error("ENOENT: typescript-language-server not found"));

    const node = makeNode({ source: MOCK_SOURCE });
    const result = await lspQueryHandler(node, makeContext());

    expect(result.messages[0].content).toContain("unavailable");
    expect(result.updatedVariables?.lsp_result).toMatchObject({
      available: false,
      result: null,
    });
    // Must not throw
    expect(result.nextNodeId).toBeNull();
  });

  it("T7: unknown operation falls back to 'hover'", async () => {
    const client = makeMockClient();
    vi.mocked(acquireLspClient).mockResolvedValue(client as never);
    vi.mocked(client.executeOperation).mockResolvedValue({ contents: "any" });

    const node = makeNode({ source: MOCK_SOURCE, operation: "invalid_op" });
    await lspQueryHandler(node, makeContext());

    // Should have called executeOperation with 'hover' (the fallback)
    expect(client.executeOperation).toHaveBeenCalledWith(
      "hover",
      MOCK_SOURCE,
      "typescript",
      0,
      0,
    );
  });

  it("T8: uses custom outputVariable name", async () => {
    const client = makeMockClient();
    vi.mocked(acquireLspClient).mockResolvedValue(client as never);
    vi.mocked(client.executeOperation).mockResolvedValue({ contents: "info" });

    const node = makeNode({
      source: MOCK_SOURCE,
      outputVariable: "my_lsp_var",
    });
    const result = await lspQueryHandler(node, makeContext());

    expect(result.updatedVariables?.my_lsp_var).toBeDefined();
    expect(result.updatedVariables?.lsp_result).toBeUndefined();
  });

  it("T9: executeOperation throws — returns error message, does NOT throw", async () => {
    const client = makeMockClient();
    vi.mocked(acquireLspClient).mockResolvedValue(client as never);
    vi.mocked(client.executeOperation).mockRejectedValue(new Error("LSP crash"));

    const node = makeNode({ source: MOCK_SOURCE });
    const result = await lspQueryHandler(node, makeContext());

    expect(result.messages[0].content).toContain("error");
    expect(result.updatedVariables?.lsp_result).toMatchObject({
      available: true,
      result: null,
      error: "LSP crash",
    });
    expect(result.nextNodeId).toBeNull();
  });
});
