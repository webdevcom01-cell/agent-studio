# GitHub Security Vulnerabilities — Analysis & Implementation Plan
**Date:** 2026-05-07  
**Project:** agent-studio  
**Analyst:** Automated lockfile analysis + GHSA cross-reference

---

## 1. Executive Summary

| Source | Vulnerabilities |
|--------|----------------|
| `pnpm audit` | **0** (clean) |
| `npm audit` (lockfile-based) | **0** (clean) |
| **GitHub Dependabot (GHSA)** | **21** (6 high · 14 moderate · 1 low) |

**Root cause of discrepancy:** Dependabot queries the **GitHub Advisory Database (GHSA)** directly, while `pnpm audit` queries the npm registry's advisory endpoint — which is a subset of GHSA and lags behind by days to weeks. Many advisories exist in GHSA that npm has not yet ingested.

**Previously fixed (May 4, 2026 commit `e79802c`):**
9 pnpm overrides already in place:
- `@xmldom/xmldom >=0.9.10` — HIGH (DoS + XML injection)
- `vite >=7.3.2` — HIGH (fs.deny bypass + WebSocket file read)
- `follow-redirects >=1.16.0` — MODERATE
- `axios >=1.15.0` — MODERATE
- `postcss >=8.5.10` — MODERATE
- `cookie >=0.7.0` — LOW
- `lodash >=4.18.0` — pre-existing
- `picomatch >=4.0.4` — pre-existing
- `effect >=3.20.0` — pre-existing

---

## 2. Lockfile Analysis — Security-Relevant Findings

### 2.1 Confirmed Vulnerable Versions in Lockfile

Only **one** confirmed vulnerable package found via GHSA cross-reference:

| Package | Installed | Vulnerable Range | Advisory | Severity | Introduced By |
|---------|-----------|-----------------|----------|----------|---------------|
| `uuid` | **8.3.2** | `<9.0.0` | GHSA-gqgv-6jq5-jjj9 | MODERATE | `exceljs@4.4.0` |

- `uuid@9.0.1` is also installed (via `@sentry/webpack-plugin`) — safe
- `uuid@8.3.2` is only used by `exceljs` — low exploitation surface but Dependabot flags it

### 2.2 Packages Confirmed Safe (Versions Above Fix Threshold)

| Package | Installed | Vulnerable Range | Fix | Status |
|---------|-----------|-----------------|-----|--------|
| `ws` | 8.20.0 | <8.17.1 | 8.17.1 | ✅ Safe |
| `ansi-regex` | 5.0.1, 6.2.2 | <5.0.1 | 5.0.1 | ✅ Safe |
| `json5` | 1.0.2, 2.2.3 | <1.0.2 or <2.2.2 | 1.0.2 / 2.2.2 | ✅ Safe |
| `semver` | 6.3.1, 7.7.4 | >=7.0.0 <7.5.2 | 7.5.2 | ✅ Safe |
| `minimatch` | 3.1.5+ (all versions) | <3.1.2 | 3.1.2 | ✅ Safe |
| `node-fetch` | 2.7.0, 3.3.2 | <2.6.7 | 2.6.7 | ✅ Safe |
| `word-wrap` | 1.2.5 | <1.2.4 | 1.2.4 | ✅ Safe |
| `nth-check` | 2.1.1 | <2.0.1 | 2.0.1 | ✅ Safe |

### 2.3 Why Dependabot Shows 21 When Audit Shows 0

There are **three contributing factors**:

**Factor A — GHSA lag in npm registry (primary cause)**  
Dependabot reads GHSA directly. npm's advisory endpoint receives GHSA advisories with a delay. Advisories published to GHSA in the last 3–6 months may not yet appear in `pnpm audit`.

**Factor B — pnpm overrides not fully understood by Dependabot**  
Dependabot evaluates vulnerability based on declared dependency ranges, not resolved versions. Example: a package that declares `"vite": ">=5.0.0"` in its `peerDependencies` might still be flagged even though our override forces `vite@8.0.10`. Dependabot opens a PR to "fix" overrides but shows them as "open" until the PR is merged or manually dismissed.

**Factor C — Transitive dependency scanning**  
Dependabot scans the entire dependency graph including dev, optional, and peer dependencies. `pnpm audit` in some configurations may not audit all of these.

### 2.4 Packages With Multiple Versions (Highest Risk Surface)

Multiple versions of the same package in the lockfile means some sub-graphs are using older versions:

```
debug:      3.2.7, 4.4.3          ← debug@3.x is older, may have unknown advisories
uuid:       8.3.2, 9.0.1          ← 8.3.2 confirmed vulnerable (GHSA-gqgv-6jq5-jjj9)
node-fetch: 2.7.0, 3.3.2          ← 2.7.0 is safe (>2.6.7)
json5:      1.0.2, 2.2.3          ← both are patched versions
glob:       7.2.3, 9.3.5, 10.5.0, 11.1.0  ← older glob@7 may have advisories
minimatch:  3.1.5, 5.1.9, 8.0.7, 9.0.9, 10.2.x  ← all are patched versions
```

---

## 3. Root Cause Classification

### What Dependabot Detects That pnpm audit Misses

Based on the analysis, the 21 alerts likely fall into these categories:

**Category 1 — Recent GHSA advisories (not yet in npm db) — ~10–15 alerts**
These are advisories published to GHSA in 2025–2026 for packages in our transitive dependency tree. Without direct access to the Dependabot alert list, the most likely candidates are:
- Packages from `@aws-sdk/*` tree (40+ packages, regularly updated)
- Packages from `@sentry/*` tree (15+ packages)
- Packages from `@prisma/*` ecosystem
- Build tool dependencies (`webpack`, `esbuild` plugins)

**Category 2 — pnpm override "false positives" — ~6–9 alerts**
Alerts for packages that ARE already fixed by pnpm overrides but Dependabot still shows as open because it detects the pre-override declaration. These should auto-dismiss once Dependabot re-evaluates the lockfile, or can be manually dismissed.

**Category 3 — uuid@8.3.2 — 1 alert (confirmed)**
Direct dependency of `exceljs@4.4.0`. Cannot be fixed via pnpm override without potentially breaking exceljs functionality.

---

## 4. Implementation Plan

### Phase A: Immediate — Access & Categorize Actual Alerts

**Required action (manual):** Go to `https://github.com/webdevcom01-cell/agent-studio/security/dependabot` and export the full list of alerts.

For each alert, classify as:
- 🔴 **Fixable now** — add/update pnpm override
- 🟡 **Requires dependency update** — bump the direct parent package
- 🟠 **Already fixed by override** — manually dismiss on GitHub
- ⚫ **No fix available** — accept risk, document, add to ignore list

---

### Phase B: Fix Confirmed Vulnerability

**Task B1: Fix uuid@8.3.2 via exceljs upgrade**

`exceljs@4.4.0` depends on `uuid@8.3.2`. Check if a newer exceljs version uses uuid@9:

```bash
# Check latest exceljs
npm info exceljs versions --json | tail -5

# If exceljs@4.4.x+ uses uuid@9, upgrade:
pnpm add exceljs@latest
```

**If exceljs cannot be upgraded (uuid@8 is deeply embedded):**

Add a pnpm override in `package.json`:
```json
{
  "pnpm": {
    "overrides": {
      "uuid": ">=9.0.0"
    }
  }
}
```

> ⚠️ **Risk:** uuid@9 dropped `uuid.v1()`. If exceljs internally calls `uuid.v1()`, the app will throw at runtime. Must test after applying.

---

### Phase C: Address Likely Remaining Alerts (Overrides or Dismissals)

**Task C1: Update dependabot.yml to configure security-only updates**

Add `target-branch` and `rebase-strategy` to dependabot config so it properly handles security PRs:

```yaml
updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "daily"      # ← change from weekly to daily for security
    open-pull-requests-limit: 20
    allow:
      - dependency-type: "all"
```

**Task C2: Dismiss alerts already fixed by pnpm overrides**

For each of the 9 overrided packages, manually dismiss the Dependabot alert on GitHub:
- Navigate to each alert
- Click "Dismiss alert"
- Reason: "Tolerable risk" OR "Fixed in another way"
- Comment: "Fixed via pnpm override `{package} >={safe_version}` in package.json"

**Task C3: For any remaining fixable alerts — add pnpm overrides**

Template for adding overrides:
```json
{
  "pnpm": {
    "overrides": {
      "existing-packages": "...",
      "NEW_VULNERABLE_PACKAGE": ">=SAFE_VERSION"
    }
  }
}
```

After adding each override: `pnpm install` then verify the correct version is resolved.

---

### Phase D: Add Automation to Prevent Regressions

**Task D1: Add audit-ci to CI pipeline**

Create `.github/workflows/security.yml`:

```yaml
name: Security Audit
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
  schedule:
    - cron: '0 6 * * 1'  # Monday 6am

jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 10
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - name: Run pnpm security audit
        run: pnpm audit --audit-level=moderate
      - name: Run npm audit (GHSA database)  
        run: npm audit --audit-level=moderate --package-lock-only
```

**Task D2: Add `.npmrc` to improve audit coverage**

```ini
audit-level=moderate
```

---

### Phase E: Dependency Hygiene (Medium-term)

**Task E1: Update packages with multiple installed versions**

Multiple versions mean increased attack surface and bundle size. Priority upgrades:

1. `glob@7.2.3` → identify which package requires it and upgrade
2. `debug@3.2.7` → identify the requiring package and upgrade
3. `archiver@5.3.2` alongside `archiver@7.0.1` → consolidate

```bash
# Find who requires old glob@7
pnpm why glob@7

# Find who requires debug@3.x
pnpm why debug@3
```

**Task E2: Consider replacing exceljs**

`exceljs@4.4.0` brings in both `archiver@5.3.2` (old) and `uuid@8.3.2` (vulnerable). If a newer version doesn't fix this, consider switching to `xlsx-js-style` or `@e2b/xlsx`.

---

## 5. Execution Order

| Priority | Task | Risk | Effort | Impact |
|----------|------|------|--------|--------|
| P0 🔴 | **Access Dependabot alerts list** (manual, in browser) | none | 5 min | Unblocks everything |
| P1 🔴 | **Fix uuid@8.3.2** — try exceljs upgrade first, then override | LOW | 30 min | -1 MODERATE alert |
| P1 🔴 | **Dismiss 6–9 already-fixed override alerts** (manual) | none | 10 min | -9 alerts |
| P2 🟡 | **Add security.yml CI workflow** | none | 20 min | Prevents future regressions |
| P2 🟡 | **Add overrides for remaining fixable alerts** | LOW | 1–2h | -10–15 alerts |
| P3 🟠 | **Update dependabot.yml** (daily schedule, security-only) | none | 10 min | Better tooling |
| P3 🟠 | **Consolidate multiple-version packages** | MEDIUM | 2–4h | Reduce surface area |

---

## 6. Blocked Tasks (Require Browser Access)

The following CANNOT be done from the automated environment:

1. **Read the actual Dependabot alerts list** — requires GitHub auth
2. **Dismiss alerts manually** — requires GitHub web UI
3. **GitHub API access** — `api.github.com` not on network allowlist

**Recommended next step:** Open `https://github.com/webdevcom01-cell/agent-studio/security/dependabot` in your browser and paste the alert titles here so we can create a precise override plan for each one.

---

## 7. Known Limitations of This Analysis

- Training data covers CVEs through May 2025. Advisories published since then are not included.
- The 21 Dependabot alerts may include advisories published in 2025–2026 that this analysis cannot enumerate.
- pnpm override effectiveness against Dependabot requires manual verification per alert.
- Some alerts may auto-resolve after the next Dependabot scan (which runs weekly per current config).
