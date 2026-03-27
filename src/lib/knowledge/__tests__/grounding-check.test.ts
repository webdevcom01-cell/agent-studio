import { describe, it, expect, vi, beforeEach } from "vitest";
import { checkGrounding } from "../grounding-check";
import type { SearchResult } from "../search";

// ── Mock Vercel AI SDK ─────────────────────────────────────────────────────

vi.mock("ai", () => ({
  generateObject: vi.fn(),
}));

vi.mock("@/lib/ai", () => ({
  getModel: vi.fn(() => "mock-model"),
  DEFAULT_MODEL: "mock-model",
}));

vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

import { generateObject } from "ai";

const mockGenerateObject = vi.mocked(generateObject);

// ── Helpers ────────────────────────────────────────────────────────────────

function makeChunk(content: string): SearchResult {
  return {
    id: "c1",
    content,
    sourceId: "s1",
    sourceName: "Test Doc",
    sourceUrl: null,
    relevanceScore: 0.9,
    chunkIndex: 0,
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("checkGrounding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns score 1 and empty claims when no chunks provided", async () => {
    const result = await checkGrounding("Some response text", []);
    expect(result.overallScore).toBe(1);
    expect(result.claims).toHaveLength(0);
  });

  it("returns score 1 and empty claims when agentResponse is empty", async () => {
    const result = await checkGrounding("", [makeChunk("Some context")]);
    expect(result.overallScore).toBe(1);
    expect(result.claims).toHaveLength(0);
  });

  it("returns score 1 and empty claims when agentResponse is whitespace only", async () => {
    const result = await checkGrounding("   ", [makeChunk("Some context")]);
    expect(result.overallScore).toBe(1);
    expect(result.claims).toHaveLength(0);
  });

  it("calls generateObject when chunks and response are provided", async () => {
    mockGenerateObject.mockResolvedValueOnce({
      object: {
        overallScore: 0.9,
        claims: [{ claim: "The price is $10", supported: true, sourceIndex: 1 }],
      },
    } as never);

    const result = await checkGrounding(
      "The price is $10 per month.",
      [makeChunk("Our pricing is $10 per month for the basic plan.")],
    );

    expect(mockGenerateObject).toHaveBeenCalledOnce();
    expect(result.overallScore).toBe(0.9);
    expect(result.claims).toHaveLength(1);
    expect(result.claims[0].supported).toBe(true);
  });

  it("caps chunks at 5 for the grounding prompt", async () => {
    mockGenerateObject.mockResolvedValueOnce({
      object: { overallScore: 0.8, claims: [] },
    } as never);

    const chunks = Array.from({ length: 10 }, (_, i) =>
      makeChunk(`Chunk content number ${i + 1}`),
    );

    await checkGrounding("Some response", chunks);

    const callArgs = mockGenerateObject.mock.calls[0][0] as { prompt: string };
    // Should only include up to 5 chunks — check that [6] is not in the prompt
    expect(callArgs.prompt).not.toContain("Chunk content number 6");
    expect(callArgs.prompt).toContain("Chunk content number 1");
  });

  it("returns fallback {overallScore: 1, claims: []} when generateObject throws", async () => {
    mockGenerateObject.mockRejectedValueOnce(new Error("LLM unavailable"));

    const result = await checkGrounding(
      "The system supports OAuth.",
      [makeChunk("Our system uses OAuth 2.0 for authentication.")],
    );

    expect(result.overallScore).toBe(1);
    expect(result.claims).toHaveLength(0);
  });

  it("returns unsupported claims when response has hallucinated content", async () => {
    mockGenerateObject.mockResolvedValueOnce({
      object: {
        overallScore: 0.3,
        claims: [
          { claim: "Price is $5", supported: false },
          { claim: "Free tier available", supported: false },
          { claim: "Available in US", supported: true, sourceIndex: 1 },
        ],
      },
    } as never);

    const result = await checkGrounding(
      "Price is $5. Free tier available. Available in US.",
      [makeChunk("Our service is available in the US.")],
    );

    expect(result.overallScore).toBe(0.3);
    expect(result.claims.filter((c) => !c.supported)).toHaveLength(2);
    expect(result.claims.filter((c) => c.supported)).toHaveLength(1);
  });

  it("passes the agent response and sources in the prompt", async () => {
    mockGenerateObject.mockResolvedValueOnce({
      object: { overallScore: 1.0, claims: [] },
    } as never);

    await checkGrounding(
      "My specific response text",
      [makeChunk("My specific source content")],
    );

    const callArgs = mockGenerateObject.mock.calls[0][0] as { prompt: string };
    expect(callArgs.prompt).toContain("My specific response text");
    expect(callArgs.prompt).toContain("My specific source content");
  });

  it("truncates long agent responses to 1000 chars in the prompt", async () => {
    mockGenerateObject.mockResolvedValueOnce({
      object: { overallScore: 1.0, claims: [] },
    } as never);

    // Use a character that does not appear in any prompt template text
    const longResponse = "§".repeat(2000);
    await checkGrounding(longResponse, [makeChunk("context")]);

    const callArgs = mockGenerateObject.mock.calls[0][0] as { prompt: string };
    // The prompt should contain at most 1000 §'s (response truncated to 1000 chars)
    const count = (callArgs.prompt.match(/§/g) ?? []).length;
    expect(count).toBeLessThanOrEqual(1000);
  });

  it("truncates chunk content to 300 chars per chunk", async () => {
    mockGenerateObject.mockResolvedValueOnce({
      object: { overallScore: 1.0, claims: [] },
    } as never);

    const longChunk = "z".repeat(600);
    await checkGrounding("Some response", [makeChunk(longChunk)]);

    const callArgs = mockGenerateObject.mock.calls[0][0] as { prompt: string };
    const zCount = (callArgs.prompt.match(/z/g) ?? []).length;
    expect(zCount).toBeLessThanOrEqual(300);
  });
});
