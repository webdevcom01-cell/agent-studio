/**
 * Tests for git-node-handler — focusing on sanitizeBranchName()
 * which was the root cause of git pipeline failures.
 *
 * The SDLC orchestrator passes {{taskSummary}} into the branch field,
 * producing strings like:
 *   "sdlc/Implements a generic, production-ready LRUCache<K, V> using Map"
 * These are invalid git branch names (spaces, <, >, commas) and cause
 * `git checkout -B` to fail with a fatal error.
 */

import { describe, it, expect } from "vitest";
import { sanitizeBranchName } from "../git-node-handler";

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
