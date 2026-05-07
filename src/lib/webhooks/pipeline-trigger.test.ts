/**
 * Tests for pipeline-trigger.ts — webhook payload parsers and utilities.
 */

import { describe, it, expect } from "vitest";
import {
  parseGitHubPRPayload,
  parseGitLabMRPayload,
  buildTaskDescription,
  buildIdempotencyKey,
  isActionRelevant,
} from "./pipeline-trigger";

// ─── Sample payloads ──────────────────────────────────────────────────────────

const GITHUB_PR_PAYLOAD = {
  action: "opened",
  number: 42,
  pull_request: {
    title: "feat: add user authentication flow",
    html_url: "https://github.com/octocat/hello-world/pull/42",
    head: { ref: "feature/auth-flow", sha: "abc123def456789012345" },
    base: { ref: "main" },
    user: { login: "octocat" },
    draft: false,
    body: "Implements OAuth2 flow",
  },
  repository: {
    full_name: "octocat/hello-world",
    html_url: "https://github.com/octocat/hello-world",
  },
};

const GITLAB_MR_PAYLOAD = {
  object_kind: "merge_request",
  user: { username: "john.doe", name: "John Doe" },
  object_attributes: {
    iid: 42,
    title: "feat: add user authentication flow",
    url: "https://gitlab.com/mygroup/my-project/-/merge_requests/42",
    source_branch: "feature/auth-flow",
    target_branch: "main",
    last_commit: { id: "abc123def456789012345" },
    action: "open",
    draft: false,
    description: "Implements OAuth2 flow",
  },
  project: {
    web_url: "https://gitlab.com/mygroup/my-project",
    path_with_namespace: "mygroup/my-project",
  },
};

// ─── parseGitHubPRPayload ─────────────────────────────────────────────────────

describe("parseGitHubPRPayload", () => {
  it("parses a valid GitHub PR payload", () => {
    const ctx = parseGitHubPRPayload(GITHUB_PR_PAYLOAD);
    expect(ctx).not.toBeNull();
    expect(ctx?.provider).toBe("github");
    expect(ctx?.prNumber).toBe(42);
    expect(ctx?.prTitle).toBe("feat: add user authentication flow");
    expect(ctx?.prUrl).toBe("https://github.com/octocat/hello-world/pull/42");
    expect(ctx?.headBranch).toBe("feature/auth-flow");
    expect(ctx?.baseBranch).toBe("main");
    expect(ctx?.headSha).toBe("abc123def456789012345");
    expect(ctx?.repoFullName).toBe("octocat/hello-world");
    expect(ctx?.repoUrl).toBe("https://github.com/octocat/hello-world");
    expect(ctx?.author).toBe("octocat");
    expect(ctx?.isDraft).toBe(false);
    expect(ctx?.action).toBe("opened");
  });

  it("returns null for a non-PR payload (no pull_request key)", () => {
    expect(parseGitHubPRPayload({ action: "created", issue: {} })).toBeNull();
  });

  it("returns null for a push event payload", () => {
    expect(parseGitHubPRPayload({ ref: "refs/heads/main", commits: [] })).toBeNull();
  });

  it("returns null for null input", () => {
    expect(parseGitHubPRPayload(null)).toBeNull();
  });

  it("returns null for string input", () => {
    expect(parseGitHubPRPayload("not an object")).toBeNull();
  });

  it("detects draft PRs", () => {
    const draftPayload = {
      ...GITHUB_PR_PAYLOAD,
      pull_request: { ...GITHUB_PR_PAYLOAD.pull_request, draft: true },
    };
    const ctx = parseGitHubPRPayload(draftPayload);
    expect(ctx?.isDraft).toBe(true);
  });
});

// ─── parseGitLabMRPayload ─────────────────────────────────────────────────────

describe("parseGitLabMRPayload", () => {
  it("parses a valid GitLab MR payload", () => {
    const ctx = parseGitLabMRPayload(GITLAB_MR_PAYLOAD);
    expect(ctx).not.toBeNull();
    expect(ctx?.provider).toBe("gitlab");
    expect(ctx?.prNumber).toBe(42);
    expect(ctx?.prTitle).toBe("feat: add user authentication flow");
    expect(ctx?.prUrl).toBe("https://gitlab.com/mygroup/my-project/-/merge_requests/42");
    expect(ctx?.headBranch).toBe("feature/auth-flow");
    expect(ctx?.baseBranch).toBe("main");
    expect(ctx?.headSha).toBe("abc123def456789012345");
    expect(ctx?.repoFullName).toBe("mygroup/my-project");
    expect(ctx?.repoUrl).toBe("https://gitlab.com/mygroup/my-project");
    expect(ctx?.author).toBe("john.doe");
    expect(ctx?.isDraft).toBe(false);
    // GitLab "open" → normalised to "opened"
    expect(ctx?.action).toBe("opened");
  });

  it("normalises GitLab 'update' action to 'synchronize'", () => {
    const payload = {
      ...GITLAB_MR_PAYLOAD,
      object_attributes: { ...GITLAB_MR_PAYLOAD.object_attributes, action: "update" },
    };
    const ctx = parseGitLabMRPayload(payload);
    expect(ctx?.action).toBe("synchronize");
  });

  it("normalises GitLab 'reopen' action to 'reopened'", () => {
    const payload = {
      ...GITLAB_MR_PAYLOAD,
      object_attributes: { ...GITLAB_MR_PAYLOAD.object_attributes, action: "reopen" },
    };
    expect(parseGitLabMRPayload(payload)?.action).toBe("reopened");
  });

  it("normalises GitLab 'close' action to 'closed'", () => {
    const payload = {
      ...GITLAB_MR_PAYLOAD,
      object_attributes: { ...GITLAB_MR_PAYLOAD.object_attributes, action: "close" },
    };
    expect(parseGitLabMRPayload(payload)?.action).toBe("closed");
  });

  it("returns null for a non-MR payload (wrong object_kind)", () => {
    expect(parseGitLabMRPayload({ object_kind: "push", commits: [] })).toBeNull();
  });

  it("returns null for null input", () => {
    expect(parseGitLabMRPayload(null)).toBeNull();
  });

  it("detects draft MRs", () => {
    const draftPayload = {
      ...GITLAB_MR_PAYLOAD,
      object_attributes: { ...GITLAB_MR_PAYLOAD.object_attributes, draft: true },
    };
    const ctx = parseGitLabMRPayload(draftPayload);
    expect(ctx?.isDraft).toBe(true);
  });
});

// ─── buildIdempotencyKey ──────────────────────────────────────────────────────

describe("buildIdempotencyKey", () => {
  it("produces a deterministic key for GitHub", () => {
    const ctx = parseGitHubPRPayload(GITHUB_PR_PAYLOAD)!;
    const key = buildIdempotencyKey(ctx);
    // Should be stable across calls
    expect(buildIdempotencyKey(ctx)).toBe(key);
    // Should include provider, repo, pr number, sha prefix
    expect(key).toContain("github");
    expect(key).toContain("octocat-hello-world");
    expect(key).toContain("42");
    expect(key).toContain("abc123def456");
  });

  it("produces a deterministic key for GitLab", () => {
    const ctx = parseGitLabMRPayload(GITLAB_MR_PAYLOAD)!;
    const key = buildIdempotencyKey(ctx);
    expect(key).toContain("gitlab");
    expect(key).toContain("mygroup-my-project");
    expect(key).toContain("42");
  });

  it("produces different keys for different SHAs (new commit = new run)", () => {
    const ctx1 = parseGitHubPRPayload(GITHUB_PR_PAYLOAD)!;
    const ctx2 = {
      ...ctx1,
      headSha: "zzz999different000sha",
    };
    expect(buildIdempotencyKey(ctx1)).not.toBe(buildIdempotencyKey(ctx2));
  });

  it("uses / to - normalisation for repo full name", () => {
    const ctx = parseGitHubPRPayload(GITHUB_PR_PAYLOAD)!;
    const key = buildIdempotencyKey(ctx);
    // No slashes in the key (safe for use as unique constraint value)
    expect(key).not.toContain("/");
  });
});

// ─── isActionRelevant ─────────────────────────────────────────────────────────

describe("isActionRelevant", () => {
  it.each(["opened", "synchronize", "reopened", "ready_for_review"])(
    "returns true for triggering action '%s'",
    (action) => {
      expect(isActionRelevant(action)).toBe(true);
    }
  );

  it.each(["closed", "merged", "labeled", "unlabeled", "assigned", "edited", "review_requested"])(
    "returns false for non-triggering action '%s'",
    (action) => {
      expect(isActionRelevant(action)).toBe(false);
    }
  );
});

// ─── buildTaskDescription ─────────────────────────────────────────────────────

describe("buildTaskDescription", () => {
  it("builds a human-readable description for GitHub PR", () => {
    const ctx = parseGitHubPRPayload(GITHUB_PR_PAYLOAD)!;
    const desc = buildTaskDescription(ctx);
    expect(desc).toContain("PR #42");
    expect(desc).toContain("feat: add user authentication flow");
    expect(desc).toContain("octocat");
    expect(desc).toContain("feature/auth-flow");
    expect(desc).toContain("main");
  });

  it("uses 'MR' label for GitLab", () => {
    const ctx = parseGitLabMRPayload(GITLAB_MR_PAYLOAD)!;
    const desc = buildTaskDescription(ctx);
    expect(desc).toContain("MR #42");
    expect(desc).not.toContain("PR #");
  });
});
