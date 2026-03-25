import { describe, it, expect } from "vitest";
import { cliConfigSchema, cliCommandSchema, cliParameterSchema } from "../types";

describe("cliConfigSchema", () => {
  it("validates minimal config", () => {
    const result = cliConfigSchema.safeParse({
      cliPath: "/usr/bin/git",
      cliName: "git",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.cliPath).toBe("/usr/bin/git");
      expect(result.data.cliName).toBe("git");
      expect(result.data.version).toBe("unknown");
      expect(result.data.timeout).toBe(30000);
      expect(result.data.sessionMode).toBe("oneshot");
      expect(result.data.commands).toEqual([]);
      expect(result.data.envVars).toEqual({});
    }
  });

  it("validates full config", () => {
    const result = cliConfigSchema.safeParse({
      cliPath: "/usr/bin/git",
      cliName: "git",
      version: "2.40.0",
      commands: [{ name: "status", description: "Show status" }],
      workingDirectory: "/home/user/repo",
      envVars: { GIT_AUTHOR_NAME: "Test" },
      timeout: 60000,
      sessionMode: "repl",
    });

    expect(result.success).toBe(true);
  });

  it("rejects missing cliPath", () => {
    const result = cliConfigSchema.safeParse({
      cliName: "git",
    });

    expect(result.success).toBe(false);
  });

  it("rejects missing cliName", () => {
    const result = cliConfigSchema.safeParse({
      cliPath: "/usr/bin/git",
    });

    expect(result.success).toBe(false);
  });

  it("rejects invalid timeout", () => {
    const result = cliConfigSchema.safeParse({
      cliPath: "/usr/bin/git",
      cliName: "git",
      timeout: 500,
    });

    expect(result.success).toBe(false);
  });

  it("rejects invalid sessionMode", () => {
    const result = cliConfigSchema.safeParse({
      cliPath: "/usr/bin/git",
      cliName: "git",
      sessionMode: "invalid",
    });

    expect(result.success).toBe(false);
  });
});

describe("cliCommandSchema", () => {
  it("validates minimal command", () => {
    const result = cliCommandSchema.safeParse({ name: "status" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.description).toBe("");
      expect(result.data.parameters).toEqual([]);
    }
  });

  it("validates command with parameters", () => {
    const result = cliCommandSchema.safeParse({
      name: "commit",
      description: "Commit changes",
      parameters: [
        { name: "message", type: "string", required: true, flag: "-m" },
      ],
    });
    expect(result.success).toBe(true);
  });
});

describe("cliParameterSchema", () => {
  it("validates minimal parameter", () => {
    const result = cliParameterSchema.safeParse({ name: "verbose" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.type).toBe("string");
      expect(result.data.required).toBe(false);
    }
  });

  it("validates boolean parameter", () => {
    const result = cliParameterSchema.safeParse({
      name: "verbose",
      type: "boolean",
      required: false,
      flag: "-v",
    });
    expect(result.success).toBe(true);
  });
});
