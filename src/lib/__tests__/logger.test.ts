import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { logger, sanitizeLogData } from "../logger";

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

describe("sanitizeLogData", () => {
  it("passes normal data through unchanged", () => {
    const data = { agentId: "a1", count: 5, active: true };
    expect(sanitizeLogData(data)).toEqual(data);
  });

  it("redacts keys matching sensitive patterns", () => {
    const data = {
      apiKey: "my-secret-key",
      api_key: "another-key",
      token: "jwt-token",
      secret: "s3cr3t",
      password: "hunter2",
      authorization: "Bearer xyz",
      cookie: "session=abc",
      credential: "cred-value",
    };
    const result = sanitizeLogData(data) as Record<string, unknown>;
    for (const key of Object.keys(data)) {
      expect(result[key]).toBe("[REDACTED]");
    }
  });

  it("is case-insensitive for key matching", () => {
    const data = { API_KEY: "key", ApiKey: "key", TOKEN: "tok" };
    const result = sanitizeLogData(data) as Record<string, unknown>;
    expect(result.API_KEY).toBe("[REDACTED]");
    expect(result.ApiKey).toBe("[REDACTED]");
    expect(result.TOKEN).toBe("[REDACTED]");
  });

  it("redacts nested objects with sensitive keys", () => {
    const data = {
      config: {
        apiKey: "nested-key",
        url: "http://example.com",
      },
    };
    const result = sanitizeLogData(data) as Record<string, Record<string, unknown>>;
    expect(result.config.apiKey).toBe("[REDACTED]");
    expect(result.config.url).toBe("http://example.com");
  });

  it("redacts API key patterns in string values", () => {
    expect(sanitizeLogData("sk-1234567890abcdef")).toBe("[REDACTED]");
    expect(sanitizeLogData("pk-live-abc123")).toBe("[REDACTED]");
    expect(sanitizeLogData("ghp_xxxxxxxxxxxx")).toBe("[REDACTED]");
    expect(sanitizeLogData("gho_xxxxxxxxxxxx")).toBe("[REDACTED]");
  });

  it("does not redact normal strings", () => {
    expect(sanitizeLogData("hello world")).toBe("hello world");
    expect(sanitizeLogData("sketchy but fine")).toBe("sketchy but fine");
  });

  it("does not mutate the original object", () => {
    const original = { apiKey: "secret", name: "test" };
    const copy = { ...original };
    sanitizeLogData(original);
    expect(original).toEqual(copy);
  });

  it("handles arrays with sensitive data", () => {
    const data = [
      { apiKey: "key1", name: "a" },
      { token: "tok", id: 1 },
      "sk-plain-string",
    ];
    const result = sanitizeLogData(data) as unknown[];
    expect(result).toEqual([
      { apiKey: "[REDACTED]", name: "a" },
      { token: "[REDACTED]", id: 1 },
      "[REDACTED]",
    ]);
  });

  it("handles null and undefined", () => {
    expect(sanitizeLogData(null)).toBeNull();
    expect(sanitizeLogData(undefined)).toBeUndefined();
  });

  it("handles primitive types", () => {
    expect(sanitizeLogData(42)).toBe(42);
    expect(sanitizeLogData(true)).toBe(true);
  });

  it("redacts sensitive keys in logger.info context", () => {
    logger.info("test", { apiKey: "secret-key", agentId: "a1" });
    const parsed = JSON.parse(output[0].trim());
    expect(parsed.apiKey).toBe("[REDACTED]");
    expect(parsed.agentId).toBe("a1");
  });

  it("redacts sensitive keys in logger.error context", () => {
    logger.error("fail", new Error("oops"), { authorization: "Bearer tok" });
    const parsed = JSON.parse(output[0].trim());
    expect(parsed.authorization).toBe("[REDACTED]");
  });
});
