import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { logger } from "../logger";

let output: string[];

beforeEach(() => {
  output = [];
  vi.spyOn(process.stdout, "write").mockImplementation((chunk: string | Uint8Array) => {
    output.push(String(chunk));
    return true;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("logger", () => {
  it("outputs valid JSON for info", () => {
    logger.info("test message", { agentId: "a1" });
    const parsed = JSON.parse(output[0].trim());
    expect(parsed.level).toBe("info");
    expect(parsed.message).toBe("test message");
    expect(parsed.agentId).toBe("a1");
    expect(parsed.timestamp).toBeDefined();
  });

  it("outputs valid JSON for warn", () => {
    logger.warn("warning message");
    const parsed = JSON.parse(output[0].trim());
    expect(parsed.level).toBe("warn");
    expect(parsed.message).toBe("warning message");
  });

  it("includes error details for Error instances", () => {
    const err = new Error("test error");
    logger.error("something failed", err, { agentId: "a2" });
    const parsed = JSON.parse(output[0].trim());
    expect(parsed.level).toBe("error");
    expect(parsed.message).toBe("something failed");
    expect(parsed.errorMessage).toBe("test error");
    expect(parsed.stack).toContain("Error: test error");
    expect(parsed.agentId).toBe("a2");
  });

  it("converts non-Error to string", () => {
    logger.error("failed", "string error");
    const parsed = JSON.parse(output[0].trim());
    expect(parsed.errorMessage).toBe("string error");
  });

  it("handles error call with no error param", () => {
    logger.error("just a message");
    const parsed = JSON.parse(output[0].trim());
    expect(parsed.level).toBe("error");
    expect(parsed.errorMessage).toBeUndefined();
  });
});
