import { describe, it, expect, vi, beforeEach } from "vitest";

const mockExecFile = vi.hoisted(() => vi.fn());
const mockFetch = vi.hoisted(() => vi.fn());
const mockLogger = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));
const mockExistsSync = vi.hoisted(() => vi.fn());
const mockRmSync = vi.hoisted(() => vi.fn());
const mockMkdirSync = vi.hoisted(() => vi.fn());
const mockReaddirSync = vi.hoisted(() => vi.fn());
const mockStatSync = vi.hoisted(() => vi.fn());
const mockCopyFileSync = vi.hoisted(() => vi.fn());

vi.mock("node:child_process", () => ({ execFile: mockExecFile }));
vi.mock("node:fs", () => ({
  existsSync: mockExistsSync,
  rmSync: mockRmSync,
  mkdirSync: mockMkdirSync,
  readdirSync: mockReaddirSync,
  statSync: mockStatSync,
  copyFileSync: mockCopyFileSync,
}));
vi.mock("@/lib/logger", () => ({ logger: mockLogger }));

global.fetch = mockFetch;

import { parseRepoInfo, createGithubPR, integrateWithGit } from "../git-integration";

function makeGitInput(overrides = {}) {
  return {
    repoUrl: "https://github.com/owner/repo",
    workDir: "/tmp/sdlc/run-1",
    runId: "run-1",
    taskDescription: "Add authentication feature",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.GITHUB_PAT;
});

describe("parseRepoInfo", () => {
  it("parses a valid GitHub HTTPS URL", () => {
    const result = parseRepoInfo("https://github.com/owner/my-repo");
    expect(result).toEqual({ owner: "owner", repo: "my-repo" });
  });

  it("strips .git suffix", () => {
    const result = parseRepoInfo("https://github.com/owner/my-repo.git");
    expect(result).toEqual({ owner: "owner", repo: "my-repo" });
  });

  it("returns null for non-GitHub URL", () => {
    expect(parseRepoInfo("https://gitlab.com/owner/repo")).toBeNull();
  });

  it("returns null for invalid URL", () => {
    expect(parseRepoInfo("not-a-url")).toBeNull();
  });
});

describe("integrateWithGit", () => {
  it("returns error when GITHUB_TOKEN is not set", async () => {
    const result = await integrateWithGit(makeGitInput());
    expect(result.success).toBe(false);
    expect(result.error).toContain("GITHUB_TOKEN");
  });

  it("returns error for non-GitHub URL", async () => {
    process.env.GITHUB_PAT = "token";
    const result = await integrateWithGit(
      makeGitInput({ repoUrl: "https://gitlab.com/owner/repo" }),
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain("Not a GitHub URL");
  });

  it("returns error and does not throw when git clone fails", async () => {
    process.env.GITHUB_PAT = "token";
    mockExistsSync.mockReturnValue(false);
    mockExecFile.mockImplementation((_cmd: unknown, _args: unknown, _opts: unknown, cb: (err: Error, stdout: string, stderr: string) => void) => {
      cb(new Error("clone failed"), "", "");
    });

    const result = await integrateWithGit(makeGitInput());
    expect(result.success).toBe(false);
    expect(result.error).toContain("clone failed");
  });
});

describe("createGithubPR", () => {
  it("returns existing PR URL if open PR already exists (idempotent)", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ html_url: "https://github.com/owner/repo/pull/42" }],
    });

    const url = await createGithubPR(
      "token", "owner", "repo", "branch", "title", "body",
    );
    expect(url).toBe("https://github.com/owner/repo/pull/42");
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});