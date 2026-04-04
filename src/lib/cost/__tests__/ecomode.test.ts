import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  classifyTaskComplexity,
  complexityToTier,
  clearEcomodeCache,
  getEcomodeCacheSize,
} from "../ecomode";

// Mock the AI module
vi.mock("ai", () => ({
  generateObject: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { generateObject } from "ai";
const mockedGenerateObject = vi.mocked(generateObject);

describe("ecomode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearEcomodeCache();
  });

  describe("complexityToTier", () => {
    it("maps simple to fast", () => {
      expect(complexityToTier("simple")).toBe("fast");
    });

    it("maps moderate to balanced", () => {
      expect(complexityToTier("moderate")).toBe("balanced");
    });

    it("maps complex to powerful", () => {
      expect(complexityToTier("complex")).toBe("powerful");
    });
  });

  describe("classifyTaskComplexity", () => {
    const mockModel = "mock-fast-model" as ReturnType<
      typeof import("@/lib/ai").getModel
    >;

    it("returns simple for simple task", async () => {
      mockedGenerateObject.mockResolvedValueOnce({
        object: { complexity: "simple" },
        usage: { promptTokens: 10, completionTokens: 2, totalTokens: 12 },
      } as never);

      const result = await classifyTaskComplexity(
        "What is the capital of France?",
        mockModel
      );
      expect(result).toBe("simple");
    });

    it("returns complex for complex task", async () => {
      mockedGenerateObject.mockResolvedValueOnce({
        object: { complexity: "complex" },
        usage: { promptTokens: 10, completionTokens: 2, totalTokens: 12 },
      } as never);

      const result = await classifyTaskComplexity(
        "Design a microservices architecture for a real-time trading platform with sub-millisecond latency requirements",
        mockModel
      );
      expect(result).toBe("complex");
    });

    it("returns moderate on LLM failure (graceful fallback)", async () => {
      mockedGenerateObject.mockRejectedValueOnce(new Error("LLM unavailable"));

      const result = await classifyTaskComplexity(
        "Some random task",
        mockModel
      );
      expect(result).toBe("moderate");
    });

    it("caches results for same prompt prefix", async () => {
      mockedGenerateObject.mockResolvedValueOnce({
        object: { complexity: "simple" },
        usage: { promptTokens: 10, completionTokens: 2, totalTokens: 12 },
      } as never);

      const prompt = "What is 2 + 2?";
      const result1 = await classifyTaskComplexity(prompt, mockModel);
      const result2 = await classifyTaskComplexity(prompt, mockModel);

      expect(result1).toBe("simple");
      expect(result2).toBe("simple");
      // Should only call LLM once — second call hits cache
      expect(mockedGenerateObject).toHaveBeenCalledTimes(1);
    });

    it("cache does not mix different prompts", async () => {
      mockedGenerateObject
        .mockResolvedValueOnce({
          object: { complexity: "simple" },
          usage: { promptTokens: 10, completionTokens: 2, totalTokens: 12 },
        } as never)
        .mockResolvedValueOnce({
          object: { complexity: "complex" },
          usage: { promptTokens: 10, completionTokens: 2, totalTokens: 12 },
        } as never);

      const r1 = await classifyTaskComplexity("Hello world", mockModel);
      const r2 = await classifyTaskComplexity(
        "Design a distributed consensus algorithm with Byzantine fault tolerance",
        mockModel
      );

      expect(r1).toBe("simple");
      expect(r2).toBe("complex");
      expect(mockedGenerateObject).toHaveBeenCalledTimes(2);
    });

    it("passes model and schema to generateObject", async () => {
      mockedGenerateObject.mockResolvedValueOnce({
        object: { complexity: "moderate" },
        usage: { promptTokens: 10, completionTokens: 2, totalTokens: 12 },
      } as never);

      await classifyTaskComplexity("Test task", mockModel);

      expect(mockedGenerateObject).toHaveBeenCalledWith(
        expect.objectContaining({
          model: mockModel,
          schema: expect.objectContaining({ _def: expect.anything() }),
        })
      );
    });

    it("truncates long prompts to 500 chars in the classify call", async () => {
      mockedGenerateObject.mockResolvedValueOnce({
        object: { complexity: "moderate" },
        usage: { promptTokens: 10, completionTokens: 2, totalTokens: 12 },
      } as never);

      const longPrompt = "x".repeat(2000);
      await classifyTaskComplexity(longPrompt, mockModel);

      const callArgs = mockedGenerateObject.mock.calls[0][0];
      const promptText = (callArgs as Record<string, string>).prompt;
      // The classify prompt should contain at most 500 chars of the original
      expect(promptText.includes("x".repeat(501))).toBe(false);
    });
  });

  describe("cache management", () => {
    const mockModel = "mock-model" as ReturnType<
      typeof import("@/lib/ai").getModel
    >;

    it("clearEcomodeCache clears all entries", async () => {
      mockedGenerateObject.mockResolvedValue({
        object: { complexity: "simple" },
        usage: { promptTokens: 10, completionTokens: 2, totalTokens: 12 },
      } as never);

      await classifyTaskComplexity("test1", mockModel);
      await classifyTaskComplexity("test2", mockModel);
      expect(getEcomodeCacheSize()).toBe(2);

      clearEcomodeCache();
      expect(getEcomodeCacheSize()).toBe(0);
    });
  });
});
