/**
 * Tests for git-node-handler — sanitizeBranchName() and workingDir template resolution.
 *
 * The SDLC orchestrator passes {{taskSummary}} into the branch field,
 * producing strings like:
 *   "sdlc/Implements a generic, production-ready LRUCache<K, V> using Map"
 * These are invalid git branch names (spaces, <, >, commas) and cause
 * `git checkout -B` to fail with a fatal error.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { sanitizeBranchName, gitNodeHandler } from "../git-node-handler";
import type { RuntimeContext } from "../../types";

// ── Module mocks ──────────────────────────────────────────────────────────────
// vi.mock() is hoisted before imports — use vi.hoisted() to share state with factories.

const { mockExecFile, mockExistsSync } = vi.hoisted(() => ({
  mockExecFile: vi.fn().mockResolvedValue({ stdout: "", stderr: "" }),
  mockExistsSync: vi.fn(() => false),
}));

vi.mock("node:child_process", () => ({
  execFile: (...args: unknown[]) => mockExecFile(...args),
}));

vi.mock("node:util", () => ({
  // promisify(execFile) → execFile is already a mock that returns a Promise
  promisify: (fn: unknown) => fn,
}));

vi.mock("node:fs", () => ({
  existsSync: (...args: unknown[]) => mockExistsSync(...args),
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// Mock global fetch so token-check doesn't hit network
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeNode(overrides: Record<string, unknown> = {}) {
  return {
    id: "node-git",
    type: "git_node",
    data: {
      workingDir: "/tmp/sdlc",
      branch: "feat/test",
      commitMessage: "chore: test commit",
      operations: ["checkout_branch", "add", "commit"],
      outputVariable: "gitResult",
      nextNodeId: "next",
      onErrorNodeId: "error",
      prRepo: "owner/repo",
      ...overrides,
    },
  };
}

function makeContext(variables: Record<string, unknown> = {}): RuntimeContext {
  return {
    agentId: "agent-1",
    conversationId: "conv-1",
    variables,
    history: [],
    nodes: [],
    edges: [],
  } as unknown as RuntimeContext;
}

// ── gitNodeHandler workingDir template resolution ─────────────────────────────

describe("gitNodeHandler — workingDir template resolution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExistsSync.mockReturnValue(false);
    // All git subcommands succeed by default
    mockExecFile.mockResolvedValue({ stdout: "", stderr: "" });
    // Mock GitHub token validation (used in push — not needed for commit-only tests)
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ login: "bot" }) });
    process.env.GITHUB_TOKEN = "ghp_testtoken";
    process.env.GIT_REPO = "owner/repo";
  });

  it("resolves {{slug}} and {{runId}} in workingDir before running git", async () => {
    const ctx = makeContext({ slug: "status-badge", runId: "e9a4b7c2" });

    await gitNodeHandler(
      makeNode({ workingDir: "/tmp/sdlc-{{slug}}-{{runId}}" }) as never,
      ctx,
    );

    // Every execFile call's cwd option must be the resolved path
    const cwds = mockExecFile.mock.calls.map(
      (call) => (call[2] as { cwd?: string })?.cwd,
    );
    expect(cwds.every((cwd) => cwd === "/tmp/sdlc-status-badge-e9a4b7c2")).toBe(true);
    expect(cwds.some((cwd) => cwd?.includes("{{"))).toBe(false);
  });

  it("leaves a literal path unchanged when no template vars are present", async () => {
    const ctx = makeContext({});

    await gitNodeHandler(makeNode({ workingDir: "/tmp/sdlc" }) as never, ctx);

    const cwds = mockExecFile.mock.calls.map(
      (call) => (call[2] as { cwd?: string })?.cwd,
    );
    expect(cwds.every((cwd) => cwd === "/tmp/sdlc")).toBe(true);
  });
});

// ── sanitizeBranchName ────────────────────────────────────────────────────────

describe("sanitizeBranchName", () => {
  it("passes through a clean branch name unchanged", () => {
    expect(sanitizeBranchName("feat/my-feature")).toBe("feat/my-feature");
  });

  it("replaces spaces with hyphens", () => {
    expect(sanitizeBranchName("feat/my feature")).toBe("feat/my-feature");
  });

  it("handles the real LRUCache taskSummary that caused failures", () => {
    const taskSummary =
      "Implements a generic, production-ready LRUCache<K, V> using Map for O(1) operations";
    const branch = sanitizeBranchName(`sdlc/${taskSummary}`);

    expect(branch).not.toMatch(/\s/);
    expect(branch).not.toMatch(/[<>]/);
    expect(branch.length).toBeGreaterThan(0);
    expect(branch.startsWith("sdlc/")).toBe(true);
    expect(branch.length).toBeLessThanOrEqual(60);
  });

  it("strips leading and trailing hyphens and slashes", () => {
    const result = sanitizeBranchName("  feature  ");
    expect(result).not.toMatch(/^[-/]/);
    expect(result).not.toMatch(/[-/]$/);
  });

  it("collapses consecutive hyphens into one", () => {
    expect(sanitizeBranchName("feat---my---feature")).toBe("feat-my-feature");
  });

  it("strips angle brackets from generic type params", () => {
    expect(sanitizeBranchName("LRUCache<K, V>")).not.toMatch(/[<>]/);
  });

  it("strips shell metacharacters invalid in branch names", () => {
    const result = sanitizeBranchName("feat:fix~something^1");
    expect(result).not.toMatch(/[:~^]/);
  });

  it("handles @{ sequences", () => {
    const result = sanitizeBranchName("branch@{upstream}");
    expect(result).not.toContain("@{");
  });

  it("handles double-dot sequences", () => {
    const result = sanitizeBranchName("feat..something");
    expect(result).not.toContain("..");
  });

  it("truncates to 60 characters", () => {
    const long = "a".repeat(100);
    expect(sanitizeBranchName(long).length).toBeLessThanOrEqual(60);
  });

  it("returns a fallback for an all-invalid input", () => {
    const result = sanitizeBranchName("~^:?*[\\");
    expect(result.length).toBeGreaterThan(0);
  });

  it("preserves sdlc/ prefix used by SDLC pipeline", () => {
    const result = sanitizeBranchName("sdlc/Build a REST API with auth middleware");
    expect(result.startsWith("sdlc/")).toBe(true);
  });

  it("handles the slugify task summary from Slack failure report", () => {
    const taskSummary =
      "A robust TypeScript slugify utility that creates URL-safe slugs, with comprehensive Vitest coverage";
    const branch = sanitizeBranchName(`sdlc/${taskSummary}`);
    expect(branch).not.toMatch(/\s/);
    expect(branch.length).toBeLessThanOrEqual(60);
    expect(branch.startsWith("sdlc/")).toBe(true);
  });
});
