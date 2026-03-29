# Autonomous DevOps Swarm — Setup Guide

> **Prerequisites:** Agent Studio running on Railway · GitHub account · 20 minutes

---

## Overview

This guide walks you through deploying the full Autonomous DevOps Swarm stack:

1. Deploy `security-scanner-mcp` Railway service
2. Deploy `gh-bridge-mcp` Railway service
3. Run the automated setup script
4. Test against the vulnerable demo repository

---

## Step 1 — Deploy security-scanner-mcp

The security scanner provides `npm audit` and `semgrep` capabilities via MCP.

### 1a. Add the service to Railway

In your Railway project dashboard:

1. Click **+ New** → **GitHub Repo**
2. Select your `agent-studio` repository
3. Set **Root Directory** to `services/security-scanner-mcp`
4. Railway will auto-detect Python via Nixpacks

### 1b. Configure environment variables

In the service settings → **Variables**:

```
PORT=8001
```

No other variables required — this service has no secrets.

### 1c. Verify deployment

Once deployed, check the health endpoint:

```bash
curl https://your-security-scanner.railway.app/health
# Expected: {"status": "healthy", "service": "security-scanner-mcp", ...}
```

Note your service URL: `https://your-security-scanner.railway.app`

---

## Step 2 — Deploy gh-bridge-mcp

The GitHub bridge provides repository operations via the `gh` CLI.

### 2a. Add the service to Railway

1. Click **+ New** → **GitHub Repo**
2. Select your `agent-studio` repository
3. Set **Root Directory** to `services/gh-bridge-mcp`

### 2b. Configure environment variables

In the service settings → **Variables**:

```
PORT=8002
GITHUB_TOKEN=ghp_your_token_here
```

**Creating a GitHub Token:**
1. Go to [github.com/settings/tokens](https://github.com/settings/tokens)
2. Click **Generate new token (classic)**
3. Set expiration: 90 days
4. Select scopes:
   - `repo` (Full control of private repositories)
   - `workflow` (Update GitHub Action workflows — optional)
5. Click **Generate token** and copy immediately

> ⚠️ **Security:** Never commit the token to git. Store only in Railway environment variables.

### 2c. Verify deployment

```bash
curl https://your-gh-bridge.railway.app/health
# Expected: {"status": "healthy", "service": "gh-bridge-mcp", ...}
```

---

## Step 3 — Run the Setup Script

The setup script automatically creates all 4 agents, links MCP servers, and configures the complete flow.

### 3a. Get your Agent Studio session cookie

1. Open [your Agent Studio](https://agent-studio-production-c43e.up.railway.app) in your browser
2. Open DevTools (F12) → **Application** → **Cookies**
3. Find the cookie named `authjs.session-token` (or `__Secure-authjs.session-token` on HTTPS)
4. Copy the full cookie value

### 3b. Run the script

```bash
cd agent-studio

AGENT_STUDIO_URL="https://agent-studio-production-c43e.up.railway.app" \
SECURITY_SCANNER_URL="https://your-security-scanner.railway.app/mcp" \
GH_BRIDGE_URL="https://your-gh-bridge.railway.app/mcp" \
AUTH_COOKIE="your_session_token_here" \
node scripts/setup-devops-swarm.mjs
```

### 3c. What the script does

```
Step 1/5  Creating MCP servers...
  ✅ security-scanner-mcp  id: mcp_xxx
  ✅ gh-bridge-mcp          id: mcp_yyy

Step 2/5  Creating agents...
  ✅ Swarm Security Analyst v1.0   id: agent_aaa
  ✅ Swarm Patch Engineer v1.0     id: agent_bbb
  ✅ Swarm Test Validator v1.0     id: agent_ccc
  ✅ Swarm Orchestrator v1.0       id: agent_ddd

Step 3/5  Linking MCP servers to agents...
  ✅ Security Analyst ← security-scanner-mcp
  ✅ Patch Engineer   ← gh-bridge-mcp
  ✅ Orchestrator     ← security-scanner-mcp + gh-bridge-mcp

Step 4/5  Injecting sub-agent IDs into Orchestrator system prompt...
  ✅ Orchestrator system prompt updated

Step 5/5  Pushing SWARM_FLOW to Orchestrator...
  ✅ Flow saved (18 nodes, 26 edges)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ✅ DevOps Swarm ready!

  Orchestrator: https://agent-studio.../chat/agent_ddd
  Test repo:    https://github.com/your-org/agent-studio-vulnerable-demo
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

If any step fails, the script prints the error and exits. Fix the issue and re-run — it's idempotent.

---

## Step 4 — Create the Vulnerable Demo Repository

The swarm needs a real GitHub repo to scan. We've included intentionally vulnerable code for testing.

### 4a. Create the repository

```bash
# Create a new public repo on GitHub
gh repo create agent-studio-vulnerable-demo --public --description "Intentionally vulnerable demo for DevOps Swarm testing"

# Initialize it
cd /tmp
mkdir agent-studio-vulnerable-demo
cd agent-studio-vulnerable-demo
git init
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/agent-studio-vulnerable-demo.git
```

### 4b. Copy the vulnerable demo files

From your `agent-studio` repository:

```bash
cp -r agent-studio/scripts/create-vulnerable-demo/* /tmp/agent-studio-vulnerable-demo/

cd /tmp/agent-studio-vulnerable-demo
git add .
git commit -m "feat: initial vulnerable demo (for DevOps Swarm testing)"
git push -u origin main
```

### 4c. What's in the demo

The vulnerable demo contains intentional security issues across 4 files:

| File | Vulnerabilities | CWE |
|------|----------------|-----|
| `src/auth.ts` | SQL injection via string interpolation (3 instances) | CWE-89 |
| `src/api.ts` | SSRF (unvalidated fetch) + XSS (innerHTML) | CWE-918, CWE-79 |
| `src/upload.ts` | Path traversal + weak random (Math.random) | CWE-22, CWE-338 |
| `src/config.ts` | Hardcoded secrets (Stripe, OpenAI, AWS) | CWE-798 |

And vulnerable npm dependencies:
- `lodash@4.17.20` — Prototype pollution (CRITICAL)
- `axios@0.21.1` — SSRF (HIGH)
- `node-fetch@2.6.7` — Exposure to ReDoS (MEDIUM)
- `jsonwebtoken@8.5.1` — Algorithm confusion (HIGH)

---

## Step 5 — Test the Swarm

### 5a. Open the Orchestrator chat

Navigate to: [Agent Studio → Chat with Swarm Orchestrator](https://agent-studio-production-c43e.up.railway.app)

Or use the direct URL printed by the setup script.

### 5b. Trigger the swarm

Send this message in the chat:

```
Scan this repository for security vulnerabilities and create a fix PR:
https://github.com/YOUR_USERNAME/agent-studio-vulnerable-demo
```

### 5c. Watch the pipeline execute

The chat will stream real-time progress:

```
🛡️ Starting Autonomous DevOps Swarm Pipeline...
📋 Input validation passed
💰 Budget check: $5.00 limit active
🌐 Repository accessible: agent-studio-vulnerable-demo
🔍 Launching parallel security scans...
  ├── 📦 npm audit: scanning 4 dependencies...
  └── 🔬 semgrep: scanning TypeScript files...
📊 Aggregated: 8 findings (4 dependency + 4 code)
🤖 A2A → Security Analyst: analyzing findings...
  → 3 CRITICAL, 3 HIGH, 2 MEDIUM findings ranked
🔧 A2A → Patch Engineer: generating fixes...
  → Reading src/auth.ts, src/api.ts, src/upload.ts, src/config.ts
  → 4 patches generated
🧪 A2A → Test Validator: validating patches...
  → 7/7 checks passed ✅
🌿 Branch created: security/swarm-fix-1711234567
📝 Committed 4 patches
⬆️ Pushed to GitHub
```

### 5d. Approve the PR

The pipeline pauses at the human approval gate:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  🚨 HUMAN APPROVAL REQUIRED

  Ready to create a security fix PR on:
  https://github.com/YOUR_USERNAME/agent-studio-vulnerable-demo

  Branch: security/swarm-fix-1711234567
  Patches: 4 files modified
  Findings fixed: 3 CRITICAL, 3 HIGH

  This is your final review before the PR is created.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Click **Approve** (or **Reject** to cancel without creating the PR).

### 5e. Verify the PR

After approval, check your GitHub repository for the new PR. It should contain:
- Descriptive PR title: `security: automated vulnerability fixes via DevOps Swarm`
- Full PR body with findings table, patches applied, and compliance notes
- Diff showing exactly the patched lines

---

## Troubleshooting

### Script fails at "Creating MCP servers"

**Cause:** Invalid session cookie.

**Fix:** Get a fresh session cookie — cookies expire after 24 hours. Log out and log back in to Agent Studio.

---

### security-scanner-mcp returns 500 on audit_dependencies

**Cause:** Node.js not installed in the service container.

**Fix:** The Dockerfile installs Node.js and npm. If you used Nixpacks without the Dockerfile, ensure `nodejs` is in the nixpacks config.

```bash
# Verify on Railway by checking build logs for:
# "Successfully installed nodejs"
```

---

### gh-bridge-mcp returns "GITHUB_TOKEN not set"

**Cause:** Environment variable missing in Railway.

**Fix:** Go to Railway → your gh-bridge-mcp service → Variables → Add `GITHUB_TOKEN`.

---

### Swarm Orchestrator says "Repository not accessible"

**Cause:** The repo is private and `GITHUB_TOKEN` doesn't have access, or the URL is wrong.

**Fix:** Ensure the repo is public, or add the token to gh-bridge and verify it has `repo` scope.

---

### human_approval times out (after 30 min)

**Cause:** No response given to the approval request.

**Fix:** This is expected behavior. The swarm will report: "Pipeline cancelled — no approval received." Simply start a new scan.

---

### "Budget exceeded" error

**Cause:** The `cost_monitor` node detected spend over $5.

**Fix:** Wait for the daily budget reset, or ask your Agent Studio admin to increase the limit. You can also edit the Orchestrator flow in the Flow Builder to raise the `budget_limit` value.

---

## Configuration Reference

### Orchestrator Flow Variables

You can customize these in the Flow Builder → Properties panel on the `cost_monitor` node:

| Variable | Default | Description |
|----------|---------|-------------|
| `budget_limit` | `5.00` | Max spend per pipeline run (USD) |
| `budget_currency` | `USD` | Currency for budget |
| `max_findings` | `10` | Max findings passed to Security Analyst |
| `approval_timeout` | `1800` | Human approval timeout (seconds) |
| `pr_draft` | `false` | Create PRs as drafts |

### Security Analyst Configuration

In the Security Analyst agent's system prompt, you can adjust:

- `CVSS_MINIMUM`: Minimum CVSS score to include (default: 4.0 — ignore LOW)
- `MAX_FINDINGS_OUTPUT`: Cap on findings in report (default: 10)

### Patch Engineer Configuration

- Only patches `CRITICAL` and `HIGH` findings by default
- To include `MEDIUM` findings, edit the system prompt condition

---

## Architecture Decisions

**Why Python for MCP servers?**
Python FastMCP provides the cleanest MCP 2025-11-25 implementation. The `semgrep` CLI and `npm` tools also have best-in-class Python integration.

**Why static analysis instead of running tests?**
The Railway sandbox doesn't support spawning arbitrary test processes. Static analysis of patch validity is sufficient for the 7 checks implemented and avoids sandbox escape risks.

**Why is Security Analyst on Opus?**
CVSS v3.1 scoring with accurate CWE mapping requires complex multi-factor reasoning. Opus provides significantly better accuracy on security classification tasks than Sonnet or Haiku.

**Why a human approval gate?**
Code pushed to GitHub is irreversible in practice (even with rollback, the commit history remains). Any AI system that pushes code without human review violates EU AI Act Article 9 requirements for high-risk automated decisions.

---

## Related Documentation

- [ARCHITECTURE.md](./ARCHITECTURE.md) — System design and data flow
- [Node Reference](../10-node-reference.md) — All 55 flow node types
- [Agent Evals Guide](../13-agent-evals.md) — Testing agent pipelines
