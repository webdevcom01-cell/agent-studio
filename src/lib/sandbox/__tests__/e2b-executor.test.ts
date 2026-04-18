import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks — hoisted before imports
// ---------------------------------------------------------------------------

const mockSandboxCreate = vi.hoisted(() => vi.fn());
const mockFilesWrite = vi.hoisted(() => vi.fn());
const mockCommandsRun = vi.hoisted(() => vi.fn());
const mockSandboxKill = vi.hoisted(() => vi.fn());
const mockLogger = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));
const mockReaddirSync = vi.hoisted(() => vi.fn());
const mockStatSync = vi.hoisted(() => vi.fn());
const mockReadFileSync = vi.hoisted(() => vi.fn());

vi.mock("@e2b/code-interpreter", () => ({
  Sandbox: {
    create: mockSandboxCreate,
  },
}));

vi.mock("@/lib/logger", () => ({ logger: mockLogger }));

vi.mock("node:fs", () => ({
  readdirSync: mockReaddirSync,
  statSync: mockStatSync,
  readFileSync: mockReadFileSync,
}));

import { executeInE2BSandbox, executeWorkspaceInE2BSandbox } from "../e2b-executor";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSandbox() {
  return {
    files: { write: mockFilesWrite },
    commands: { run: mockCommandsRun },
    kill: mockSandboxKill,
  };
}

function makeFile(path = "src/index.ts", content = "export const x = 1;") {
  return { path, content, language: "ts" };
}

function makeCommandResult(exitCode = 0, stdout = "", stderr = "") {
  return { exitCode, stdout, stderr };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.E2B_API_KEY = "test-key";
  mockFilesWrite.mockResolvedValue(undefined);
  mockSandboxKill.mockResolvedValue(undefined);
});

// ---------------------------------------------------------------------------
// executeInE2BSandbox
// ---------------------------------------------------------------------------

describe("executeInE2BSandbox", () => {
  it("throws when E2B_API_KEY is not set", async () => {
    delete process.env.E2B_API_KEY;
    await expect(
      executeInE2BSandbox([makeFile()], "/tmp/run-1", "agent-1"),
    ).rejects.toThrow("E2B_API_KEY is not set");
  });

  it("returns success when tsc and vitest both pass", async () => {
    mockSandboxCreate.mockResolvedValue(makeSandbox());
    mockCommandsRun
      .mockResolvedValueOnce(makeCommandResult(0, "added 3 packages"))   // npm install
      .mockResolvedValueOnce(makeCommandResult(0, ""))                    // tsc
      .mockResolvedValueOnce(makeCommandResult(0, "2 passed"));           // vitest

    const result = await executeInE2BSandbox([makeFile()], "/tmp/run-1", "agent-1");

    expect(result.typecheckPassed).toBe(true);
    expect(result.testsPassed).toBe(true);
    expect(result.filesWritten).toBe(1);
    expect(result.writtenPaths).toContain("src/index.ts");
  });

  it("returns typecheckPassed=false when tsc exits with code 1", async () => {
    mockSandboxCreate.mockResolvedValue(makeSandbox());
    mockCommandsRun
      .mockResolvedValueOnce(makeCommandResult(0, ""))                          // npm install
      .mockResolvedValueOnce(makeCommandResult(1, "", "error TS2345: ..."))     // tsc fails
      .mockResolvedValueOnce(makeCommandResult(0, "1 passed"));                 // vitest

    const result = await executeInE2BSandbox([makeFile()], "/tmp/run-1", "agent-1");

    expect(result.typecheckPassed).toBe(false);
    expect(result.testOutput).toContain("error TS2345");
  });

  it("returns testsPassed=false when vitest reports failures", async () => {
    mockSandboxCreate.mockResolvedValue(makeSandbox());
    mockCommandsRun
      .mockResolvedValueOnce(makeCommandResult(0, ""))                    // npm install
      .mockResolvedValueOnce(makeCommandResult(0, ""))                    // tsc
      .mockResolvedValueOnce(makeCommandResult(1, "1 failed | 2 passed")); // vitest

    const result = await executeInE2BSandbox([makeFile()], "/tmp/run-1", "agent-1");

    expect(result.testsPassed).toBe(false);
  });

  it("always kills sandbox even when command throws", async () => {
    mockSandboxCreate.mockResolvedValue(makeSandbox());
    mockCommandsRun.mockRejectedValueOnce(new Error("network error"));

    await expect(
      executeInE2BSandbox([makeFile()], "/tmp/run-1", "agent-1"),
    ).rejects.toThrow("network error");

    expect(mockSandboxKill).toHaveBeenCalledOnce();
  });

  it("writes package.json, tsconfig, and all files to sandbox", async () => {
    mockSandboxCreate.mockResolvedValue(makeSandbox());
    mockCommandsRun
      .mockResolvedValueOnce(makeCommandResult(0, ""))
      .mockResolvedValueOnce(makeCommandResult(0, ""))
      .mockResolvedValueOnce(makeCommandResult(0, "1 passed"));

    await executeInE2BSandbox(
      [makeFile("src/a.ts"), makeFile("src/b.ts")],
      "/tmp/run-1",
      "agent-1",
    );

    // package.json + tsconfig + 2 source files = 4 writes
    expect(mockFilesWrite).toHaveBeenCalledTimes(4);
  });
});

// ---------------------------------------------------------------------------
// executeWorkspaceInE2BSandbox
// ---------------------------------------------------------------------------

describe("executeWorkspaceInE2BSandbox", () => {
  it("returns empty result when workspace dir does not exist", async () => {
    mockReaddirSync.mockImplementation(() => { throw new Error("ENOENT"); });

    const result = await executeWorkspaceInE2BSandbox("/tmp/run-1", "agent-1");

    expect(result.filesWritten).toBe(0);
    expect(result.testsPassed).toBe(false);
    expect(result.typecheckPassed).toBe(false);
  });

  it("reads files from workspace dir and delegates to executeInE2BSandbox", async () => {
    mockReaddirSync.mockReturnValue(["index.ts"]);
    mockStatSync.mockReturnValue({ isDirectory: () => false });
    mockReadFileSync.mockReturnValue("export const x = 1;");
    mockSandboxCreate.mockResolvedValue(makeSandbox());
    mockCommandsRun
      .mockResolvedValueOnce(makeCommandResult(0, ""))
      .mockResolvedValueOnce(makeCommandResult(0, ""))
      .mockResolvedValueOnce(makeCommandResult(0, "1 passed"));

    const result = await executeWorkspaceInE2BSandbox("/tmp/run-1", "agent-1");

    expect(result.filesWritten).toBe(1);
    expect(result.testsPassed).toBe(true);
  });
});
