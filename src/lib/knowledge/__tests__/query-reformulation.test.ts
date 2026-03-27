import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ChatMessage } from "../query-reformulation";

// ── Mock the AI module so tests don't hit real APIs ──────────────────────────
vi.mock("ai", () => ({
  generateText: vi.fn(),
}));

vi.mock("@/lib/ai", () => ({
  getModel: vi.fn().mockReturnValue("mock-model"),
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// Import AFTER mocks are set up
import { reformulateWithHistory } from "../query-reformulation";
import { generateText } from "ai";

const mockGenerateText = vi.mocked(generateText);

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Fast-path tests (no LLM calls expected) ───────────────────────────────────

describe("reformulateWithHistory — fast path (no LLM calls)", () => {
  it("returns original query when history is empty", async () => {
    const result = await reformulateWithHistory("What is TypeScript?", []);
    expect(result).toBe("What is TypeScript?");
    expect(mockGenerateText).not.toHaveBeenCalled();
  });

  it("returns original query for standalone question with no pronouns", async () => {
    const history: ChatMessage[] = [
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi there!" },
    ];
    const result = await reformulateWithHistory(
      "What are the benefits of using pgvector for semantic search?",
      history,
    );
    expect(result).toBe("What are the benefits of using pgvector for semantic search?");
    expect(mockGenerateText).not.toHaveBeenCalled();
  });
});

// ── LLM reformulation tests ───────────────────────────────────────────────────

describe("reformulateWithHistory — LLM reformulation triggered", () => {
  const baseHistory: ChatMessage[] = [
    { role: "user", content: "Tell me about pgvector indexes" },
    { role: "assistant", content: "pgvector supports IVFFlat and HNSW indexes for ANN search." },
  ];

  it("reformulates anaphoric query 'tell me more'", async () => {
    mockGenerateText.mockResolvedValueOnce({ text: "tell me more about pgvector HNSW indexes" } as never);

    const result = await reformulateWithHistory("tell me more", baseHistory);
    expect(result).toBe("tell me more about pgvector HNSW indexes");
    expect(mockGenerateText).toHaveBeenCalledTimes(1);
  });

  it("reformulates pronoun query 'and what about it?'", async () => {
    mockGenerateText.mockResolvedValueOnce({ text: "what about pgvector HNSW index memory usage?" } as never);

    const result = await reformulateWithHistory("and what about it?", baseHistory);
    expect(result).toBe("what about pgvector HNSW index memory usage?");
  });

  it("reformulates very short query (3 words or fewer)", async () => {
    mockGenerateText.mockResolvedValueOnce({ text: "compare IVFFlat vs HNSW pgvector indexes" } as never);

    const result = await reformulateWithHistory("compare them", baseHistory);
    expect(result).toBe("compare IVFFlat vs HNSW pgvector indexes");
  });

  it("reformulates query containing 'this'", async () => {
    mockGenerateText.mockResolvedValueOnce({ text: "how does HNSW index work in pgvector?" } as never);

    const result = await reformulateWithHistory("how does this work?", baseHistory);
    expect(result).toBe("how does HNSW index work in pgvector?");
  });
});

// ── Error handling ─────────────────────────────────────────────────────────────

describe("reformulateWithHistory — error handling", () => {
  const history: ChatMessage[] = [
    { role: "user", content: "Tell me about RAG" },
    { role: "assistant", content: "RAG stands for Retrieval-Augmented Generation." },
  ];

  it("falls back to original query when LLM throws", async () => {
    mockGenerateText.mockRejectedValueOnce(new Error("API rate limit"));

    const result = await reformulateWithHistory("tell me more", history);
    expect(result).toBe("tell me more");
  });

  it("falls back to original query when LLM returns empty string", async () => {
    mockGenerateText.mockResolvedValueOnce({ text: "" } as never);

    const result = await reformulateWithHistory("tell me more", history);
    expect(result).toBe("tell me more");
  });

  it("falls back to original query when LLM returns whitespace only", async () => {
    mockGenerateText.mockResolvedValueOnce({ text: "  \n  " } as never);

    const result = await reformulateWithHistory("it", history);
    expect(result).toBe("it");
  });
});

// ── Sliding window ─────────────────────────────────────────────────────────────

describe("reformulateWithHistory — sliding window", () => {
  it("only passes last 6 non-system messages to LLM", async () => {
    // Build a long history — 10 exchanges
    const longHistory: ChatMessage[] = Array.from({ length: 10 }, (_, i) => [
      { role: "user" as const, content: `User message ${i}` },
      { role: "assistant" as const, content: `Assistant reply ${i}` },
    ]).flat();

    mockGenerateText.mockResolvedValueOnce({ text: "reformulated query" } as never);

    await reformulateWithHistory("this", longHistory);

    const callArg = mockGenerateText.mock.calls[0][0] as { prompt: string };
    // The prompt should contain messages 7-10 (last 6) but NOT message 0
    expect(callArg.prompt).not.toContain("User message 0");
    // Should contain the latest messages
    expect(callArg.prompt).toContain("User message 9");
  });

  it("ignores system messages in the window", async () => {
    const historyWithSystem: ChatMessage[] = [
      { role: "system", content: "You are a helpful assistant." },
      { role: "user", content: "What is HNSW?" },
      { role: "assistant", content: "HNSW is a graph-based index." },
    ];

    mockGenerateText.mockResolvedValueOnce({ text: "HNSW details" } as never);

    await reformulateWithHistory("it", historyWithSystem);

    const callArg = mockGenerateText.mock.calls[0][0] as { prompt: string };
    expect(callArg.prompt).not.toContain("You are a helpful assistant.");
    expect(callArg.prompt).toContain("What is HNSW?");
  });
});
