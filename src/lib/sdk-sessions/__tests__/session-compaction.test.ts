import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("ai", () => ({ generateText: vi.fn() }));
vi.mock("@/lib/ai", () => ({ getModel: vi.fn().mockReturnValue("mock-model") }));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { generateText } from "ai";
import {
  compactSessionMessages,
  buildSessionSummaryPreamble,
  readPriorSummary,
} from "../session-compaction";
import type { SessionMessage } from "../persistence";

const mockedGenerateText = vi.mocked(generateText);

function msgs(n: number): SessionMessage[] {
  return Array.from({ length: n }, (_, i) => ({
    role: (i % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
    content: `m${i + 1}`,
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("readPriorSummary", () => {
  it("returns the string when present", () => {
    expect(readPriorSummary({ priorSummary: "hello" })).toBe("hello");
  });
  it("returns undefined for missing/empty/non-string", () => {
    expect(readPriorSummary(null)).toBeUndefined();
    expect(readPriorSummary({})).toBeUndefined();
    expect(readPriorSummary({ priorSummary: "   " })).toBeUndefined();
    expect(readPriorSummary({ priorSummary: 42 })).toBeUndefined();
  });
});

describe("buildSessionSummaryPreamble", () => {
  it("returns empty string when there is no summary", () => {
    expect(buildSessionSummaryPreamble(undefined)).toBe("");
    expect(buildSessionSummaryPreamble("  ")).toBe("");
  });
  it("wraps the summary when present", () => {
    expect(buildSessionSummaryPreamble("S")).toContain("earlier conversation");
    expect(buildSessionSummaryPreamble("S")).toContain("S");
  });
});

describe("compactSessionMessages", () => {
  it("returns messages unchanged when at or below threshold", async () => {
    const input = msgs(5);
    const res = await compactSessionMessages(input, "prev", {
      threshold: 5,
      keepRecent: 2,
    });
    expect(res.messages).toHaveLength(5);
    expect(res.priorSummary).toBe("prev");
    expect(mockedGenerateText).not.toHaveBeenCalled();
  });

  it("summarizes oldest and keeps only the recent tail when over threshold", async () => {
    mockedGenerateText.mockResolvedValueOnce({
      text: "Rolling summary.",
    } as ReturnType<typeof generateText> extends Promise<infer T> ? T : never);

    const res = await compactSessionMessages(msgs(10), undefined, {
      threshold: 5,
      keepRecent: 3,
    });

    expect(mockedGenerateText).toHaveBeenCalledTimes(1);
    expect(res.priorSummary).toBe("Rolling summary.");
    expect(res.messages).toHaveLength(3);
    // Keeps the MOST RECENT messages
    expect(res.messages.at(-1)?.content).toBe("m10");
    expect(res.messages[0]?.content).toBe("m8");
  });

  it("falls back to a plain cap (keeps existing summary) when summarization throws", async () => {
    mockedGenerateText.mockRejectedValueOnce(new Error("rate limit"));

    const res = await compactSessionMessages(msgs(10), "prev", {
      threshold: 5,
      keepRecent: 3,
    });

    expect(res.messages).toHaveLength(3);
    expect(res.priorSummary).toBe("prev");
  });

  it("keeps existing summary when the model returns an empty summary", async () => {
    mockedGenerateText.mockResolvedValueOnce({
      text: "   ",
    } as ReturnType<typeof generateText> extends Promise<infer T> ? T : never);

    const res = await compactSessionMessages(msgs(10), "prev", {
      threshold: 5,
      keepRecent: 3,
    });

    expect(res.messages).toHaveLength(3);
    expect(res.priorSummary).toBe("prev");
  });

  it("feeds the existing prior summary into the summarization prompt", async () => {
    mockedGenerateText.mockResolvedValueOnce({
      text: "New summary.",
    } as ReturnType<typeof generateText> extends Promise<infer T> ? T : never);

    await compactSessionMessages(msgs(10), "EARLIER_SUMMARY_TOKEN", {
      threshold: 5,
      keepRecent: 3,
    });

    const callArgs = mockedGenerateText.mock.calls[0]?.[0];
    expect(callArgs?.prompt).toContain("EARLIER_SUMMARY_TOKEN");
  });
});
