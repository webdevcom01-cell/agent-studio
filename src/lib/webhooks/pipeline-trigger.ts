/**
 * Webhook → Pipeline Bridge helpers (Layer 1)
 *
 * Provides parsers and utilities for converting inbound GitHub PR / GitLab MR
 * webhook payloads into a normalized PRContext that the pipeline trigger route
 * can pass directly to createPipelineRun().
 *
 * Design decisions:
 * - Variable names mirror the GITHUB_PR / GITLAB_MR presets for compatibility.
 * - GitLab action strings are normalised to GitHub equivalents so downstream
 *   logic only needs to handle one set of values.
 * - buildIdempotencyKey guarantees a unique key per PR commit so the @unique
 *   DB constraint prevents duplicate pipeline runs from GitHub retries.
 */

// ─── Types ─────────────────────────────────────────────────────────────────────

/**
 * Normalized pull/merge request context, independent of the Git provider.
 * Field names deliberately match the GITHUB_PR and GITLAB_MR body mappings
 * (variableName column) so existing preset variables still resolve correctly.
 */
export interface PRContext {
  /** "github" or "gitlab" */
  provider: "github" | "gitlab";

  /** PR/MR number within the repository */
  prNumber: number;

  /** PR/MR title */
  prTitle: string;

  /** Full web URL to the PR/MR (e.g. https://github.com/octocat/repo/pull/42) */
  prUrl: string;

  /** Source branch (head) */
  headBranch: string;

  /** Target branch (base) */
  baseBranch: string;

  /** HEAD commit SHA */
  headSha: string;

  /** Repository web URL */
  repoUrl: string;

  /** "owner/repo" format (e.g. "octocat/hello-world") */
  repoFullName: string;

  /** PR/MR author username */
  author: string;

  /** Whether this is a draft PR/MR */
  isDraft: boolean;

  /**
   * Normalized action string (GitHub values used as the canonical form):
   * "opened" | "synchronize" | "reopened" | "closed" | "merged" |
   * "labeled" | "unlabeled" | "ready_for_review"
   */
  action: string;
}

// ─── GitHub PR parser ──────────────────────────────────────────────────────────

/**
 * Parse a GitHub pull_request webhook payload into PRContext.
 * Returns null if the payload is not a valid GitHub PR event.
 */
export function parseGitHubPRPayload(body: unknown): PRContext | null {
  if (typeof body !== "object" || body === null) return null;

  const b = body as Record<string, unknown>;

  // Must have a pull_request object
  const pr = b.pull_request;
  if (typeof pr !== "object" || pr === null) return null;
  const p = pr as Record<string, unknown>;

  const action = typeof b.action === "string" ? b.action : null;
  if (!action) return null;

  const prNumber = typeof b.number === "number" ? b.number : null;
  if (!prNumber) return null;

  const title = typeof p.title === "string" ? p.title : null;
  const htmlUrl = typeof p.html_url === "string" ? p.html_url : null;
  if (!title || !htmlUrl) return null;

  // Head
  const head = p.head as Record<string, unknown> | null | undefined;
  const headRef = typeof head?.ref === "string" ? head.ref : null;
  const headSha = typeof head?.sha === "string" ? head.sha : null;
  if (!headRef || !headSha) return null;

  // Base
  const base = p.base as Record<string, unknown> | null | undefined;
  const baseRef = typeof base?.ref === "string" ? base.ref : null;
  if (!baseRef) return null;

  // Repo
  const repo = b.repository as Record<string, unknown> | null | undefined;
  const repoUrl = typeof repo?.html_url === "string" ? repo.html_url : null;
  const repoFullName = typeof repo?.full_name === "string" ? repo.full_name : null;
  if (!repoUrl || !repoFullName) return null;

  // Author
  const user = p.user as Record<string, unknown> | null | undefined;
  const author = typeof user?.login === "string" ? user.login : "unknown";

  const isDraft = p.draft === true;

  return {
    provider: "github",
    prNumber,
    prTitle: title,
    prUrl: htmlUrl,
    headBranch: headRef,
    baseBranch: baseRef,
    headSha,
    repoUrl,
    repoFullName,
    author,
    isDraft,
    action,
  };
}

// ─── GitLab MR parser ──────────────────────────────────────────────────────────

/**
 * Normalises GitLab action strings to their GitHub equivalents.
 *
 * GitLab → GitHub:
 *   "open"     → "opened"
 *   "update"   → "synchronize"
 *   "reopen"   → "reopened"
 *   "close"    → "closed"
 *   "merge"    → "merged"
 *   "approved" → "approved"  (no GitHub equivalent, kept as-is)
 */
function normaliseGitLabAction(action: string): string {
  const MAP: Record<string, string> = {
    open: "opened",
    update: "synchronize",
    reopen: "reopened",
    close: "closed",
    merge: "merged",
  };
  return MAP[action] ?? action;
}

/**
 * Parse a GitLab merge_request webhook payload into PRContext.
 * Returns null if the payload is not a valid GitLab MR event.
 */
export function parseGitLabMRPayload(body: unknown): PRContext | null {
  if (typeof body !== "object" || body === null) return null;

  const b = body as Record<string, unknown>;

  // Must be a merge_request event
  if (b.object_kind !== "merge_request") return null;

  const oa = b.object_attributes as Record<string, unknown> | null | undefined;
  if (!oa) return null;

  const rawAction = typeof oa.action === "string" ? oa.action : null;
  if (!rawAction) return null;

  const prNumber =
    typeof oa.iid === "number" ? oa.iid : null;
  if (!prNumber) return null;

  const title = typeof oa.title === "string" ? oa.title : null;
  const mrUrl = typeof oa.url === "string" ? oa.url : null;
  if (!title || !mrUrl) return null;

  const headBranch = typeof oa.source_branch === "string" ? oa.source_branch : null;
  const baseBranch = typeof oa.target_branch === "string" ? oa.target_branch : null;
  if (!headBranch || !baseBranch) return null;

  // HEAD SHA — nested under last_commit
  const lastCommit = oa.last_commit as Record<string, unknown> | null | undefined;
  const headSha = typeof lastCommit?.id === "string" ? lastCommit.id : null;
  if (!headSha) return null;

  // Project / repo
  const project = b.project as Record<string, unknown> | null | undefined;
  const repoUrl = typeof project?.web_url === "string" ? project.web_url : null;
  const repoFullName =
    typeof project?.path_with_namespace === "string"
      ? project.path_with_namespace
      : null;
  if (!repoUrl || !repoFullName) return null;

  // Author
  const user = b.user as Record<string, unknown> | null | undefined;
  const author =
    typeof user?.username === "string"
      ? user.username
      : typeof user?.name === "string"
        ? user.name
        : "unknown";

  const isDraft = oa.draft === true;

  return {
    provider: "gitlab",
    prNumber,
    prTitle: title,
    prUrl: mrUrl,
    headBranch,
    baseBranch,
    headSha,
    repoUrl,
    repoFullName,
    author,
    isDraft,
    action: normaliseGitLabAction(rawAction),
  };
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Build a human-readable task description for the pipeline run.
 * Format: "Code review PR #42: {title} ({author}, {headBranch} → {baseBranch})"
 */
export function buildTaskDescription(ctx: PRContext): string {
  const label = ctx.provider === "gitlab" ? "MR" : "PR";
  return `Code review ${label} #${ctx.prNumber}: ${ctx.prTitle} (${ctx.author}, ${ctx.headBranch} → ${ctx.baseBranch})`;
}

/**
 * Build a deterministic idempotency key for a PR/MR commit.
 *
 * Format: "{provider}-{repoFullName}-{prNumber}-{headSha}"
 * Example: "github-octocat/hello-world-42-abc123def"
 *
 * The key changes whenever the PR is updated (new commits push a new headSha),
 * so each distinct commit triggers exactly one pipeline run.
 * The @unique DB constraint provides race-condition-safe deduplication.
 */
export function buildIdempotencyKey(ctx: PRContext): string {
  // Truncate SHA to 12 chars — sufficient for uniqueness, keeps key readable
  const shortSha = ctx.headSha.slice(0, 12);
  // Sanitize repoFullName to be safe in the key (replace / with -)
  const safeRepo = ctx.repoFullName.replace(/\//g, "-");
  return `${ctx.provider}-${safeRepo}-${ctx.prNumber}-${shortSha}`;
}

/**
 * Determine whether a PR/MR action should trigger a pipeline run.
 *
 * Triggers a run for:
 *   - "opened"      — new PR created
 *   - "synchronize" — new commits pushed (GitHub) / updated (GitLab normalised)
 *   - "reopened"    — previously closed PR reopened
 *   - "ready_for_review" — draft converted to ready
 *
 * Does NOT trigger for:
 *   - "closed" / "merged"   — PR is done
 *   - "labeled" / "unlabeled" — metadata change only
 *   - "assigned" / "edited"   — not code changes
 */
export function isActionRelevant(action: string): boolean {
  const TRIGGERING_ACTIONS = new Set([
    "opened",
    "synchronize",
    "reopened",
    "ready_for_review",
  ]);
  return TRIGGERING_ACTIONS.has(action);
}
