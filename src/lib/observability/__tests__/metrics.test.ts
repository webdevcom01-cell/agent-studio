import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  recordMetric,
  recordChatLatency,
  recordTokenUsage,
  recordSkillCall,
  recordInstinctPromotion,
  flushMetrics,
  stopMetricsFlusher,
} from "../metrics";

describe("metrics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stopMetricsFlusher();
  });

  it("recordMetric buffers metrics for flushing", async () => {
    recordMetric("test.counter", 1, "count", { env: "test" });
    recordMetric("test.counter", 2, "count", { env: "test" });

    const flushed = await flushMetrics();
    expect(flushed).toBe(2);
  });

  it("flushMetrics returns 0 when buffer is empty", async () => {
    const flushed = await flushMetrics();
    expect(flushed).toBe(0);
  });

  it("recordChatLatency records with correct metric name", async () => {
    recordChatLatency("agent-1", "deepseek-chat", 150);
    const flushed = await flushMetrics();
    expect(flushed).toBe(1);
  });

  it("recordTokenUsage records two metrics (input + output)", async () => {
    recordTokenUsage("agent-1", "gpt-4o", 100, 200);
    const flushed = await flushMetrics();
    expect(flushed).toBe(2);
  });

  it("recordSkillCall records duration metric", async () => {
    recordSkillCall("api-design", 45, true);
    const flushed = await flushMetrics();
    expect(flushed).toBe(1);
  });

  it("recordInstinctPromotion records count metric", async () => {
    recordInstinctPromotion("agent-1");
    const flushed = await flushMetrics();
    expect(flushed).toBe(1);
  });

  it("flush logs the batch count", async () => {
    const { logger } = vi.mocked(await import("@/lib/logger"));
    recordMetric("test", 1, "count");
    await flushMetrics();
    expect(logger.info).toHaveBeenCalledWith("metrics_flush", { count: 1 });
  });
});
