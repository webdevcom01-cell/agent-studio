/**
 * git-integration.ts — Tier 5
 *
 * Best-effort git + GitHub PR integration for SDLC pipeline runs.
 * All errors are caught and returned as { success: false, error } — never thrown.
 */

import { execFile } from "node:child_process";
import { join } from "node:path";
import { existsSync, mkdirSync, rmSync, readdirSync, statSync, copyFileSync } from "node:fs";
import { promisify } from "node:util";
import { logger } from "@/lib/logger";

const execFileAsync = promisify(execFile);

const GITHUB_API = "https://api.github.com";
const GIT_TIMEOUT_MS = 60_000;
const GENERATED_SUBDIR = "workspace";

export interface GitIntegrationInput {
  repoUrl: string;
  workDir: string;
  runId: string;
  taskDescription: string;
}

export interface GitIntegrationResult {
  success: boolean;
  branchName?: string;
  commitHash?: string;
  prUrl?: string;
  error?: string;
}

interface RepoInfo {
  owner: string;
  repo: string;
}

export function parseRepoInfo(repoUrl: string): RepoInfo | null {
  try {
    const url = new URL(repoUrl.replace(/\.git$/, ""));
    if (url.hostname !== "github.com") return null;
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length < 2) return null;
    return { owner: parts[0], repo: parts[1] };
  } catch {
    return null;
  }
}

async function runGit(
  args: string[],
  cwd: string,
): Promise<{ stdout: string; stderr: string }> {
  const { stdout, stderr } = await execFileAsync("git", args, {
    cwd,
    timeout: GIT_TIMEOUT_MS,
    env: {
      ...process.env,
      GIT_TERMINAL_PROMPT: "0",
      GIT_AUTHOR_NAME: "agent-studio[bot]",
      GIT_AUTHOR_EMAIL: "bot@agent-studio.ai",
      GIT_COMMITTER_NAME: "agent-studio[bot]",
      GIT_COMMITTER_EMAIL: "bot@agent-studio.ai",
    },
  });
  return { stdout: stdout.trim(), stderr: stderr.trim() };
}

function copyDirRecursive(src: string, dest: string): void {
  if (!existsSync(src)) return;
  mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src)) {
    const srcPath = join(src, entry);
    const destPath = join(dest, entry);
    if (statSync(srcPath).isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      copyFileSync(srcPath, destPath);
    }
  }
}

export async function createGithubPR(
  token: string,
  owner: string,
  repo: string,
  head: string,
  title: string,
  body: string,
  base = "main",
): Promise<string> {
  // Check for existing open PR first (idempotency)
  const listRes = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/pulls?state=open&head=${owner}:${head}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    },
  );
  if (listRes.ok) {
    const existing = (await listRes.json()) as Array<{ html_url: string }>;
    if (existing.length > 0) {
      return existing[0].html_url;
    }
  }

  const createRes = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/pulls`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ title, body, head, base }),
  });

  if (!createRes.ok) {
    const text = await createRes.text();
    throw new Error(`GitHub PR creation failed: ${createRes.status} ${text}`);
  }

  const pr = (await createRes.json()) as { html_url: string };
  return pr.html_url;
}

export async function integrateWithGit(
  input: GitIntegrationInput,
): Promise<GitIntegrationResult> {
  const { repoUrl, workDir, runId, taskDescription } = input;

  const token = process.env.GITHUB_PAT;
  if (!token) {
    return { success: false, error: "GITHUB_PAT env var not set" };
  }

  const repoInfo = parseRepoInfo(repoUrl);
  if (!repoInfo) {
    return { success: false, error: `Not a GitHub URL or could not parse: ${repoUrl}` };
  }

  const { owner, repo } = repoInfo;
  const cloneDir = `/tmp/sdlc-git/${runId}`;

  try {
    const authUrl = repoUrl.replace("https://", `https://x-access-token:${token}@`);

    if (existsSync(cloneDir)) {
      rmSync(cloneDir, { recursive: true, force: true });
    }

    await runGit(["clone", "--depth=1", authUrl, cloneDir], "/tmp");

    const slug = taskDescription
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .slice(0, 40)
      .replace(/^-|-$/g, "");
    const branchName = `sdlc/${runId.slice(0, 8)}-${slug || "changes"}`;

    await runGit(["checkout", "-b", branchName], cloneDir);

    const generatedDir = join(workDir, GENERATED_SUBDIR);
    copyDirRecursive(generatedDir, cloneDir);

    await runGit(["add", "-A"], cloneDir);

    const { stdout: statusOut } = await runGit(["status", "--porcelain"], cloneDir);
    if (!statusOut) {
      return { success: false, error: "No changes to commit after copying generated files" };
    }

    const commitMsg = `feat: ${taskDescription.slice(0, 72)}\n\nGenerated by agent-studio SDLC pipeline run ${runId}`;
    await runGit(["commit", "-m", commitMsg], cloneDir);

    const { stdout: commitHash } = await runGit(["rev-parse", "HEAD"], cloneDir);

    await runGit(["push", "origin", branchName], cloneDir);

    const prTitle = `feat: ${taskDescription.slice(0, 72)}`;
    const prBody = `## Summary\n\nAutomatically generated by agent-studio SDLC pipeline.\n\n**Run ID:** \`${runId}\`\n\n**Task:** ${taskDescription}`;
    const prUrl = await createGithubPR(token, owner, repo, branchName, prTitle, prBody);

    logger.info("git-integration: PR created", { runId, branchName, prUrl });

    return { success: true, branchName, commitHash, prUrl };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    logger.warn("git-integration: failed", { runId, error });
    return { success: false, error };
  } finally {
    try {
      if (existsSync(cloneDir)) {
        rmSync(cloneDir, { recursive: true, force: true });
      }
    } catch {
      // ignore cleanup errors
    }
  }
}
