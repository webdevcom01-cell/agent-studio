import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  shouldCompact,
  compactContext,
  COMPACTION_THRESHOLD,
  CONTEXT_SUMMARY_VAR,
} from "../context-compaction";
import type { RuntimeContext } from "../types";

// ── Mocks ────────────────────────────────────────────────────────────────

vi.mock("ai", () => ({
  generateText: vi.fn(),
}));

vi.mock("@/lib/ai", () => ({
  getModel: vi.fn().mockReturnValue("mock-model"),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    agentMemory: {
      create: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      deleteMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { generateText } from "ai";
import { prisma } from "@/lib/prisma";

const mockedGenerateText = vi.mocked(generateText);
const mockedPrisma = vi.mocked(prisma);

// ── Helpers ──────────────────────────────────────────────────────────────

function createContext(overrides?: Partial<RuntimeContext>): RuntimeContext {
  return {
    agentId: "agent-1",
    conversationId: "conv-1",
    flowContent: { nodes: [], edges: [], variables: [] },
    variables: {},
    currentNodeId: null,
    messageHistory: [],
    isNewConversation: false,
    ...overrides,
  };
}

function buildHistory(count: number): RuntimeContext["messageHistory"] {
  return Array.from({ length: count }, (_, i) => ({
    role: (i % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
    content: `Message ${i + 1}`,
  }));
}

// ── Tests ────────────────────────────────────────────────────────────────

describe("shouldCompact", () => {
  it("returns false when history is below threshold", () => {
    const ctx = createContext({ messageHistory: buildHistory(50) });
    expect(shouldCompact(ctx)).toBe(false);
  });

  it("returns false when history is exactly at threshold", () => {
    const ctx = createContext({ messageHistory: buildHistory(COMPACTION_THRESHOLD) });
    expect(shouldCompact(ctx)).toBe(false);
  });

  it("returns true when history exceeds threshold", () => {
    const ctx = createContext({ messageHistory: buildHistory(COMPACTION_THRESHOLD + 1) });
    expect(shouldCompact(ctx)).toBe(true);
  });

  it("returns false when enableSmartCompaction is false", () => {
    const ctx = createContext({
      messageHistory: buildHistory(COMPACTION_THRESHOLD + 10),
      enableSmartCompaction: false,
    });
    expect(shouldCompact(ctx)).toBe(false);
  });

  it("returns true when enableSmartCompaction is undefined (default on)", () => {
    const ctx = createContext({ messageHistory: buildHistory(COMPACTION_THRESHOLD + 1) });
    expect(ctx.enableSmartCompaction).toBeUndefined();
    expect(shouldCompact(ctx)).toBe(true);
  });
});

describe("compactContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("generates summary and stores in variables + AgentMemory", async () => {
    const ctx = createContext({ messageHistory: buildHistory(85) });

    mockedGenerateText.mockResolvedValueOnce({
      text: "User discussed project architecture and decided to use PostgreSQL.",
    } as ReturnType<typeof generateText> extends Promise<infer T> ? T : never);

    const summary = await compactContext(ctx);

    expect(summary).toBe("User discussed project architecture and decided to use PostgreSQL.");

    // Stored in context.variables for system prompt injection
    expect(ctx.variables[CONTEXT_SUMMARY_VAR]).toBe(summary);

    // Persisted to AgentMemory
    expect(mockedPrisma.agentMemory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          agentId: "agent-1",
          category: "context_compaction",
          importance: 0.9,
        }),
      })
    );
  });

  it("returns null and does not crash when AI call fails", async () => {
    const ctx = createContext({ messageHistory: buildHistory(85) });

    mockedGenerateText.mockRejectedValueOnce(new Error("API rate limit"));

    const summary = await compactContext(ctx);

    expect(summary).toBeNull();
    // Variables should NOT have a summary key
    expect(ctx.variables[CONTEXT_SUMMARY_VAR]).toBeUndefined();
    // AgentMemory should NOT be called
    expect(mockedPrisma.agentMemory.create).not.toHaveBeenCalled();
  });

  it("returns null when AI returns empty summary", async () => {
    const ctx = createContext({ messageHistory: buildHistory(85) });

    mockedGenerateText.mockResolvedValueOnce({
      text: "   ",
    } as ReturnType<typeof generateText> extends Promise<infer T> ? T : never);

    const summary = await compactContext(ctx);

    expect(summary).toBeNull();
    expect(ctx.variables[CONTEXT_SUMMARY_VAR]).toBeUndefined();
  });

  it("cleans up old summaries beyond MAX_SUMMARIES_PER_AGENT", async () => {
    const ctx = createContext({ messageHistory: buildHistory(85) });

    mockedGenerateText.mockResolvedValueOnce({
      text: "New summary",
    } as ReturnType<typeof generateText> extends Promise<infer T> ? T : never);

    // Simulate 6 existing summaries (limit is 5)
    const existingSummaries = Array.from({ length: 6 }, (_, i) => ({
      id: `summary-${i}`,
    }));
    mockedPrisma.agentMemory.findMany.mockResolvedValueOnce(existingSummaries);

    await compactContext(ctx);

    // Should delete the oldest one (index 5, beyond limit of 5)
    expect(mockedPrisma.agentMemory.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["summary-5"] } },
    });
  });

  it("uses conversation content in the summarization prompt", async () => {
    const ctx = createContext({
      messageHistory: [
        { role: "user", content: "My name is Alice" },
        { role: "assistant", content: "Hello Alice!" },
        ...buildHistory(80),
      ],
    });

    mockedGenerateText.mockResolvedValueOnce({
      text: "User is Alice.",
    } as ReturnType<typeof generateText> extends Promise<infer T> ? T : never);

    await compactContext(ctx);

    const callArgs = mockedGenerateText.mock.calls[0]?.[0];
    expect(callArgs?.prompt).toContain("My name is Alice");
    expect(callArgs?.prompt).toContain("Hello Alice!");
  });
});
