import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  validateCommand,
  ALLOWED_COMMAND_PREFIXES,
  SHELL_METACHARACTERS,
} from "../verification-commands";

// ── validateCommand ──────────────────────────────────────────────────────

describe("validateCommand", () => {
  it("allows whitelisted commands", () => {
    expect(validateCommand("node script.js")).toBe("node script.js");
    expect(validateCommand("node create-commit.js")).toBe("node create-commit.js");
    expect(validateCommand("npm test")).toBe("npm test");
    expect(validateCommand("npx vitest run")).toBe("npx vitest run");
    expect(validateCommand("yarn lint")).toBe("yarn lint");
    expect(validateCommand("pnpm build")).toBe("pnpm build");
    expect(validateCommand("tsc --noEmit")).toBe("tsc --noEmit");
    expect(validateCommand("eslint src/")).toBe("eslint src/");
    expect(validateCommand("jest --coverage")).toBe("jest --coverage");
    expect(validateCommand("vitest run")).toBe("vitest run");
    expect(validateCommand("cargo test")).toBe("cargo test");
    expect(validateCommand("go test ./...")).toBe("go test ./...");
    expect(validateCommand("make build")).toBe("make build");
    expect(validateCommand("python -m pytest")).toBe("python -m pytest");
    expect(validateCommand("pytest tests/")).toBe("pytest tests/");
  });

  it("trims whitespace", () => {
    expect(validateCommand("  npm test  ")).toBe("npm test");
  });

  it("blocks empty commands", () => {
    expect(validateCommand("")).toBeNull();
    expect(validateCommand("   ")).toBeNull();
  });

  it("blocks non-whitelisted commands", () => {
    expect(validateCommand("rm -rf /")).toBeNull();
    expect(validateCommand("curl https://evil.com")).toBeNull();
    expect(validateCommand("cat /etc/passwd")).toBeNull();
    expect(validateCommand("wget malware.exe")).toBeNull();
    expect(validateCommand("bash -c 'echo pwned'")).toBeNull();
  });

  it("blocks shell metacharacters", () => {
    expect(validateCommand("npm test && rm -rf /")).toBeNull();
    expect(validateCommand("npm test; echo pwned")).toBeNull();
    expect(validateCommand("npm test | cat /etc/passwd")).toBeNull();
    expect(validateCommand("npm test `whoami`")).toBeNull();
    expect(validateCommand("npm test $(whoami)")).toBeNull();
    expect(validateCommand("npm test > /tmp/out")).toBeNull();
    expect(validateCommand("npm test < /dev/null")).toBeNull();
  });
});

// ── ALLOWED_COMMAND_PREFIXES regex ───────────────────────────────────────

describe("ALLOWED_COMMAND_PREFIXES", () => {
  it("matches expected prefixes", () => {
    const allowed = [
      "node", "npm", "npx", "yarn", "pnpm", "python", "pytest", "tsc",
      "eslint", "jest", "vitest", "cargo", "go", "make", "dotnet",
      "ruby", "bundle", "mix", "gradle", "mvn",
    ];
    for (const cmd of allowed) {
      expect(ALLOWED_COMMAND_PREFIXES.test(`${cmd} test`)).toBe(true);
    }
  });

  it("does not match partial prefixes", () => {
    expect(ALLOWED_COMMAND_PREFIXES.test("npmx test")).toBe(false);
    expect(ALLOWED_COMMAND_PREFIXES.test("my-npm test")).toBe(false);
  });
});

// ── SHELL_METACHARACTERS regex ──────────────────────────────────────────

describe("SHELL_METACHARACTERS", () => {
  it("matches dangerous characters", () => {
    for (const c of [";", "&", "|", "`", "$", "(", ")", "{", "}", "<", ">", "!", "#"]) {
      expect(SHELL_METACHARACTERS.test(`npm test ${c} rm`)).toBe(true);
    }
  });

  it("does not match safe characters", () => {
    expect(SHELL_METACHARACTERS.test("npm test --coverage")).toBe(false);
    expect(SHELL_METACHARACTERS.test("eslint src/")).toBe(false);
    expect(SHELL_METACHARACTERS.test("tsc --noEmit")).toBe(false);
  });
});

// ── runVerificationCommands ──────────────────────────────────────────────

describe("runVerificationCommands", () => {
  // We mock child_process.execFile via dynamic import
  let mockExecFile: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetModules();
    mockExecFile = vi.fn();
  });

  async function importWithMock(execResult: { stdout: string; stderr: string } | Error) {
    // Mock the dynamic import of node:child_process
    vi.doMock("node:child_process", () => ({
      execFile: mockExecFile.mockImplementation(
        (_cmd: string, _args: string[], _opts: Record<string, unknown>, cb: (err: Error | null, stdout: string, stderr: string) => void) => {
          if (execResult instanceof Error) {
            cb(execResult, "", "");
          } else {
            cb(null, execResult.stdout, execResult.stderr);
          }
        },
      ),
    }));

    const mod = await import("../verification-commands");
    return mod.runVerificationCommands;
  }

  it("returns allPassed true when all commands succeed", async () => {
    const runVerificationCommands = await importWithMock({ stdout: "ok", stderr: "" });
    const result = await runVerificationCommands(["npm test"], "agent-1");

    expect(result.allPassed).toBe(true);
    expect(result.results).toHaveLength(1);
    expect(result.results[0].passed).toBe(true);
    expect(result.results[0].command).toBe("npm test");
  });

  it("returns allPassed false when a command fails", async () => {
    const runVerificationCommands = await importWithMock(new Error("exit code 1"));
    const result = await runVerificationCommands(["npm test"], "agent-1");

    expect(result.allPassed).toBe(false);
    expect(result.results[0].passed).toBe(false);
  });

  it("blocks invalid commands", async () => {
    const runVerificationCommands = await importWithMock({ stdout: "", stderr: "" });
    const result = await runVerificationCommands(["rm -rf /", "npm test"], "agent-1");

    expect(result.allPassed).toBe(false);
    expect(result.results[0].passed).toBe(false);
    expect(result.results[0].output).toBe("Command not allowed");
    // The second command (npm test) would still run
    expect(result.results[1].passed).toBe(true);
  });

  it("handles empty command list", async () => {
    const runVerificationCommands = await importWithMock({ stdout: "", stderr: "" });
    const result = await runVerificationCommands([], "agent-1");

    expect(result.allPassed).toBe(true);
    expect(result.results).toHaveLength(0);
    expect(result.output).toBe("");
  });

  it("includes durationMs in results", async () => {
    const runVerificationCommands = await importWithMock({ stdout: "pass", stderr: "" });
    const result = await runVerificationCommands(["npm test"], "agent-1");

    expect(result.results[0].durationMs).toBeGreaterThanOrEqual(0);
  });
});
