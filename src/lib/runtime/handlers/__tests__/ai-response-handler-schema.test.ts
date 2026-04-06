import { describe, it, expect, vi, beforeEach } from "vitest";
import type { RuntimeContext } from "../../types";
import type { FlowContent } from "@/types";

vi.mock("ai", () => ({
  generateText: vi.fn(),
  generateObject: vi.fn(),
  stepCountIs: vi.fn().mockReturnValue(vi.fn()),
}));

vi.mock("@/lib/ai", () => ({
  getModel: vi.fn().mockReturnValue({ modelId: "deepseek-chat" }),
  getModelByTier: vi.fn().mockReturnValue({ modelId: "deepseek-chat" }),
  DEFAULT_MODEL: "deepseek-chat",
}));

vi.mock("@/lib/cost/ecomode", () => ({
  classifyTaskComplexity: vi.fn(),
  complexityToTier: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/mcp/client", () => ({
  getMCPToolsForAgent: vi.fn().mockResolvedValue({}),
}));

vi.mock("@/lib/agents/agent-tools", () => ({
  getAgentToolsForAgent: vi.fn().mockResolvedValue({}),
}));

vi.mock("@/lib/observability/tracer", () => ({
  traceGenAI: vi.fn().mockReturnValue({
    setAttributes: vi.fn(),
    addEvent: vi.fn(),
    end: vi.fn(),
  }),
}));

vi.mock("@/lib/observability/metrics", () => ({
  recordChatLatency: vi.fn(),
  recordTokenUsage: vi.fn(),
}));

vi.mock("@/lib/knowledge/rag-inject", () => ({
  injectRAGContext: vi.fn().mockResolvedValue({
    augmentedSystemPrompt: "You are a helpful assistant.",
    retrievedChunkCount: 0,
    retrievalTimeMs: 0,
  }),
}));

vi.mock("@/lib/knowledge/query-reformulation", () => ({
  reformulateWithHistory: vi.fn().mockImplementation((q: string) => Promise.resolve(q)),
}));

vi.mock("@/lib/ecc/skill-composer", () => ({
  composeSkillPipeline: vi.fn().mockResolvedValue([]),
  formatSkillPipelineForPrompt: vi.fn().mockReturnValue(""),
}));

vi.mock("@/lib/ecc/skill-router", () => ({
  routeToSkill: vi.fn().mockResolvedValue([]),
  formatRoutedSkillsForPrompt: vi.fn().mockReturnValue(""),
}));

vi.mock("../template", () => ({
  resolveTemplate: vi.fn().mockImplementation((t: string) => t),
}));

vi.mock("@/lib/safety/engine-safety-middleware", () => ({
  checkInputSafety: vi.fn().mockResolvedValue({ safe: true }),
  checkOutputSafety: vi.fn().mockImplementation((text: string) =>
    Promise.resolve({ piiRedacted: false, sanitized: text })
  ),
}));

vi.mock("@/lib/safety/audit-logger", () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../hooks", () => ({
  emitHook: vi.fn(),
}));

import { aiResponseHandler } from "../ai-response-handler";
import { generateObject } from "ai";

const mockGenerateObject = vi.mocked(generateObject);

function makeContext(variables: Record<string, unknown> = {}): RuntimeContext {
  return {
    agentId: "test-agent",
    conversationId: "test-conv",
    flowContent: { nodes: [], edges: [] } as FlowContent,
    variables,
    messageHistory: [{ role: "user", content: "Generate some code" }],
    userId: "user-1",
  } as unknown as RuntimeContext;
}

function makeNode(data: Record<string, unknown>) {
  return {
    id: "node-1",
    type: "ai_response",
    position: { x: 0, y: 0 },
    data: { label: "AI Response", prompt: "You are a code generator.", ...data },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("aiResponseHandler — outputSchema branch", () => {
  it("calls generateObject when outputSchema is set", async () => {
    const codeGenOutput = {
      files: [{ path: "src/foo.ts", content: "export const x = 1;", language: "typescript", isNew: true }],
      dependencies: [],
      envVariables: [],
      summary: "Generated foo module",
    };
    mockGenerateObject.mockResolvedValueOnce({
      object: codeGenOutput,
      usage: { inputTokens: 100, outputTokens: 200 },
    } as Awaited<ReturnType<typeof generateObject>>);

    const node = makeNode({ outputSchema: "CodeGenOutput", outputVariable: "generatedCode" });
    const result = await aiResponseHandler(node as Parameters<typeof aiResponseHandler>[0], makeContext());

    expect(mockGenerateObject).toHaveBeenCalledOnce();
    expect(result.messages[0].content).toBe("Generated foo module");
    expect(result.updatedVariables?.generatedCode).toEqual(codeGenOutput);
    expect(result.waitForInput).toBe(false);
  });

  it("throws for unknown outputSchema name", async () => {
    const node = makeNode({ outputSchema: "NonExistentSchema" });
    const result = await aiResponseHandler(node as Parameters<typeof aiResponseHandler>[0], makeContext());

    // Error is caught and returns graceful fallback
    expect(result.messages[0].content).toMatch(/trouble generating/i);
    expect(mockGenerateObject).not.toHaveBeenCalled();
  });

  it("uses object summary as message content", async () => {
    mockGenerateObject.mockResolvedValueOnce({
      object: {
        decision: "APPROVE",
        compositeScore: 90,
        securityScore: 95,
        qualityScore: 85,
        issues: [],
        summary: "All checks passed — ship it",
      },
      usage: { inputTokens: 50, outputTokens: 100 },
    } as Awaited<ReturnType<typeof generateObject>>);

    const node = makeNode({ outputSchema: "PRGateOutput", outputVariable: "gateResult" });
    const result = await aiResponseHandler(node as Parameters<typeof aiResponseHandler>[0], makeContext());

    expect(result.messages[0].content).toBe("All checks passed — ship it");
    expect(result.updatedVariables?.gateResult).toMatchObject({ decision: "APPROVE" });
  });

  it("falls back to schema name when object has no summary", async () => {
    const objectWithoutSummary = {
      files: [{ path: "a.ts", content: "x", language: "typescript", isNew: false }],
      dependencies: [],
      envVariables: [],
    };
    mockGenerateObject.mockResolvedValueOnce({
      object: objectWithoutSummary,
      usage: { inputTokens: 10, outputTokens: 20 },
    } as Awaited<ReturnType<typeof generateObject>>);

    const node = makeNode({ outputSchema: "CodeGenOutput", outputVariable: "result" });
    const result = await aiResponseHandler(node as Parameters<typeof aiResponseHandler>[0], makeContext());

    expect(result.messages[0].content).toContain("CodeGenOutput generated successfully");
  });

  it("does not call generateObject when outputSchema is absent", async () => {
    const { generateText } = await import("ai");
    const mockGenerateText = vi.mocked(generateText);
    mockGenerateText.mockResolvedValueOnce({
      text: "Hello world",
      usage: { inputTokens: 10, outputTokens: 5 },
      toolCalls: [],
      finishReason: "stop",
    } as Awaited<ReturnType<typeof generateText>>);

    const node = makeNode({ outputVariable: "response" });
    await aiResponseHandler(node as Parameters<typeof aiResponseHandler>[0], makeContext());

    expect(mockGenerateObject).not.toHaveBeenCalled();
    expect(mockGenerateText).toHaveBeenCalledOnce();
  });
});
