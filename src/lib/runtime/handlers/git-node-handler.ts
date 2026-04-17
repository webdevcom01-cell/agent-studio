/**
 * git-node-handler.ts
 *
 * Node type: `git_node`
 *
 * Runs a sequence of git operations in the specified working directory.
 *
 * Node data fields:
 *   workingDir      — working directory (default: /tmp/sdlc or cwd)
 *   branch          — branch name, supports {{variable}} interpolation
 *   commitMessage   — commit message, supports {{variable}} interpolation
 *   operations      — array of GitOperation (default: ["checkout_branch","add","commit","push"])
 *   outputVariable  — where to store GitOutput (default: "gitResult")
 *   nextNodeId      — next node on success
 *   onErrorNodeId   — next node on failure
 *
 *   // v2: PR creation fields (only used when "create_pr" is in operations)
 *   prTitle         — PR title, supports {{variable}} interpolation
 *   prBody          — PR body/description, supports {{variable}} interpolation
 *   prBaseBranch    — target branch for the PR (default: "main")
 *   prRepo          — "owner/repo" — read from GIT_REPO env if not set
 *
 * Output variable shape (GitOutput from src/lib/sdlc/schemas.ts):
 *   { branch, commitHash?, pushed, success, message, prUrl?, prNumber? }
 *
 * Environment variables:
 *   GIT_TOKEN   — GitHub personal access token (required for push + create_pr)
 *   GIT_REPO    — default "owner/repo" if prRepo not set on node
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { NodeHandler } from "../types";
import { logger } from "@/lib/logger";

const execFileAsync = promisify(execFile);
const GIT_TIMEOUT_MS = 60_000;
const GITHUB_API = "https://api.github.com";

// v2: Sync working dir with SDLC tmp workspace (same logic as process-runner-handler)
const SDLC_TMP = "/tmp/sdlc";

type GitOperation = "checkout_branch" | "add" | "commit" | "push" | "create_pr";

interface PRResult {
  url: string;
  number: number;
}

export const gitNodeHandler: NodeHandler = async (node, context) => {
  // Resolve working directory — prefer /tmp/sdlc if it exists (SDLC pipeline writes there)
  const configuredDir = (node.data.workingDir as string) || process.cwd();
  const workingDir =
    configuredDir === process.cwd() && existsSync(join(SDLC_TMP, "src"))
      ? SDLC_TMP
      : configuredDir;

  const branch = sanitizeBranchName(
    interpolateVariables(
      (node.data.branch as string) || `feat/autonomous-${Date.now()}`,
      context.variables,
    ),
  );
  const commitMessage = interpolateVariables(
    (node.data.commitMessage as string) || "chore: autonomous pipeline commit",
    context.variables,
  );
  const operations: GitOperation[] = Array.isArray(node.data.operations)
    ? (node.data.operations as GitOperation[])
    : ["checkout_branch", "add", "commit", "push"];
  const outputVariable = (node.data.outputVariable as string) || "gitResult";

  const gitEnv = buildGitEnv();

  try {
    // Ensure the working directory is a git repository.
    // The Next.js standalone Docker image does NOT include .git — it copies only
    // .next/standalone/ which has no version control context. When file-writer
    // falls back to /tmp/sdlc (read-only /app), that directory also has no .git.
    // We initialise it here: git init → add remote → shallow-fetch main so the
    // new commit has proper parent history instead of being an orphan.
    const token = process.env.GIT_TOKEN;
    const repo =
      (node.data.prRepo as string) || process.env.GIT_REPO || "";
    if (token && repo) {
      await ensureGitRepo(workingDir, gitEnv, repo, token);
    }

    let commitHash: string | undefined;
    let prResult: PRResult | undefined;

    for (const op of operations) {
      switch (op) {
        case "checkout_branch":
          await runGit(["checkout", "-B", branch], workingDir, gitEnv);
          break;

        case "add":
          await runGit(["add", "-A"], workingDir, gitEnv);
          break;

        case "commit": {
          const { stdout } = await runGit(
            ["commit", "-m", commitMessage],
            workingDir,
            gitEnv,
          );
          const hashMatch =
            /\[([a-f0-9]{7,40})\]/.exec(stdout) ??
            /\b([a-f0-9]{7,40})\b/.exec(stdout);
          if (hashMatch) commitHash = hashMatch[1];
          break;
        }

        case "push": {
          // Embed token in remote URL so HTTPS push works without a credential
          // helper — required on Railway where there is no persistent keychain.
          const token = process.env.GIT_TOKEN;
          const repo = process.env.GIT_REPO ?? (node.data.prRepo as string) ?? "";
          if (token && repo) {
            const authedUrl = `https://${token}@github.com/${repo}.git`;
            await runGit(["remote", "set-url", "origin", authedUrl], workingDir, gitEnv);
          }
          await runGit(["push", "--set-upstream", "origin", branch, "--force-with-lease"], workingDir, gitEnv);
          break;
        }

        case "create_pr":
          prResult = await createGitHubPR({
            branch,
            title: interpolateVariables(
              (node.data.prTitle as string) || `feat: ${branch}`,
              context.variables,
            ),
            body: interpolateVariables(
              (node.data.prBody as string) ||
                `Automated PR created by SDLC Pipeline\n\nBranch: ${branch}\nCommit: ${commitHash ?? "unknown"}`,
              context.variables,
            ),
            baseBranch: (node.data.prBaseBranch as string) || "main",
            repo:
              (node.data.prRepo as string) ||
              process.env.GIT_REPO ||
              "",
          });
          break;
      }
    }

    const pushed = operations.includes("push");
    const result = {
      branch,
      commitHash,
      pushed,
      success: true,
      message: `Branch "${branch}" — operations: ${operations.join(", ")}`,
      ...(prResult
        ? { prUrl: prResult.url, prNumber: prResult.number }
        : {}),
    };

    logger.info("git-node completed", {
      nodeId: node.id,
      agentId: context.agentId,
      branch,
      operations,
      commitHash,
      prNumber: prResult?.number,
    });

    const summaryParts = [result.message];
    if (prResult) {
      summaryParts.push(`PR #${prResult.number} created: ${prResult.url}`);
    }

    return {
      messages: [{ role: "assistant", content: summaryParts.join("\n") }],
      nextNodeId: (node.data.nextNodeId as string) ?? null,
      waitForInput: false,
      updatedVariables: { [outputVariable]: result },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("git-node-handler error", { nodeId: node.id, error });

    const result = {
      branch,
      commitHash: undefined,
      pushed: false,
      success: false,
      message: `Git operation failed: ${message.slice(0, 500)}`,
    };

    return {
      messages: [{ role: "assistant", content: `Git node failed: ${message.slice(0, 500)}` }],
      nextNodeId: (node.data.onErrorNodeId as string) ?? null,
      waitForInput: false,
      updatedVariables: { [outputVariable]: result },
    };
  }
};

// ── Git workspace bootstrap ────────────────────────────────────────────────────

/**
 * Ensure workingDir is a git repository with a configured remote.
 *
 * The Next.js standalone Docker image does not include a .git folder — only the
 * compiled app is copied. When the SDLC pipeline writes files to /tmp/sdlc
 * (Railway read-only /app fallback), that directory also has no .git.
 *
 * Strategy:
 *   1. git init  (no-op if .git already exists)
 *   2. Set authenticated remote URL
 *   3. Shallow-fetch main so the new commit has a proper parent (not orphan)
 *   4. Reset HEAD softly to FETCH_HEAD (index untouched, working tree intact)
 *
 * If fetch fails (empty repo / network issue) we log a warning and continue —
 * the commit will be an orphan branch but push will still succeed.
 */
async function ensureGitRepo(
  workingDir: string,
  gitEnv: NodeJS.ProcessEnv,
  repo: string,
  token: string,
): Promise<void> {
  const gitDir = join(workingDir, ".git");
  if (existsSync(gitDir)) return; // already initialised — nothing to do

  const authedUrl = `https://${token}@github.com/${repo}.git`;

  logger.info("git-node: initialising git repo in working dir", { workingDir, repo });

  await runGit(["init"], workingDir, gitEnv);
  await runGit(["remote", "add", "origin", authedUrl], workingDir, gitEnv);

  try {
    // Shallow-fetch only the latest commit on main so history is present.
    await runGit(
      ["fetch", "--depth=1", "origin", "main"],
      workingDir,
      gitEnv,
    );
    // Move HEAD to that commit without touching working tree or index.
    await runGit(["reset", "--soft", "FETCH_HEAD"], workingDir, gitEnv);
    logger.info("git-node: repo bootstrapped from origin/main", { workingDir });
  } catch (fetchErr) {
    // Non-fatal: empty remote or network hiccup — proceed with orphan commit.
    logger.warn("git-node: could not fetch origin/main, will create orphan commit", {
      workingDir,
      error: fetchErr instanceof Error ? fetchErr.message : String(fetchErr),
    });
  }
}

// ── Git helpers ────────────────────────────────────────────────────────────────

async function runGit(
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync("git", args, {
    cwd,
    env,
    timeout: GIT_TIMEOUT_MS,
    maxBuffer: 1024 * 256,
  });
}

function buildGitEnv(): NodeJS.ProcessEnv {
  // Git identity — required for commit. Falls back to sensible SDLC defaults.
  // Override via GIT_AUTHOR_NAME / GIT_AUTHOR_EMAIL env vars on Railway.
  const name = process.env.GIT_AUTHOR_NAME ?? "SDLC Pipeline";
  const email = process.env.GIT_AUTHOR_EMAIL ?? "sdlc@agent-studio.app";
  return {
    ...process.env,
    GIT_TERMINAL_PROMPT: "0",
    GIT_AUTHOR_NAME: name,
    GIT_AUTHOR_EMAIL: email,
    GIT_COMMITTER_NAME: name,
    GIT_COMMITTER_EMAIL: email,
  };
}

// ── GitHub PR creation via REST API ───────────────────────────────────────────

interface CreatePROptions {
  branch: string;
  title: string;
  body: string;
  baseBranch: string;
  repo: string; // "owner/repo"
}

async function createGitHubPR(opts: CreatePROptions): Promise<PRResult> {
  const { branch, title, body, baseBranch, repo } = opts;
  const token = process.env.GIT_TOKEN;

  if (!token) {
    throw new Error("GIT_TOKEN environment variable is required for create_pr operation");
  }

  if (!repo || !repo.includes("/")) {
    throw new Error(
      `GIT_REPO must be in "owner/repo" format. Got: "${repo}". ` +
        "Set GIT_REPO env var or prRepo on the node.",
    );
  }

  const url = `${GITHUB_API}/repos/${repo}/pulls`;

  logger.info("git-node: creating GitHub PR", { repo, branch, baseBranch, title });

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: JSON.stringify({
      title,
      body,
      head: branch,
      base: baseBranch,
      draft: false,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "(no body)");
    // 422 = PR already exists for this branch — return existing PR
    if (response.status === 422 && errorText.includes("A pull request already exists")) {
      return await getExistingPR(repo, branch, baseBranch, token);
    }
    throw new Error(
      `GitHub API error ${response.status}: ${errorText.slice(0, 300)}`,
    );
  }

  const data = (await response.json()) as { html_url: string; number: number };

  logger.info("git-node: PR created successfully", {
    repo,
    prNumber: data.number,
    prUrl: data.html_url,
  });

  return { url: data.html_url, number: data.number };
}

async function getExistingPR(
  repo: string,
  head: string,
  base: string,
  token: string,
): Promise<PRResult> {
  const url = `${GITHUB_API}/repos/${repo}/pulls?state=open&head=${head}&base=${base}&per_page=1`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch existing PRs: ${response.status}`);
  }

  const pulls = (await response.json()) as Array<{ html_url: string; number: number }>;

  if (pulls.length === 0) {
    throw new Error(`PR already exists error but no open PR found for ${head} → ${base}`);
  }

  logger.info("git-node: returning existing PR", {
    repo,
    prNumber: pulls[0].number,
    prUrl: pulls[0].html_url,
  });

  return { url: pulls[0].html_url, number: pulls[0].number };
}

function interpolateVariables(
  template: string,
  variables: Record<string, unknown>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const val = variables[key];
    return val !== undefined && val !== null ? String(val) : `{{${key}}}`;
  });
}

/**
 * Sanitize a string into a valid git branch name segment.
 *
 * Git branch name rules (from git-check-ref-format):
 *  - No spaces
 *  - No ASCII control characters, DEL, SP, ~, ^, :, ?, *, [, \
 *  - No .. sequences
 *  - No @{ sequences
 *  - Cannot begin or end with /
 *  - Cannot end with .
 *  - Cannot contain consecutive slashes //
 *
 * Strategy: replace runs of invalid chars with "-", collapse repeated "-",
 * trim leading/trailing "-" and "/", truncate to 60 chars to keep refs short.
 */
export function sanitizeBranchName(name: string): string {
  return name
    // Replace spaces and invalid chars with hyphens
    .replace(/[\s~^:?*[\\\x00-\x1f\x7f<>|"]/g, "-")
    // Remove @{ sequences
    .replace(/@\{/g, "-")
    // Collapse consecutive hyphens/slashes
    .replace(/-{2,}/g, "-")
    .replace(/\/{2,}/g, "/")
    // Remove .. sequences
    .replace(/\.\./g, "-")
    // Strip leading/trailing hyphens and slashes
    .replace(/^[-/]+|[-/]+$/g, "")
    // Strip trailing dots (forbidden by git)
    .replace(/\.+$/g, "")
    // Truncate to 60 chars
    .slice(0, 60)
    // Final cleanup: trailing hyphens/slashes/dots after truncation
    .replace(/[-/.]+$/g, "")
    // Fallback if everything was stripped
    || `branch-${Date.now()}`;
}
