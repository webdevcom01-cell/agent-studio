import { describe, it, expect, vi, beforeEach } from "vitest";
import { evaluatorHandler } from "../evaluator-handler";
import type { RuntimeContext } from "../../types";
import type { FlowNode } from "@/types";

vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock AI imports — will be dynamically imported by handler
vi.mock("@/lib/ai", () => ({
  getModel: vi.fn().mockReturnValue("test-model"),
}));

const mockGenerateText = vi.fn();
vi.mock("ai", () => ({
  generateText: (...args: unknown[]) => mockGenerateText(...args),
}));

function makeNode(overrides: Partial<FlowNode["data"]> = {}): FlowNode {
  return {
    id: "eval-1",
    type: "evaluator",
    position: { x: 0, y: 0 },
    data: {
      label: "Evaluator",
      inputVariable: "content",
      outputVariable: "eval_result",
      model: "deepseek-chat",
      criteria: [
        { name: "Quality", description: "Overall quality", weight: 1 },
        { name: "Accuracy", description: "Factual accuracy", weight: 2 },
      ],
      passingScore: 7,
      ...overrides,
    },
  };
}

function makeContext(overrides: Partial<RuntimeContext> = {}): RuntimeContext {
  return {
    agentId: "agent-1",
    conversationId: "conv-1",
    variables: { content: "The quick brown fox jumps over the lazy dog." },
    messageHistory: [],
    flowContent: { nodes: [], edges: [], variables: [] },
    currentNodeId: null,
    isNewConversation: false,
    ...overrides,
  };
}

describe("evaluatorHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("evaluates content and returns pass when score is above threshold", async () => {
    mockGenerateText.mockResolvedValue({
      text: JSON.stringify({
        scores: [
          { name: "Quality", score: 8, reasoning: "Good" },
          { name: "Accuracy", score: 9, reasoning: "Accurate" },
        ],
        overallScore: 8.5,
        summary: "High quality content.",
      }),
    });

    const result = await evaluatorHandler(makeNode(), makeContext());

    expect(result.nextNodeId).toBe("passed");
    expect(result.updatedVariables?.eval_result).toEqual(
      expect.objectContaining({ overallScore: 8.5 })
    );
    expect(result.updatedVariables?.__last_eval).toEqual(
      expect.objectContaining({ passed: true, overallScore: 8.5 })
    );
  });

  it("routes to failed when score is below threshold", async () => {
    mockGenerateText.mockResolvedValue({
      text: JSON.stringify({
        scores: [
          { name: "Quality", score: 4, reasoning: "Poor" },
        ],
        overallScore: 4,
        summary: "Below expectations.",
      }),
    });

    const result = await evaluatorHandler(makeNode(), makeContext());

    expect(result.nextNodeId).toBe("failed");
    expect(result.updatedVariables?.__last_eval).toEqual(
      expect.objectContaining({ passed: false })
    );
  });

  it("returns error when input variable is empty", async () => {
    const node = makeNode({ inputVariable: "" });
    const result = await evaluatorHandler(node, makeContext());

    expect(result.messages[0].content).toContain("no input to evaluate");
    expect(mockGenerateText).not.toHaveBeenCalled();
  });

  it("returns error when input variable is empty string in context", async () => {
    const node = makeNode({ inputVariable: "content" });
    const ctx = makeContext({ variables: { content: "" } });
    const result = await evaluatorHandler(node, ctx);

    expect(result.messages[0].content).toContain("no input to evaluate");
  });

  it("returns error when no criteria defined", async () => {
    const node = makeNode({ criteria: [] });
    const result = await evaluatorHandler(node, makeContext());

    expect(result.messages[0].content).toContain("at least one criterion");
  });

  it("handles JSON wrapped in markdown code fences", async () => {
    mockGenerateText.mockResolvedValue({
      text: "```json\n" + JSON.stringify({
        scores: [{ name: "Quality", score: 9, reasoning: "Great" }],
        overallScore: 9,
        summary: "Excellent.",
      }) + "\n```",
    });

    const result = await evaluatorHandler(makeNode(), makeContext());

    expect(result.nextNodeId).toBe("passed");
    expect(result.updatedVariables?.eval_result).toEqual(
      expect.objectContaining({ overallScore: 9 })
    );
  });

  it("handles unparseable AI response", async () => {
    mockGenerateText.mockResolvedValue({
      text: "I cannot evaluate this properly.",
    });

    const result = await evaluatorHandler(makeNode(), makeContext());

    expect(result.messages[0].content).toContain("could not be parsed");
    const evalResult = result.updatedVariables?.eval_result as Record<string, unknown>;
    expect(evalResult?.parseError).toBe(true);
  });

  it("handles AI API errors gracefully", async () => {
    mockGenerateText.mockRejectedValue(new Error("API rate limit"));

    const result = await evaluatorHandler(makeNode(), makeContext());

    expect(result.messages[0].content).toContain("trouble evaluating");
    expect(result.updatedVariables?.eval_result).toBeNull();
  });

  it("clamps passing score between 0 and 10", async () => {
    mockGenerateText.mockResolvedValue({
      text: JSON.stringify({
        scores: [{ name: "Quality", score: 5, reasoning: "OK" }],
        overallScore: 5,
        summary: "Average.",
      }),
    });

    const node = makeNode({ passingScore: 15 }); // exceeds max — clamps to 10
    const result = await evaluatorHandler(node, makeContext());

    expect(result.updatedVariables?.__last_eval).toEqual(
      expect.objectContaining({ passingScore: 10 })
    );
  });

  it("passes criteria info to the AI prompt", async () => {
    mockGenerateText.mockResolvedValue({
      text: JSON.stringify({
        scores: [{ name: "Clarity", score: 7, reasoning: "Clear" }],
        overallScore: 7,
        summary: "Good.",
      }),
    });

    const node = makeNode({
      criteria: [{ name: "Clarity", description: "How clear is the content", weight: 3 }],
    });

    await evaluatorHandler(node, makeContext());

    expect(mockGenerateText).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining("Clarity"),
      })
    );
  });

  // ── Input variable and criteria normalization (P-04) ────────────────────

  describe("inputVariable template stripping (P-04)", () => {
    it("works with plain variable name", async () => {
      mockGenerateText.mockResolvedValue({
        text: JSON.stringify({
          scores: [{ name: "Q", score: 8, reasoning: "ok" }],
          overallScore: 8,
          summary: "Good.",
        }),
      });

      const result = await evaluatorHandler(
        makeNode({ inputVariable: "content" }),
        makeContext(),
      );

      expect(result.nextNodeId).toBe("passed");
    });

    it("auto-strips {{ }} from inputVariable", async () => {
      const { logger } = await import("@/lib/logger");

      mockGenerateText.mockResolvedValue({
        text: JSON.stringify({
          scores: [{ name: "Q", score: 9, reasoning: "ok" }],
          overallScore: 9,
          summary: "Great.",
        }),
      });

      const result = await evaluatorHandler(
        makeNode({ inputVariable: "{{content}}" }),
        makeContext(),
      );

      expect(result.nextNodeId).toBe("passed");
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining("template syntax"),
        expect.objectContaining({ extracted: "content" }),
      );
    });

    it("strips {{ }} with whitespace", async () => {
      mockGenerateText.mockResolvedValue({
        text: JSON.stringify({
          scores: [{ name: "Q", score: 7, reasoning: "ok" }],
          overallScore: 7,
          summary: "OK.",
        }),
      });

      const result = await evaluatorHandler(
        makeNode({ inputVariable: "{{ content }}" }),
        makeContext(),
      );

      expect(result.nextNodeId).toBe("passed");
    });
  });

  describe("criteria normalization (P-04)", () => {
    it("works with structured criteria objects", async () => {
      mockGenerateText.mockResolvedValue({
        text: JSON.stringify({
          scores: [{ name: "Quality", score: 8, reasoning: "ok" }],
          overallScore: 8,
          summary: "Good.",
        }),
      });

      const result = await evaluatorHandler(
        makeNode({
          criteria: [{ name: "Quality", description: "Overall quality", weight: 1 }],
        }),
        makeContext(),
      );

      expect(result.nextNodeId).toBe("passed");
    });

    it("auto-converts string[] criteria to structured format", async () => {
      const { logger } = await import("@/lib/logger");

      mockGenerateText.mockResolvedValue({
        text: JSON.stringify({
          scores: [
            { name: "clarity", score: 8, reasoning: "ok" },
            { name: "accuracy", score: 7, reasoning: "ok" },
          ],
          overallScore: 7.5,
          summary: "Good.",
        }),
      });

      const result = await evaluatorHandler(
        makeNode({ criteria: ["clarity", "accuracy"] }),
        makeContext(),
      );

      expect(result.nextNodeId).toBe("passed");
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining("auto-converting"),
        expect.objectContaining({ count: 2 }),
      );
    });

    it("returns error for empty criteria array", async () => {
      const result = await evaluatorHandler(
        makeNode({ criteria: [] }),
        makeContext(),
      );

      expect(result.messages[0].content).toContain("at least one criterion");
    });

    it("clamps passingScore to 0-10 range", async () => {
      mockGenerateText.mockResolvedValue({
        text: JSON.stringify({
          scores: [{ name: "Q", score: 5, reasoning: "ok" }],
          overallScore: 5,
          summary: "Average.",
        }),
      });

      const negativeNode = makeNode({ passingScore: -5 });
      const result = await evaluatorHandler(negativeNode, makeContext());
      expect(result.updatedVariables?.__last_eval).toEqual(
        expect.objectContaining({ passingScore: 0 }),
      );
    });
  });
});
