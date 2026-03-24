import { describe, it, expect, vi, beforeEach } from "vitest";

const mockLogger = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({ logger: mockLogger }));

import { validateEnv } from "../env";

const VALID_ENV = {
  DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
  DIRECT_URL: "postgresql://user:pass@localhost:5432/db",
  OPENAI_API_KEY: "sk-test-openai",
  DEEPSEEK_API_KEY: "sk-test-deepseek",
  AUTH_SECRET: "Q3ngdTFbDW7oZhaygY+GconLJkxdbLtZw/c3VnvRgEw=",
  AUTH_GITHUB_ID: "test-github-id",
  AUTH_GITHUB_SECRET: "test-github-secret",
  AUTH_GOOGLE_ID: "test-google-id",
  AUTH_GOOGLE_SECRET: "test-google-secret",
};

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("validateEnv", () => {
  it("returns typed config when all required vars are present", () => {
    const result = validateEnv(VALID_ENV);

    expect(result.DATABASE_URL).toBe(VALID_ENV.DATABASE_URL);
    expect(result.OPENAI_API_KEY).toBe(VALID_ENV.OPENAI_API_KEY);
    expect(result.DEEPSEEK_API_KEY).toBe(VALID_ENV.DEEPSEEK_API_KEY);
    expect(result.NODE_ENV).toBe("development");
  });

  it("throws when DATABASE_URL is missing", () => {
    const { DATABASE_URL: _, ...env } = VALID_ENV;
    void _;
    expect(() => validateEnv(env)).toThrow("DATABASE_URL");
  });

  it("throws when DIRECT_URL is missing", () => {
    const { DIRECT_URL: _, ...env } = VALID_ENV;
    void _;
    expect(() => validateEnv(env)).toThrow("DIRECT_URL");
  });

  it("throws when OPENAI_API_KEY is missing", () => {
    const { OPENAI_API_KEY: _, ...env } = VALID_ENV;
    void _;
    expect(() => validateEnv(env)).toThrow("OPENAI_API_KEY");
  });

  it("throws when DEEPSEEK_API_KEY is missing", () => {
    const { DEEPSEEK_API_KEY: _, ...env } = VALID_ENV;
    void _;
    expect(() => validateEnv(env)).toThrow("DEEPSEEK_API_KEY");
  });

  it("throws when required var is empty string", () => {
    expect(() => validateEnv({ ...VALID_ENV, OPENAI_API_KEY: "" })).toThrow(
      "OPENAI_API_KEY"
    );
  });

  it("warns when ANTHROPIC_API_KEY is missing", () => {
    validateEnv(VALID_ENV);

    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining("ANTHROPIC_API_KEY")
    );
  });

  it("does not warn when all optional keys are present", () => {
    validateEnv({
      ...VALID_ENV,
      ANTHROPIC_API_KEY: "sk-test-anthropic",
      GOOGLE_GENERATIVE_AI_API_KEY: "sk-test-google",
      GROQ_API_KEY: "sk-test-groq",
      MISTRAL_API_KEY: "sk-test-mistral",
      MOONSHOT_API_KEY: "sk-test-moonshot",
    });

    expect(mockLogger.warn).not.toHaveBeenCalled();
  });

  it("throws when AUTH_SECRET is missing", () => {
    const { AUTH_SECRET: _, ...env } = VALID_ENV;
    void _;
    expect(() => validateEnv(env)).toThrow("AUTH_SECRET");
  });

  it("throws when AUTH_SECRET is too short", () => {
    expect(() => validateEnv({ ...VALID_ENV, AUTH_SECRET: "short" })).toThrow(
      "AUTH_SECRET"
    );
  });

  it("does not throw when AUTH_GITHUB_ID is missing (optional)", () => {
    const { AUTH_GITHUB_ID: _, ...env } = VALID_ENV;
    void _;
    expect(() => validateEnv(env)).not.toThrow();
  });

  it("does not throw when AUTH_GOOGLE_SECRET is missing (optional)", () => {
    const { AUTH_GOOGLE_SECRET: _, ...env } = VALID_ENV;
    void _;
    expect(() => validateEnv(env)).not.toThrow();
  });

  it("treats empty string as undefined for optional keys", () => {
    const result = validateEnv({ ...VALID_ENV, AUTH_GITHUB_ID: "" });
    expect(result.AUTH_GITHUB_ID).toBeUndefined();
  });

  it("includes all missing vars in error message", () => {
    expect(() => validateEnv({})).toThrow(/DATABASE_URL[\s\S]*OPENAI_API_KEY/);
  });

  it("accepts valid NODE_ENV values", () => {
    const result = validateEnv({ ...VALID_ENV, NODE_ENV: "production" });
    expect(result.NODE_ENV).toBe("production");
  });
});
