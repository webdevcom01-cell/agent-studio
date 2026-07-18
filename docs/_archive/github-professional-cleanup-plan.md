# Agent Studio — GitHub Professional Standards Plan (2026)

> Audit date: March 28, 2026
> Based on: GitHub 2026 Security Roadmap, GitHub Community Standards, SOC 2 Compliance Checklist

---

## Current State Audit

### What's Already Good

| Item | Status |
|------|--------|
| README.md (323 lines, badges, deploy buttons) | ✅ |
| LICENSE (Apache 2.0) | ✅ |
| CONTRIBUTING.md | ✅ |
| CODE_OF_CONDUCT.md | ✅ |
| CHANGELOG.md | ✅ |
| CI workflow (lint + typecheck + test + build) | ✅ |
| E2E workflow (Playwright + pgvector) | ✅ |
| Docker build + push workflow (GHCR) | ✅ |
| Docs deploy workflow (GitHub Pages) | ✅ |
| Issue templates (bug report + feature request) | ✅ |
| PR template with checklist | ✅ |
| Conventional Commits format (feat/fix/docs/chore) | ✅ |
| One release tag (v0.1.0) | ✅ |

### What's Missing or Broken

| Item | Impact | Priority |
|------|--------|----------|
| SECURITY.md — no vulnerability disclosure policy | Critical | P0 |
| .github/dependabot.yml — no automated dependency updates | Critical | P0 |
| .github/CODEOWNERS — no auto-assign reviewers | High | P0 |
| GitHub Actions pinned to @v4/@v3 instead of commit SHA | High (supply chain) | P0 |
| CodeQL security scanning workflow | High | P1 |
| Junk files tracked in git (top_story_*.md, test-*.ts) | Medium | P1 |
| Stale feature branches not deleted (3 local + 2 remote) | Medium | P1 |
| README test badge shows "1700+" instead of "2154+" | Medium | P2 |
| No release automation workflow (release-please) | Medium | P2 |
| No .github/ISSUE_TEMPLATE/config.yml | Low | P2 |
| No GitHub Discussions enabled | Low | P3 |
| No FUNDING.yml | Low | P3 |
| Planning docs cluttering root directory | Low | P3 |
| Branch protection rules not configured | Critical | P0 (manual) |
| Secret scanning not enabled | Critical | P0 (manual) |
| Repository topics not set | Low | P3 (manual) |
| Social preview image missing | Low | P3 (manual) |

---

## Implementation Plan

### FAZA 1 — Repository Cleanup (Automated, ~5 min)

**Goal:** Clean root directory, remove junk files, delete stale branches.

**1.1 Remove junk files from git tracking:**
```
git rm top_story_1.md top_story_2.md top_story_3.md
git rm test-advanced-orchestration.ts test-orchestration.ts
git rm implementation-plan.json
```

**1.2 Move planning docs to docs/archive/:**
```
git mv IMPLEMENTATION-PLAN.md docs/archive/
git mv PYTHON_NODE_UPGRADE_PLAN.md docs/archive/
git mv tech-debt-cleanup-plan.md docs/archive/
```
> Note: TECH_DEBT.md stays in root (standard project governance file)

**1.3 Update .gitignore:**
Add entries to prevent future junk:
```gitignore
# Scratch/temp files
top_story_*.md
test-*.ts
!src/**/test-*.ts
*.tmp.md
```

**1.4 Delete stale branches:**
```bash
# Local (already merged into main)
git branch -d feature/a2a-communication
git branch -d feature/mcp-nodes
git branch -d feature/notebooklm-mcp-kb

# Remote
git push origin --delete feature/mcp-nodes
git push origin --delete feature/notebooklm-mcp-kb
```

---

### FAZA 2 — Security Standards (Automated, ~10 min)

**Goal:** Meet GitHub 2026 "secure-by-default" requirements and SOC 2 compliance.

**2.1 Create SECURITY.md:**
```markdown
# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| latest main | ✅ |
| < main | ❌ |

## Reporting a Vulnerability

If you discover a security vulnerability, please report it responsibly:

1. **Do NOT** create a public GitHub issue
2. Email: [security contact email]
3. Include: description, steps to reproduce, potential impact
4. Expected response: within 48 hours
5. We follow coordinated disclosure (90-day window)

## Security Measures

- All dependencies monitored via Dependabot
- CodeQL SAST scanning on every PR
- Secret scanning with push protection enabled
- HMAC-SHA256 webhook verification
- SSRF protection with DNS validation
- Content Security Policy headers
- JWT sessions with 24-hour expiry
```

**2.2 Create .github/dependabot.yml:**
```yaml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
      day: "monday"
    open-pull-requests-limit: 10
    groups:
      dev-dependencies:
        dependency-type: "development"
      production-dependencies:
        dependency-type: "production"
    labels:
      - "dependencies"

  - package-ecosystem: "github-actions"
    directory: "/"
    schedule:
      interval: "weekly"
    labels:
      - "ci"

  - package-ecosystem: "docker"
    directory: "/"
    schedule:
      interval: "monthly"
    labels:
      - "docker"
```

**2.3 Create .github/CODEOWNERS:**
```
# Default owner for everything
* @webdevcom01-cell

# CI/CD
.github/ @webdevcom01-cell

# Database schema
prisma/ @webdevcom01-cell

# Core runtime engine
src/lib/runtime/ @webdevcom01-cell

# Security-sensitive
src/lib/security/ @webdevcom01-cell
src/middleware.ts @webdevcom01-cell
```

**2.4 Create .github/workflows/codeql.yml:**
```yaml
name: CodeQL Analysis

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
  schedule:
    - cron: "0 6 * * 1"  # Weekly Monday 6AM UTC

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  analyze:
    name: Analyze
    runs-on: ubuntu-latest
    timeout-minutes: 15
    permissions:
      security-events: write
      contents: read
    strategy:
      matrix:
        language: [javascript-typescript]
    steps:
      - uses: actions/checkout@<PINNED_SHA>
      - uses: github/codeql-action/init@<PINNED_SHA>
        with:
          languages: ${{ matrix.language }}
      - uses: github/codeql-action/autobuild@<PINNED_SHA>
      - uses: github/codeql-action/analyze@<PINNED_SHA>
        with:
          category: "/language:${{ matrix.language }}"
```

**2.5 Pin ALL GitHub Actions to commit SHA:**

Replace in all 4 workflow files (ci.yml, docker.yml, docs.yml, codeql.yml):
| Action | Current | Pinned SHA |
|--------|---------|------------|
| actions/checkout | @v4 | @11bd71901bbe5b1630ceea73d27597364c9af683 |
| actions/setup-node | @v4 | @49933ea5288caeca8642d1e84afbd3f7d6820020 |
| pnpm/action-setup | @v4 | @a7487c7e89a18df4991f7f222e4898a00d66ddda |
| actions/upload-artifact | @v4 | @ea165f8d65b6e75b540449e92b4886f43607fa02 |
| actions/upload-pages-artifact | @v3 | @56afc609e74202f3d62d2f1343136d8b893fa3d0 |
| actions/deploy-pages | @v4 | @d6db90164ac5ed86f2b6aed7e0febac5b3c0c03e |
| docker/setup-qemu-action | @v3 | @... |
| docker/setup-buildx-action | @v3 | @... |
| docker/login-action | @v3 | @... |
| docker/build-push-action | @v6 | @... |
| github/codeql-action/* | new | @... |

> Note: Exact SHAs will be resolved at implementation time via `git ls-remote`

---

### FAZA 3 — CI/CD Improvements (Automated, ~15 min)

**Goal:** Faster feedback, better coverage, automated releases.

**3.1 Optimize CI workflow — parallel jobs:**

Current: 1 job does lint → typecheck → test → build (sequential, ~8-10 min)
New: 4 parallel jobs (faster feedback, clearer error isolation)

```yaml
jobs:
  lint:
    name: Lint
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps: [checkout, setup, install, lint]

  typecheck:
    name: Typecheck
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps: [checkout, setup, install, generate, typecheck]

  test:
    name: Unit Tests
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps: [checkout, setup, install, generate, test --coverage]

  build:
    name: Build
    runs-on: ubuntu-latest
    timeout-minutes: 10
    needs: [lint, typecheck, test]
    steps: [checkout, setup, install, generate, build]
```

**3.2 Add release automation workflow (release-please):**

```yaml
name: Release

on:
  push:
    branches: [main]

permissions:
  contents: write
  pull-requests: write

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: googleapis/release-please-action@<PINNED_SHA>
        with:
          release-type: node
          changelog-types: >
            [
              {"type":"feat","section":"Features"},
              {"type":"fix","section":"Bug Fixes"},
              {"type":"perf","section":"Performance"},
              {"type":"docs","section":"Documentation"},
              {"type":"chore","section":"Maintenance"}
            ]
```

> This auto-creates release PRs with bumped version + CHANGELOG updates based on
> Conventional Commits. When merged, it creates a GitHub Release with release notes.

---

### FAZA 4 — Issue/PR Template Upgrades (Automated, ~5 min)

**Goal:** Modern YAML-based issue forms with structured fields.

**4.1 Upgrade issue templates to YAML forms:**

Replace `.github/ISSUE_TEMPLATE/bug_report.md` with `bug_report.yml`:
```yaml
name: Bug Report
description: Report a bug to help us improve Agent Studio
labels: ["bug", "triage"]
body:
  - type: textarea
    id: description
    attributes:
      label: Describe the bug
      placeholder: A clear description of what the bug is
    validations:
      required: true
  - type: textarea
    id: reproduce
    attributes:
      label: Steps to reproduce
      placeholder: |
        1. Go to '...'
        2. Click on '...'
    validations:
      required: true
  - type: textarea
    id: expected
    attributes:
      label: Expected behavior
    validations:
      required: true
  - type: dropdown
    id: severity
    attributes:
      label: Severity
      options:
        - Critical (app crash, data loss)
        - High (feature broken)
        - Medium (feature degraded)
        - Low (cosmetic, minor)
    validations:
      required: true
  - type: dropdown
    id: area
    attributes:
      label: Area
      options:
        - Flow Editor
        - Chat / Streaming
        - Knowledge Base / RAG
        - Agent Discovery / Templates
        - CLI Generator
        - Evals / Testing
        - Webhooks
        - MCP Integration
        - Authentication
        - Other
  - type: input
    id: version
    attributes:
      label: Version or commit hash
      placeholder: e.g. v0.2.0 or abc1234
  - type: textarea
    id: context
    attributes:
      label: Additional context
      placeholder: Screenshots, logs, error messages
```

Replace `feature_request.md` with `feature_request.yml` (similar structured format).

**4.2 Add .github/ISSUE_TEMPLATE/config.yml:**
```yaml
blank_issues_enabled: false
contact_links:
  - name: Questions & Discussions
    url: https://github.com/webdevcom01-cell/agent-studio/discussions
    about: Ask questions and discuss ideas here
  - name: Documentation
    url: https://agent-studio-docs.pages.dev
    about: Check the docs before opening an issue
```

---

### FAZA 5 — README & Badges (Automated, ~5 min)

**Goal:** Accurate, professional README.

**5.1 Fix test count badge:**
```diff
- <img src="https://img.shields.io/badge/Tests-1700%2B-brightgreen" alt="Tests">
+ <img src="https://img.shields.io/badge/Tests-2154%2B-brightgreen" alt="Tests">
```

**5.2 Add missing badges:**
```html
<img src="https://img.shields.io/badge/Node_Types-53-orange" alt="53 Node Types">
<img src="https://img.shields.io/badge/Agent_Templates-221-purple" alt="221 Templates">
```

**5.3 Add CodeQL badge:**
```html
<a href="https://github.com/webdevcom01-cell/agent-studio/actions/workflows/codeql.yml">
  <img src="https://github.com/webdevcom01-cell/agent-studio/actions/workflows/codeql.yml/badge.svg" alt="CodeQL">
</a>
```

---

### FAZA 6 — GitHub Platform Settings (Manual — User)

**Goal:** Complete the professional setup via GitHub UI.

These CANNOT be automated and must be configured manually in GitHub Settings:

**6.1 Branch Protection Rules (Settings → Branches → Add rule):**
- Branch name pattern: `main`
- ✅ Require a pull request before merging
  - Required approvals: 1
- ✅ Require status checks to pass before merging
  - Required checks: `Lint`, `Typecheck`, `Unit Tests`, `Build`
- ✅ Require branches to be up to date before merging
- ✅ Do not allow force pushes
- ✅ Do not allow deletions

**6.2 Security Features (Settings → Code security):**
- ✅ Enable Dependabot alerts
- ✅ Enable Dependabot security updates
- ✅ Enable Secret scanning
- ✅ Enable Push protection

**6.3 Enable GitHub Discussions (Settings → Features):**
- ✅ Discussions checkbox
- Create categories: Announcements, Q&A, Ideas, Show and Tell

**6.4 Repository Topics (main repo page → gear icon):**
Add: `ai`, `agents`, `nextjs`, `typescript`, `mcp`, `rag`, `llm`, `flow-editor`,
`multi-agent`, `ai-agent-builder`, `model-context-protocol`, `knowledge-base`

**6.5 Social Preview (Settings → Social preview):**
- Upload 1280×640px image showing the flow editor UI
- This dramatically improves link previews on Twitter, Slack, Discord, etc.

**6.6 About Section (main repo page → gear icon):**
- Description: "Visual AI agent builder with multi-agent orchestration, 53 node types, RAG knowledge bases, and MCP integration"
- Website: https://agent-studio-production-c43e.up.railway.app
- ✅ Releases, ✅ Packages

---

## Implementation Order

| Step | Phase | Time | Who | Commit |
|------|-------|------|-----|--------|
| 1 | FAZA 1 — Cleanup | 5 min | Claude | `chore: clean up repository — remove junk files, delete stale branches` |
| 2 | FAZA 2 — Security | 10 min | Claude | `security: add SECURITY.md, dependabot, CODEOWNERS, CodeQL workflow` |
| 3 | FAZA 3 — CI/CD | 15 min | Claude | `ci: optimize workflow parallelism, add release automation, pin action SHAs` |
| 4 | FAZA 4 — Templates | 5 min | Claude | `chore: upgrade issue templates to YAML forms, add config` |
| 5 | FAZA 5 — README | 5 min | Claude | `docs: update README badges and counts` |
| 6 | FAZA 6 — GitHub UI | 10 min | User | Manual configuration in GitHub Settings |

**Total automated work: ~40 min**
**Total manual work: ~10 min**

---

## Post-Implementation Verification

After all phases are complete, verify:

- [ ] GitHub Community Standards page shows 100% green
- [ ] All 3 CI badges green (CI, Docker, CodeQL)
- [ ] Dependabot creates first PRs within 24h
- [ ] Branch protection blocks direct pushes to main
- [ ] Secret scanning active
- [ ] `git ls-files` shows no junk files in root
- [ ] `git branch -r` shows only `origin/main`
- [ ] GitHub Discussions tab visible

---

## References

- [GitHub Repository Best Practices](https://docs.github.com/en/repositories/creating-and-managing-repositories/best-practices-for-repositories)
- [GitHub Actions 2026 Security Roadmap](https://github.blog/news-insights/product-news/whats-coming-to-our-github-actions-2026-security-roadmap/)
- [GitHub Platform Standards](https://williamzujkowski.github.io/standards/standards/GITHUB_PLATFORM_STANDARDS/)
- [SOC 2 Compliance Checklist](https://delve.co/blog/github-configuration-checklist-for-soc-2-compliance)
- [GitHub Community Standards](https://docs.github.com/en/communities/setting-up-your-project-for-healthy-contributions/about-community-profiles-for-public-repositories)
- [SHA Pinning for Actions](https://www.stepsecurity.io/blog/pinning-github-actions-for-enhanced-security-a-complete-guide)
- [Release Please Action](https://github.com/googleapis/release-please-action)
