import { describe, it, expect, vi, beforeEach } from "vitest";
import { validateEnv } from "../env";

const VALID_ENV = {
  DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
  DIRECT_URL: "postgresql://user:pass@localhost:5432/db",
  OPENAI_API_KEY: "sk-test-openai",
  DEEPSEEK_API_KEY: "sk-test-deepseek",
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
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    validateEnv(VALID_ENV);

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("ANTHROPIC_API_KEY")
    );
  });

  it("does not warn when ANTHROPIC_API_KEY is present", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    validateEnv({ ...VALID_ENV, ANTHROPIC_API_KEY: "sk-test-anthropic" });

    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("includes all missing vars in error message", () => {
    expect(() => validateEnv({})).toThrow(/DATABASE_URL[\s\S]*OPENAI_API_KEY/);
  });

  it("accepts valid NODE_ENV values", () => {
    const result = validateEnv({ ...VALID_ENV, NODE_ENV: "production" });
    expect(result.NODE_ENV).toBe("production");
  });
});
