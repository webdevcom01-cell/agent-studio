import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockEmbed = vi.hoisted(() => vi.fn());
const mockEmbedMany = vi.hoisted(() => vi.fn());
const mockGetEmbeddingModel = vi.hoisted(() => vi.fn(() => "mock-model"));
const mockGetEmbeddingModelById = vi.hoisted(() => vi.fn(() => "mock-model-by-id"));
const mockLogger = vi.hoisted(() => ({
  warn: vi.fn(),
  info: vi.fn(),
  error: vi.fn(),
}));

vi.mock("ai", () => ({ embed: mockEmbed, embedMany: mockEmbedMany }));
vi.mock("@/lib/ai", () => ({
  getEmbeddingModel: mockGetEmbeddingModel,
  getEmbeddingModelById: mockGetEmbeddingModelById,
}));
vi.mock("@/lib/logger", () => ({ logger: mockLogger }));

// Fast-forward timers so we don't actually wait for backoff delays
vi.useFakeTimers();

import { generateEmbedding, generateEmbeddings } from "../embeddings";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeApiError(status: number): Error {
  const err = new Error(`OpenAI error ${status}`) as Error & { status: number };
  err.status = status;
  return err;
}

/** Runs a promise while advancing fake timers to unblock setTimeout delays. */
async function runWithTimers<T>(promise: Promise<T>): Promise<T> {
  const settled: { value?: T; error?: unknown; done: boolean } = { done: false };

  promise.then(
    (v) => { settled.value = v; settled.done = true; },
    (e) => { settled.error = e; settled.done = true; }
  );

  // Advance timers up to 4 times (covers 3 retries × jittered delays)
  for (let i = 0; i < 10 && !settled.done; i++) {
    await vi.runAllTimersAsync();
    await Promise.resolve();
  }

  if (!settled.done) throw new Error("Promise never settled");
  if ("error" in settled && settled.error !== undefined) throw settled.error;
  return settled.value as T;
}

// ── generateEmbedding ─────────────────────────────────────────────────────────

describe("generateEmbedding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the embedding on the first successful call", async () => {
    const expected = [0.1, 0.2, 0.3];
    mockEmbed.mockResolvedValueOnce({ embedding: expected });

    const result = await generateEmbedding("hello world");

    expect(result).toEqual(expected);
    expect(mockEmbed).toHaveBeenCalledTimes(1);
  });

  it("uses getEmbeddingModelById when modelId is provided", async () => {
    mockEmbed.mockResolvedValueOnce({ embedding: [1, 2] });

    await generateEmbedding("text", "text-embedding-3-large");

    expect(mockGetEmbeddingModelById).toHaveBeenCalledWith("text-embedding-3-large");
    expect(mockGetEmbeddingModel).not.toHaveBeenCalled();
  });

  it("retries on 429 and succeeds on second attempt", async () => {
    mockEmbed
      .mockRejectedValueOnce(makeApiError(429))
      .mockResolvedValueOnce({ embedding: [0.5, 0.6] });

    const result = await runWithTimers(generateEmbedding("retry me"));

    expect(result).toEqual([0.5, 0.6]);
    expect(mockEmbed).toHaveBeenCalledTimes(2);
    expect(mockLogger.warn).toHaveBeenCalledOnce();
  });

  it("retries on 503 and succeeds on third attempt", async () => {
    mockEmbed
      .mockRejectedValueOnce(makeApiError(503))
      .mockRejectedValueOnce(makeApiError(503))
      .mockResolvedValueOnce({ embedding: [0.9] });

    const result = await runWithTimers(generateEmbedding("retry 503"));

    expect(result).toEqual([0.9]);
    expect(mockEmbed).toHaveBeenCalledTimes(3);
  });

  it("throws after exhausting all retries on persistent 429", async () => {
    mockEmbed.mockRejectedValue(makeApiError(429));

    await expect(runWithTimers(generateEmbedding("always fails"))).rejects.toThrow(
      "OpenAI error 429"
    );
    // 1 initial + 3 retries = 4 total calls
    expect(mockEmbed).toHaveBeenCalledTimes(4);
  });

  it("does NOT retry on 400 (bad request — not transient)", async () => {
    mockEmbed.mockRejectedValueOnce(makeApiError(400));

    await expect(generateEmbedding("bad input")).rejects.toThrow("OpenAI error 400");
    expect(mockEmbed).toHaveBeenCalledTimes(1);
    expect(mockLogger.warn).not.toHaveBeenCalled();
  });

  it("does NOT retry on unknown non-status errors", async () => {
    mockEmbed.mockRejectedValueOnce(new Error("unexpected network error"));

    await expect(generateEmbedding("bad")).rejects.toThrow("unexpected network error");
    expect(mockEmbed).toHaveBeenCalledTimes(1);
  });
});

// ── generateEmbeddings ────────────────────────────────────────────────────────

describe("generateEmbeddings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty array for empty input", async () => {
    const result = await generateEmbeddings([]);
    expect(result).toEqual([]);
    expect(mockEmbedMany).not.toHaveBeenCalled();
  });

  it("returns all embeddings in a single batch (≤100 texts)", async () => {
    const embeddings = [[1, 2], [3, 4], [5, 6]];
    mockEmbedMany.mockResolvedValueOnce({ embeddings });

    const result = await generateEmbeddings(["a", "b", "c"]);

    expect(result).toEqual(embeddings);
    expect(mockEmbedMany).toHaveBeenCalledTimes(1);
  });

  it("splits into two batches when more than 100 texts are provided", async () => {
    const batch1 = Array.from({ length: 100 }, (_, i) => [i]);
    const batch2 = Array.from({ length: 20 }, (_, i) => [i + 100]);
    mockEmbedMany
      .mockResolvedValueOnce({ embeddings: batch1 })
      .mockResolvedValueOnce({ embeddings: batch2 });

    const texts = Array.from({ length: 120 }, (_, i) => `text-${i}`);
    const result = await generateEmbeddings(texts);

    expect(result).toHaveLength(120);
    expect(mockEmbedMany).toHaveBeenCalledTimes(2);
  });

  it("retries a failed batch on 429", async () => {
    const embeddings = [[0.1, 0.2]];
    mockEmbedMany
      .mockRejectedValueOnce(makeApiError(429))
      .mockResolvedValueOnce({ embeddings });

    const result = await runWithTimers(generateEmbeddings(["hello"]));

    expect(result).toEqual(embeddings);
    expect(mockEmbedMany).toHaveBeenCalledTimes(2);
    expect(mockLogger.warn).toHaveBeenCalledOnce();
  });

  it("propagates error after max retries", async () => {
    mockEmbedMany.mockRejectedValue(makeApiError(429));

    await expect(runWithTimers(generateEmbeddings(["text"]))).rejects.toThrow(
      "OpenAI error 429"
    );
    expect(mockEmbedMany).toHaveBeenCalledTimes(4); // 1 + 3 retries
  });
});
