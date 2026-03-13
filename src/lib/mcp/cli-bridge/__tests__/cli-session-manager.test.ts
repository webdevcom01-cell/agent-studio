import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  getOrCreateSession,
  executeCommand,
  getSessionInfo,
  removeSession,
  getSessionCount,
  clearAllSessions,
} from "../cli-session-manager";
import type { CLIConfig } from "../types";

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

function makeConfig(overrides: Partial<CLIConfig> = {}): CLIConfig {
  return {
    cliPath: "/bin/echo",
    cliName: "echo",
    version: "1.0",
    commands: [],
    timeout: 10000,
    sessionMode: "oneshot",
    envVars: {},
    ...overrides,
  };
}

describe("cli-session-manager", () => {
  beforeEach(() => {
    clearAllSessions();
  });

  it("creates a new session", () => {
    const config = makeConfig();
    const sessionId = getOrCreateSession("server-1", config);

    expect(sessionId).toBe("server-1");
    expect(getSessionCount()).toBe(1);
  });

  it("returns existing session on duplicate call", () => {
    const config = makeConfig();
    getOrCreateSession("server-1", config);
    getOrCreateSession("server-1", config);

    expect(getSessionCount()).toBe(1);
  });

  it("returns session info", () => {
    getOrCreateSession("server-1", makeConfig());

    const info = getSessionInfo("server-1");
    expect(info).not.toBeNull();
    expect(info?.cliName).toBe("echo");
    expect(info?.isAlive).toBe(true);
  });

  it("returns null info for nonexistent session", () => {
    expect(getSessionInfo("nonexistent")).toBeNull();
  });

  it("executes a command via echo", async () => {
    getOrCreateSession("server-1", makeConfig());

    const result = await executeCommand("server-1", "/bin/echo", ["hello", "world"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("hello world");
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("returns error for nonexistent session", async () => {
    const result = await executeCommand("nonexistent", "echo", []);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Session not found");
  });

  it("removes a session", () => {
    getOrCreateSession("server-1", makeConfig());
    expect(getSessionCount()).toBe(1);

    removeSession("server-1");
    expect(getSessionCount()).toBe(0);
  });

  it("clears all sessions", () => {
    getOrCreateSession("s1", makeConfig());
    getOrCreateSession("s2", makeConfig());
    expect(getSessionCount()).toBe(2);

    clearAllSessions();
    expect(getSessionCount()).toBe(0);
  });

  it("handles command that writes to stderr", async () => {
    getOrCreateSession("server-1", makeConfig({ cliPath: "/bin/sh" }));

    const result = await executeCommand("server-1", "/bin/sh", [
      "-c",
      "echo error >&2; exit 1",
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr.trim()).toBe("error");
  });
});
