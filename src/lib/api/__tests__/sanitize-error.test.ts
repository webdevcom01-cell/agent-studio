import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockLogger = vi.hoisted(() => ({
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({ logger: mockLogger }));

import { sanitizeErrorMessage } from "../sanitize-error";

const originalEnv = process.env.NODE_ENV;

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  process.env.NODE_ENV = originalEnv;
});

describe("sanitizeErrorMessage", () => {
  it("returns generic message in production", () => {
    process.env.NODE_ENV = "production";
    const result = sanitizeErrorMessage(new Error("DB connection refused at 10.0.0.1:5432"));
    expect(result).toBe("An internal error occurred");
  });

  it("returns actual error message in development", () => {
    process.env.NODE_ENV = "development";
    const result = sanitizeErrorMessage(new Error("DB connection refused"));
    expect(result).toBe("DB connection refused");
  });

  it("returns actual error message in test environment", () => {
    process.env.NODE_ENV = "test";
    const result = sanitizeErrorMessage(new Error("something broke"));
    expect(result).toBe("something broke");
  });

  it("handles non-Error objects (string)", () => {
    process.env.NODE_ENV = "development";
    const result = sanitizeErrorMessage("string error");
    expect(result).toBe("string error");
  });

  it("handles non-Error objects (number)", () => {
    process.env.NODE_ENV = "production";
    const result = sanitizeErrorMessage(42);
    expect(result).toBe("An internal error occurred");
  });

  it("handles null/undefined", () => {
    process.env.NODE_ENV = "development";
    expect(sanitizeErrorMessage(null)).toBe("null");
    expect(sanitizeErrorMessage(undefined)).toBe("undefined");
  });

  it("always logs full error regardless of environment", () => {
    process.env.NODE_ENV = "production";
    const err = new Error("secret DB password leaked");
    sanitizeErrorMessage(err, "Request failed");

    expect(mockLogger.error).toHaveBeenCalledWith("Request failed", err);
  });

  it("logs with default context when none provided", () => {
    process.env.NODE_ENV = "production";
    sanitizeErrorMessage(new Error("oops"));

    expect(mockLogger.error).toHaveBeenCalledWith(
      "Unhandled error",
      expect.any(Error)
    );
  });
});
