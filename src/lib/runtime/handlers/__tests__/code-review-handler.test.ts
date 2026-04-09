import { describe, it, expect, vi, beforeEach } from "vitest";
import { codeReviewHandler } from "../code-review-handler";
import type { RuntimeContext } from "../../types";

// ── Mock AI ────────────────────────────────────────────────────────────────────
vi.mock("ai", () => ({
  generateObject: vi.fn(),
}));

vi.mock("@/lib/ai", () => ({
  getModel: vi.fn(() => "mocked-model"),
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// ── Helpers ────────────────────────────────────────────────────────────────────
function makeContext(vars: Record<string, unknown> = {}): RuntimeContext {
  return {
    agentId: "agent-test",
    conversationId: "conv-test",
    variables: vars,
    messages: [],
    nodes: [],
    flowContent: { nodes: [], edges: [] },
    currentNodeId: null,
    systemPrompt: "",
  } as unknown as RuntimeContext;
}

function makeNode(data: Record<string, unknown> = {}) {
  return {
    id: "node-review-1",
    type: "code_review",
    data: {
      model: "deepseek-chat",
      filesVariable: "generatedCode",
      testResultVar: "testResults",
      outputVariable: "reviewResult",
      nextNodeId: "node-approval",
      blockNodeId: "node-fix",
      ...data,
    },
  };
}

const APPROVE_RESULT = {
  decision: "APPROVE" as const,
  compositeScore: 92,
  securityScore: 95,
  qualityScore: 90,
  conventionScore: 91,
  issues: [],
  blockingIssues: [],
  summary: "Code looks good. No blocking issues.",
  fixInstructions: undefined,
};

const BLOCK_RESULT = {
  decision: "BLOCK" as const,
  compositeScore: 42,
  securityScore: 30,
  qualityScore: 55,
  conventionScore: 50,
  issues: [
    {
      severity: "CRITICAL" as const,
      category: "security" as const,
      file: "src/app/api/test/route.ts",
      line: 12,
      message: "SQL injection via unsanitized input",
      fix: "Use parameterized queries via Prisma",
    },
  ],
  blockingIssues: [
    {
      severity: "CRITICAL" as const,
      category: "security" as const,
      file: "src/app/api/test/route.ts",
      line: 12,
      message: "SQL injection via unsanitized input",
      fix: "Use parameterized queries via Prisma",
    },
  ],
  summary: "Critical security issue found.",
  fixInstructions: "Replace raw SQL with Prisma parameterized query in route.ts line 12.",
};

// ── Tests ──────────────────────────────────────────────────────────────────────
describe("codeReviewHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("APPROVE: routes to nextNodeId and sets flat variables", async () => {
    const { generateObject } = await import("ai");
    vi.mocked(generateObject).mockResolvedValueOnce({ object: APPROVE_RESULT } as never);

    const context = makeContext({
      generatedCode: {
        files: [{ path: "src/lib/utils.ts", content: "export const add = (a: number, b: number) => a + b;", language: "typescript", isNew: true }],
      },
      testResults: "All tests passed (3/3)",
    });

    const result = await codeReviewHandler(makeNode() as never, context);

    expect(result.nextNodeId).toBe("node-approval");
    expect(result.waitForInput).toBe(false);
    expect(result.updatedVariables?.reviewDecision).toBe("APPROVE");
    expect(result.updatedVariables?.reviewBlocking).toBe(false);
    expect(result.updatedVariables?.reviewCompositeScore).toBe(92);
    expect(result.messages[0].content).toContain("APPROVE");
  });

  it("BLOCK: routes to blockNodeId and sets reviewBlocking=true", async () => {
    const { generateObject } = await import("ai");
    vi.mocked(generateObject).mockResolvedValueOnce({ object: BLOCK_RESULT } as never);

    const context = makeContext({
      generatedCode: { files: [{ path: "src/app/api/test/route.ts", content: "bad code", language: "typescript", isNew: true }] },
      testResults: "Tests failed",
    });

    const result = await codeReviewHandler(makeNode() as never, context);

    expect(result.nextNodeId).toBe("node-fix");
    expect(result.updatedVariables?.reviewDecision).toBe("BLOCK");
    expect(result.updatedVariables?.reviewBlocking).toBe(true);
    expect(result.updatedVariables?.reviewFixInstructions).toContain("Prisma");
    expect(result.messages[0].content).toContain("BLOCK");
  });

  it("BLOCK without blockNodeId falls back to nextNodeId", async () => {
    const { generateObject } = await import("ai");
    vi.mocked(generateObject).mockResolvedValueOnce({ object: BLOCK_RESULT } as never);

    const context = makeContext({ generatedCode: "some code", testResults: "" });
    const node = makeNode({ blockNodeId: undefined });

    const result = await codeReviewHandler(node as never, context);

    expect(result.nextNodeId).toBe("node-approval");
    expect(result.updatedVariables?.reviewBlocking).toBe(true);
  });

  it("handles missing filesVariable gracefully", async () => {
    const { generateObject } = await import("ai");
    vi.mocked(generateObject).mockResolvedValueOnce({ object: APPROVE_RESULT } as never);

    const context = makeContext({});
    const result = await codeReviewHandler(makeNode() as never, context);

    expect(result.messages[0].content).toBeDefined();
    expect(result.updatedVariables?.reviewDecision).toBe("APPROVE");
  });

  it("returns graceful fallback when AI throws", async () => {
    const { generateObject } = await import("ai");
    vi.mocked(generateObject).mockRejectedValueOnce(new Error("AI provider timeout"));

    const context = makeContext({ generatedCode: "code", testResults: "tests" });
    const result = await codeReviewHandler(makeNode() as never, context);

    // Must NOT throw
    expect(result.nextNodeId).toBe("node-approval");
    expect(result.updatedVariables?.reviewDecision).toBe("APPROVE_WITH_NOTES");
    expect(result.updatedVariables?.reviewBlocking).toBe(false);
    expect(result.messages[0].content).toContain("error");
  });
});
