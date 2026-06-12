import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { isKeySet } from "../tools/diagnostics.js";

describe("isKeySet", () => {
  const ORIGINAL = process.env.TEST_DIAG_KEY;

  beforeEach(() => {
    delete process.env.TEST_DIAG_KEY;
  });

  afterEach(() => {
    if (ORIGINAL !== undefined) {
      process.env.TEST_DIAG_KEY = ORIGINAL;
    } else {
      delete process.env.TEST_DIAG_KEY;
    }
  });

  it("returns false when key is missing", () => {
    expect(isKeySet("TEST_DIAG_KEY")).toBe(false);
  });

  it("returns false when key is empty string", () => {
    process.env.TEST_DIAG_KEY = "";
    expect(isKeySet("TEST_DIAG_KEY")).toBe(false);
  });

  it("returns false for 'your_api_key_here' placeholder", () => {
    process.env.TEST_DIAG_KEY = "your_api_key_here";
    expect(isKeySet("TEST_DIAG_KEY")).toBe(false);
  });

  it("returns false for 'your-secret-key-here' placeholder", () => {
    process.env.TEST_DIAG_KEY = "your-secret-key-here";
    expect(isKeySet("TEST_DIAG_KEY")).toBe(false);
  });

  it("returns false for 'changeme'", () => {
    process.env.TEST_DIAG_KEY = "changeme";
    expect(isKeySet("TEST_DIAG_KEY")).toBe(false);
  });

  it("returns false for 'placeholder'", () => {
    process.env.TEST_DIAG_KEY = "placeholder";
    expect(isKeySet("TEST_DIAG_KEY")).toBe(false);
  });

  it("returns true for a real OpenAI-style key", () => {
    process.env.TEST_DIAG_KEY = "sk-proj-abc123XYZdef456uvwxyz789";
    expect(isKeySet("TEST_DIAG_KEY")).toBe(true);
  });

  it("returns true for a real Anthropic-style key", () => {
    process.env.TEST_DIAG_KEY = "sk-ant-api03-abc123";
    expect(isKeySet("TEST_DIAG_KEY")).toBe(true);
  });
});
