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

function tryParseJson<T>(str: string): T | null {
  try { return JSON.parse(str) as T; } catch { return null; }
}

const GITHUB_API = "https://api.github.com";
const GIT_TIMEOUT_MS = 60_000;
const GENERATED_SUBDIR = "workspace";

export interface GitIntegrationInput {
  repoUrl: string;
  workDir: string;
  runId: string;
  taskDescription: string;
  pipelineName?: string;
  stepOutputs?: Record<string, string>;
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

/**
 * Redact any embedded GitHub PAT from a string before logging or returning it.
 * Covers both the `https://x-access-token:<token>@` URL form and bare token occurrences.
 */
function redactToken(message: string, token: string): string {
  if (!token) return message;
  // Replace URL-embedded credential form first (more specific match)
  const withoutUrlCred = message.replace(
    `x-access-token:${token}@`,
    "x-access-token:[REDACTED]@",
  );
  // Then replace any remaining bare token occurrence (e.g. in error text)
  return withoutUrlCred.split(token).join("[REDACTED]");
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

export function buildRichPrBody(input: GitIntegrationInput, files: string[]): string {
  const { pipelineName, runId, taskDescription, stepOutputs } = input;

  const parts: string[] = [
    `## 🤖 SDLC Agent — Automated PR\n\n**Pipeline:** ${pipelineName ?? "unknown"}\n**Run ID:** ${runId}\n**Task:** ${taskDescription}`,
  ];

  if (files.length > 0) {
    parts.push(`## 📄 Files Changed\n${files.map((f) => `- \`${f}\``).join("\n")}`);
  }

  if (stepOutputs?.["static_analysis"]) {
    const staticSnippet = stepOutputs["static_analysis"].slice(0, 500);
    parts.push(`## 🔍 Static Analysis\n\`\`\`\n${staticSnippet}\n\`\`\``);
  }

  if (stepOutputs?.["ecc-code-reviewer"]) {
    const reviewSnippet = stepOutputs["ecc-code-reviewer"].slice(0, 2_000);
    parts.push(`## 👁 Code Review\n${reviewSnippet}`);
  }

  if (stepOutputs?.["ecc-security-reviewer"]) {
    const rawSec = stepOutputs["ecc-security-reviewer"];
    const secData = tryParseJson<{
      decision?: string;
      securityScore?: number;
      criticalCount?: number;
      highCount?: number;
      mediumCount?: number;
      findings?: Array<{ severity: string; owaspCategory: string; message: string; fix: string }>;
      summary?: string;
    }>(rawSec);

    if (secData?.decision !== undefined) {
      // Structured SecurityReviewOutput
      const badge = secData.decision === "BLOCK" ? "🔴 BLOCK"
        : secData.decision === "PASS_WITH_NOTES" ? "🟡 PASS WITH NOTES"
        : "🟢 PASS";
      const criticalHighFindings = (secData.findings ?? [])
        .filter(f => f.severity === "CRITICAL" || f.severity === "HIGH")
        .map(f => `- **[${f.severity}]** ${f.owaspCategory}: ${f.message}\n  Fix: ${f.fix}`)
        .join("\n");
      parts.push(
        `## 🔒 Security Review ${badge}\n` +
        `**Score:** ${secData.securityScore ?? "N/A"}/100 | ` +
        `CRITICAL: ${secData.criticalCount ?? 0} | HIGH: ${secData.highCount ?? 0} | MEDIUM: ${secData.mediumCount ?? 0}\n\n` +
        (secData.summary ? `${secData.summary}\n\n` : "") +
        (criticalHighFindings ? `### Critical & High Findings\n${criticalHighFindings}` : "")
      );
    } else {
      // Fallback: plain text (generateObject failed, used generateText)
      parts.push(`## 🔒 Security Review\n${rawSec.slice(0, 2_000)}`);
    }
  }

  const fullBody = parts.join("\n\n") + "\n\n---\n*Generated by Agent Studio SDLC Pipeline*";
  return fullBody.slice(0, 50_000);
}

export async function createGithubPR(
  token: string,
  owner: string,
  repo: string,
  head: string,
  title: string,
  body: string,
  base = "main",
  draft?: boolean,
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
    body: JSON.stringify({ title, body, head, base, draft: draft ?? false }),
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

  const token = process.env.GITHUB_TOKEN ?? process.env.GITHUB_PAT;
  if (!token) {
    return { success: false, error: "GITHUB_TOKEN env var not set" };
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

    // Log workspace state before cloning
    const generatedDir = join(workDir, GENERATED_SUBDIR);
    const workspaceDirExists = existsSync(generatedDir);
    let workspaceFiles: string[] = [];
    if (workspaceDirExists) {
      try {
        workspaceFiles = readdirSync(generatedDir);
      } catch { /* ignore */ }
    }
    logger.info("git-integration: workspace state", {
      runId,
      workDir,
      generatedDir,
      workspaceDirExists,
      workspaceFileCount: workspaceFiles.length,
      workspaceFiles: workspaceFiles.slice(0, 10),
    });

    await runGit(["clone", "--depth=1", authUrl, cloneDir], "/tmp");

    const slug = taskDescription
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .slice(0, 40)
      .replace(/^-|-$/g, "");
    const branchName = `sdlc/${runId.slice(0, 8)}-${slug || "changes"}`;

    await runGit(["checkout", "-b", branchName], cloneDir);

    copyDirRecursive(generatedDir, cloneDir);

    await runGit(["add", "-A"], cloneDir);

    const { stdout: statusOut } = await runGit(["status", "--porcelain"], cloneDir);
    logger.info("git-integration: git status after copy", { runId, statusOut: statusOut.slice(0, 300) });
    if (!statusOut) {
      return { success: false, error: `No changes to commit — workspace had ${workspaceFiles.length} files (${workspaceDirExists ? "dir exists" : "dir missing"})` };
    }

    const commitMsg = `feat: ${taskDescription.slice(0, 72)}\n\nGenerated by agent-studio SDLC pipeline run ${runId}`;
    await runGit(["commit", "-m", commitMsg], cloneDir);

    const { stdout: commitHash } = await runGit(["rev-parse", "HEAD"], cloneDir);

    await runGit(["push", "origin", branchName], cloneDir);

    const prTitle = `feat: ${taskDescription.slice(0, 72)}`;
    const codeReviewOutput = input.stepOutputs?.["ecc-code-reviewer"] ?? "";
    const secReviewOutput  = input.stepOutputs?.["ecc-security-reviewer"] ?? "";
    const isDraft = /"decision":\s*"BLOCK"/.test(codeReviewOutput)
                 || /"decision":\s*"BLOCK"/.test(secReviewOutput);
    const prBody = input.stepOutputs
      ? buildRichPrBody(input, [])
      : `SDLC Agent Run: ${runId}\n\n${taskDescription}`;
    const prUrl = await createGithubPR(token, owner, repo, branchName, prTitle, prBody, "main", isDraft);

    logger.info("git-integration: PR created", { runId, branchName, prUrl });

    return { success: true, branchName, commitHash, prUrl };
  } catch (err) {
    const rawError = err instanceof Error ? err.message : String(err);
    // Scrub the token from error strings before logging or returning to callers.
    const error = redactToken(rawError, token ?? "");
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
