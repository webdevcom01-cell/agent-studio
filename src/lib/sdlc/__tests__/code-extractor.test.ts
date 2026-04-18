/**
 * Unit tests for sdlc/code-extractor.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { rmSync, readFileSync } from "node:fs";

// ---------------------------------------------------------------------------
// Mocks — hoisted before imports
// ---------------------------------------------------------------------------

const mockLogger = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

const mockRunVerificationCommands = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ results: [{ output: "", passed: true }] }),
);

const mockExistsSync = vi.hoisted(() => vi.fn<[string | URL], boolean>());
const mockRmSync = vi.hoisted(() => vi.fn());

vi.mock("@/lib/logger", () => ({ logger: mockLogger }));

vi.mock("@/lib/runtime/verification-commands", () => ({
  runVerificationCommands: mockRunVerificationCommands,
}));

// Partially mock node:fs — override only existsSync and rmSync; keep all other fns real.
// rmSync is mocked so we can assert cleanup calls (e.g. tsconfig deletion after typecheck).
vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
  return { ...(actual as object), existsSync: mockExistsSync, rmSync: mockRmSync };
});

// ---------------------------------------------------------------------------
// Import under test (after mocks are registered)
// ---------------------------------------------------------------------------

import {
  parseCodeBlocks,
  writeToWorkspace,
  executeRealTestsFromFiles,
  runWorkspaceTests,
} from "../code-extractor";

// ---------------------------------------------------------------------------
// Shared test state — populated in beforeEach so every test starts clean
// ---------------------------------------------------------------------------

let _realExistsSync: (p: string) => boolean;
let _realRmSync: (p: string, opts?: { recursive?: boolean; force?: boolean }) => void;

beforeEach(async () => {
  // 1. Clear all recorded calls/results from the previous test.
  vi.clearAllMocks();

  // 2. Grab the real fs implementations so mocks can forward to them by default
  //    and so tests can use _realExistsSync / _realRmSync directly for explicit assertions.
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
  _realExistsSync = actual.existsSync as typeof _realExistsSync;
  _realRmSync = actual.rmSync as typeof _realRmSync;

  // 3. Default behaviour: behave exactly like the real fs.
  mockExistsSync.mockImplementation((p) => _realExistsSync(String(p)));
  mockRmSync.mockImplementation((p, opts) => _realRmSync(String(p), opts));

  mockRunVerificationCommands.mockResolvedValue({
    results: [{ output: "", passed: true }],
  });
});

// ---------------------------------------------------------------------------
// parseCodeBlocks
// ---------------------------------------------------------------------------

describe("parseCodeBlocks", () => {
  it("parses inline filepath comment annotation", () => {
    const input = "```typescript\n// filepath: src/lib/foo.ts\nexport const x = 1;\n```";
    const result = parseCodeBlocks(input);
    expect(result).toHaveLength(1);
    expect(result[0].path).toBe("src/lib/foo.ts");
    expect(result[0].content).toBe("export const x = 1;");
  });

  it("parses heading annotation before block", () => {
    const input = "### src/lib/bar.ts\n```typescript\nexport const y = 2;\n```";
    const result = parseCodeBlocks(input);
    expect(result).toHaveLength(1);
    expect(result[0].path).toBe("src/lib/bar.ts");
  });

  it("last definition wins for duplicate path", () => {
    const input = [
      "```typescript\n// filepath: src/lib/foo.ts\nexport const x = 1;\n```",
      "```typescript\n// filepath: src/lib/foo.ts\nexport const x = 99;\n```",
    ].join("\n\n");
    const result = parseCodeBlocks(input);
    expect(result).toHaveLength(1);
    expect(result[0].content).toBe("export const x = 99;");
  });

  it("skips blocks shorter than 15 chars", () => {
    const input = "```typescript\nconst x = 1;\n```";
    const result = parseCodeBlocks(input);
    expect(result).toHaveLength(0);
  });

  it("skips shell/bash language blocks", () => {
    const input = "```bash\nnpm install && npm run build\n```";
    const result = parseCodeBlocks(input);
    expect(result).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// writeToWorkspace — uses real fs via tmpdir
// ---------------------------------------------------------------------------

describe("writeToWorkspace", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), randomUUID());
  });

  afterEach(() => {
    try {
      // Use the real rmSync directly — this is infrastructure cleanup, not
      // part of the system under test, and must not interfere with assertions.
      _realRmSync(testDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  it("writes a normal file to disk in tmpdir", () => {
    const files = [{ path: "src/lib/foo.ts", content: "export const x = 1;", language: "typescript" }];
    const written = writeToWorkspace(files, testDir);
    expect(written).toHaveLength(1);
    // Use _realExistsSync explicitly — we are asserting disk state, not mock behavior.
    expect(_realExistsSync(written[0])).toBe(true);
    expect(readFileSync(written[0], "utf-8")).toBe("export const x = 1;");
  });

  it("blocks path traversal attempt", () => {
    const files = [{ path: "../../../etc/passwd", content: "evil", language: "text" }];
    const written = writeToWorkspace(files, testDir);
    expect(written).toHaveLength(0);
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining("blocked path traversal"),
      expect.objectContaining({ filePath: "../../../etc/passwd" }),
    );
  });

  it("creates nested directories automatically", () => {
    const files = [
      { path: "deep/nested/dir/file.ts", content: "export const z = 3;", language: "typescript" },
    ];
    const written = writeToWorkspace(files, testDir);
    expect(written).toHaveLength(1);
    // Use _realExistsSync explicitly — we are asserting disk state, not mock behavior.
    expect(_realExistsSync(written[0])).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// executeRealTestsFromFiles
// ---------------------------------------------------------------------------

describe("executeRealTestsFromFiles", () => {
  it("returns filesWritten=0 and skips tsc/vitest for empty files array", async () => {
    const result = await executeRealTestsFromFiles([], "/tmp/sdlc", "agent-1");
    expect(result.filesWritten).toBe(0);
    expect(result.typecheckPassed).toBe(true);
    expect(result.testsPassed).toBe(true);
    expect(mockRunVerificationCommands).not.toHaveBeenCalled();
  });

  it("uses /app/tsconfig.sdlc-generated.json when /app/tsconfig.json exists", async () => {
    mockExistsSync.mockImplementation((p) => {
      const path = String(p);
      if (path === "/app/tsconfig.json") return true;
      if (path === "/app/tsconfig.sdlc-generated.json") return true;
      return _realExistsSync(path);
    });

    const testDir = join(tmpdir(), randomUUID());
    try {
      const files = [
        { path: "src/lib/foo.ts", content: "export const x: number = 1;", language: "typescript" },
      ];
      await executeRealTestsFromFiles(files, testDir, "agent-tsconfig-test");

      const tscCallArgs = mockRunVerificationCommands.mock.calls.find((c) =>
        Array.isArray(c[0]) && c[0].some((cmd: string) => cmd.includes("tsc")),
      );
      expect(tscCallArgs).toBeDefined();
      const tscCommand = (tscCallArgs![0] as string[]).find((cmd: string) => cmd.includes("tsc"));
      expect(tscCommand).toContain("/app/tsconfig.sdlc-generated.json");
    } finally {
      try {
        _realRmSync(testDir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
  });

  it("uses workDir tsconfig (not /app/) when /app/tsconfig.json does not exist", async () => {
    // When /app/tsconfig.json is absent, tsconfigPath falls back to join(workDir, "tsconfig.sdlc-generated.json").
    // writeFile writes it there, existsSync returns true for it, so the command is
    // "tsc --project <workDir>/tsconfig.sdlc-generated.json --pretty false" — NOT --noEmit.
    mockExistsSync.mockImplementation((p) => {
      const path = String(p);
      if (path === "/app/tsconfig.json") return false;
      if (path === "/app/tsconfig.sdlc-generated.json") return false;
      return _realExistsSync(path);
    });

    const testDir = join(tmpdir(), randomUUID());
    try {
      const files = [
        { path: "src/lib/foo.ts", content: "export const x: number = 1;", language: "typescript" },
      ];
      await executeRealTestsFromFiles(files, testDir, "agent-fallback-tsc-test");

      const tscCallArgs = mockRunVerificationCommands.mock.calls.find((c) =>
        Array.isArray(c[0]) && c[0].some((cmd: string) => cmd.includes("tsc")),
      );
      expect(tscCallArgs).toBeDefined();
      const tscCommand = (tscCallArgs![0] as string[]).find((cmd: string) => cmd.includes("tsc"));
      // Uses --project with a workDir-based tsconfig (not /app/)
      expect(tscCommand).toContain("tsconfig.sdlc-generated.json");
      expect(tscCommand).not.toContain("/app/");
    } finally {
      try {
        _realRmSync(testDir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
  });

  it("cleans up the sdlc-generated tsconfig with rmSync after typecheck", async () => {
    // Simulate: /app/tsconfig.json exists → tsconfig written to /app/tsconfig.sdlc-generated.json
    mockExistsSync.mockImplementation((p) => {
      const path = String(p);
      if (path === "/app/tsconfig.json") return true;
      if (path === "/app/tsconfig.sdlc-generated.json") return true;
      return _realExistsSync(path);
    });

    const testDir = join(tmpdir(), randomUUID());
    try {
      const files = [
        { path: "src/lib/foo.ts", content: "export const x: number = 1;", language: "typescript" },
      ];
      await executeRealTestsFromFiles(files, testDir, "agent-cleanup-test");

      // The source calls rmSync(tsconfigPath) — this must always be called
      // so stale tsconfigs do not accumulate in /app/.
      expect(mockRmSync).toHaveBeenCalledWith("/app/tsconfig.sdlc-generated.json");
    } finally {
      try {
        _realRmSync(testDir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
  });
});

// ---------------------------------------------------------------------------
// runWorkspaceTests — re-test after SEARCH/REPLACE patch (no file writes)
// ---------------------------------------------------------------------------

describe("runWorkspaceTests", () => {
  afterEach(() => {
    vi.clearAllMocks();
    mockRunVerificationCommands.mockResolvedValue({
      results: [{ output: "", passed: true }],
    });
  });

  it("returns graceful result when workspace/workspace dir does not exist", async () => {
    // mockExistsSync delegates to real fs by default — non-existent path returns false
    const result = await runWorkspaceTests("/nonexistent/path/xyz", "agent-rw-1");

    expect(result.typecheckPassed).toBe(true);
    expect(result.testsPassed).toBe(true);
    expect(result.filesWritten).toBe(0);
    expect(result.testOutput).toContain("does not exist");
    expect(mockRunVerificationCommands).not.toHaveBeenCalled();
  });

  it("returns graceful result when workspace dir exists but is empty", async () => {
    const workDir = join(tmpdir(), randomUUID());
    try {
      const { mkdirSync: realMkdir } = await vi.importActual<typeof import("node:fs")>("node:fs");
      realMkdir(join(workDir, "workspace"), { recursive: true });

      const result = await runWorkspaceTests(workDir, "agent-rw-2");

      expect(result.typecheckPassed).toBe(true);
      expect(result.testsPassed).toBe(true);
      expect(result.filesWritten).toBe(0);
      expect(result.testOutput).toContain("empty");
      expect(mockRunVerificationCommands).not.toHaveBeenCalled();
    } finally {
      try { _realRmSync(workDir, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  });

  it("filesWritten is 0 even when files exist in workspace (no new writes)", async () => {
    const { mkdirSync: realMkdir, writeFileSync: realWrite } =
      await vi.importActual<typeof import("node:fs")>("node:fs");
    const workDir = join(tmpdir(), randomUUID());
    try {
      realMkdir(join(workDir, "workspace"), { recursive: true });
      realWrite(join(workDir, "workspace", "module.ts"), "export const x = 1;", "utf-8");

      const result = await runWorkspaceTests(workDir, "agent-rw-3");

      expect(result.filesWritten).toBe(0);
      expect(result.writtenPaths.length).toBeGreaterThan(0);
    } finally {
      try { _realRmSync(workDir, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  });

  it("calls runVerificationCommands with tsc for .ts files in workspace", async () => {
    const { mkdirSync: realMkdir, writeFileSync: realWrite } =
      await vi.importActual<typeof import("node:fs")>("node:fs");
    const workDir = join(tmpdir(), randomUUID());
    try {
      realMkdir(join(workDir, "workspace"), { recursive: true });
      realWrite(join(workDir, "workspace", "module.ts"), "export const x = 1;", "utf-8");

      await runWorkspaceTests(workDir, "agent-rw-4");

      expect(mockRunVerificationCommands).toHaveBeenCalled();
      const allCommands = mockRunVerificationCommands.mock.calls.flatMap(
        (call) => call[0] as string[],
      );
      expect(allCommands.some((c) => /tsc/.test(c))).toBe(true);
    } finally {
      try { _realRmSync(workDir, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  });

  it("returns typecheckPassed=false when tsc command fails", async () => {
    mockRunVerificationCommands.mockResolvedValueOnce({
      results: [{ output: "error TS2345: type mismatch", passed: false }],
    });

    const { mkdirSync: realMkdir, writeFileSync: realWrite } =
      await vi.importActual<typeof import("node:fs")>("node:fs");
    const workDir = join(tmpdir(), randomUUID());
    try {
      realMkdir(join(workDir, "workspace"), { recursive: true });
      realWrite(join(workDir, "workspace", "bad.ts"), "const x: number = 'oops';", "utf-8");

      const result = await runWorkspaceTests(workDir, "agent-rw-5");

      expect(result.typecheckPassed).toBe(false);
      expect(result.testOutput).toContain("FAILED");
    } finally {
      try { _realRmSync(workDir, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  });

  it("also runs vitest when .test.ts files are present alongside .ts files", async () => {
    const { mkdirSync: realMkdir, writeFileSync: realWrite } =
      await vi.importActual<typeof import("node:fs")>("node:fs");
    const workDir = join(tmpdir(), randomUUID());
    try {
      realMkdir(join(workDir, "workspace"), { recursive: true });
      realWrite(join(workDir, "workspace", "module.ts"), "export const add = (a: number, b: number) => a + b;", "utf-8");
      realWrite(join(workDir, "workspace", "module.test.ts"), "import { add } from './module'; it('adds', () => expect(add(1,2)).toBe(3));", "utf-8");

      await runWorkspaceTests(workDir, "agent-rw-6");

      // tsc + vitest → 2 calls
      expect(mockRunVerificationCommands).toHaveBeenCalledTimes(2);
      const allCommands = mockRunVerificationCommands.mock.calls.flatMap(
        (call) => call[0] as string[],
      );
      expect(allCommands.some((c) => c.startsWith("vitest run"))).toBe(true);
    } finally {
      try { _realRmSync(workDir, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  });

  it("never throws even when runVerificationCommands rejects", async () => {
    mockRunVerificationCommands.mockRejectedValue(new Error("process crashed"));

    const { mkdirSync: realMkdir, writeFileSync: realWrite } =
      await vi.importActual<typeof import("node:fs")>("node:fs");
    const workDir = join(tmpdir(), randomUUID());
    try {
      realMkdir(join(workDir, "workspace"), { recursive: true });
      realWrite(join(workDir, "workspace", "module.ts"), "export const x = 1;", "utf-8");

      await expect(runWorkspaceTests(workDir, "agent-rw-7")).resolves.toBeDefined();
    } finally {
      try { _realRmSync(workDir, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  });
});
