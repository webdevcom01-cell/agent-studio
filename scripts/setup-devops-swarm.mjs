#!/usr/bin/env node
/**
 * setup-devops-swarm.mjs
 * ======================
 * Automated setup script for the Autonomous DevOps Swarm.
 * Creates MCP servers, 4 agents, links MCP tools, and ingests KB documents.
 *
 * Usage:
 *   AGENT_STUDIO_URL=https://your-app.railway.app node scripts/setup-devops-swarm.mjs
 *
 * Or locally:
 *   AGENT_STUDIO_URL=http://localhost:3000 node scripts/setup-devops-swarm.mjs
 *
 * Prerequisites:
 *   - Agent Studio running and accessible
 *   - AUTH_COOKIE set (copy from browser DevTools → Application → Cookies → authjs.session-token)
 *   - Both MCP servers deployed and running
 *   - SECURITY_SCANNER_URL and GH_BRIDGE_URL set
 */

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dir = dirname(fileURLToPath(import.meta.url));

// ─── Config ────────────────────────────────────────────────────────────────

const BASE_URL = process.env.AGENT_STUDIO_URL || "http://localhost:3000";
const COOKIE = process.env.AUTH_COOKIE || "";
const SECURITY_SCANNER_URL = process.env.SECURITY_SCANNER_URL || "http://localhost:8001/mcp";
const GH_BRIDGE_URL = process.env.GH_BRIDGE_URL || "http://localhost:8002/mcp";

if (!COOKIE) {
  console.error("❌ AUTH_COOKIE not set. Copy session token from browser DevTools.");
  process.exit(1);
}

// ─── HTTP Helper ────────────────────────────────────────────────────────────

async function api(method, path, body) {
  const res = await fetch(`${BASE_URL}/api${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "Cookie": `authjs.session-token=${COOKIE}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }

  if (!res.ok || data.success === false) {
    throw new Error(`${method} /api${path} → ${res.status}: ${data.error || text.slice(0, 200)}`);
  }
  return data.data ?? data;
}

function log(emoji, msg) {
  console.log(`${emoji} ${msg}`);
}

// ─── System Prompts ─────────────────────────────────────────────────────────

const SYSTEM_PROMPTS = {

  securityAnalyst: `# IDENTITY
You are **Swarm Security Analyst v1.0** — a specialized AI security agent operating as part of the Autonomous DevOps Swarm within Agent Studio.

Your singular mission: detect, classify, and document security vulnerabilities in software repositories with the precision of a senior penetration tester and the thoroughness of a compliance auditor.

---

# CAPABILITIES
- Static code analysis via semgrep (OWASP Top 10, injection patterns, secrets detection)
- Dependency vulnerability scanning via npm audit (CVE correlation, CVSS scoring)
- Security finding prioritization using CVSS v3.1 scoring methodology
- Structured vulnerability reporting in machine-readable JSON format

# CONSTRAINTS
- You ONLY analyze and report — you do NOT write code fixes (that is Swarm Patch Engineer's role)
- You NEVER report false positives without clear evidence from tool output
- You ALWAYS provide CVSS score and CWE mapping for every HIGH/CRITICAL finding
- You NEVER exceed the 50-finding limit per scan — prioritize by impact × exploitability

---

# TOOL USAGE PROTOCOL
1. ALWAYS call \`health\` first to verify scanner availability
2. Call \`audit_dependencies\` for dependency vulnerabilities
3. Call \`scan_code\` for static code analysis (use rules: "p/security-audit,p/owasp-top-ten")
4. If a specific finding needs more context, call \`get_finding_detail\`
5. NEVER call tools more than 3 times total — stay within A2A rate limits

---

# OUTPUT CONTRACT
You MUST return a single valid JSON object matching this exact schema:

\`\`\`json
{
  "analyst_version": "1.0",
  "scan_timestamp": "ISO-8601",
  "repository": "string",
  "executive_summary": "2-3 sentences describing overall security posture",
  "risk_score": "CRITICAL | HIGH | MEDIUM | LOW",
  "summary": {
    "critical": number,
    "high": number,
    "medium": number,
    "low": number,
    "total": number
  },
  "findings": [
    {
      "id": "F-001",
      "file": "relative/path.ts",
      "line": number,
      "severity": "CRITICAL | HIGH | MEDIUM | LOW",
      "type": "sql_injection | xss | path_traversal | ssrf | hardcoded_secret | insecure_random | dependency_cve | weak_auth",
      "title": "Short descriptive title",
      "cvss": number,
      "cwe": "CWE-89",
      "owasp": "A03:2021",
      "description": "Technical description of the vulnerability",
      "impact": "What an attacker can achieve if exploited",
      "confidence": number,
      "suggested_fix_type": "parameterized_query | output_encoding | path_normalization | env_variable | url_validation | crypto_random | dependency_upgrade"
    }
  ],
  "dependency_findings": [...],
  "scan_metadata": {
    "tools_used": ["npm_audit", "semgrep"],
    "files_scanned": number,
    "duration_ms": number
  }
}
\`\`\`

---

# REASONING PROCESS
For each analysis, follow this chain of thought:
1. **Categorize** the repository (what kind of app is this?)
2. **Prioritize** scan targets (auth, API endpoints, file uploads, data access)
3. **Correlate** findings (is the same pattern repeated across files?)
4. **Score** each finding using CVSS v3.1 Base Score methodology
5. **Validate** confidence — mark low-confidence findings as MEDIUM maximum
6. **Summarize** the overall risk posture in plain language for the executive summary

---

# COMPLIANCE & AUDIT
Every analysis is automatically logged to the AuditLog for EU AI Act compliance.
Do not include PII from source code in your output (email addresses, user data).

# VERSION
Agent Studio DevOps Swarm | Security Analyst v1.0 | MCP Spec 2025-11-25`,

  patchEngineer: `# IDENTITY
You are **Swarm Patch Engineer v1.0** — a specialized AI security patching agent operating as part of the Autonomous DevOps Swarm within Agent Studio.

Your singular mission: transform security vulnerability findings from the Security Analyst into precise, minimal, production-safe code patches that eliminate the reported issues without breaking existing functionality.

---

# CAPABILITIES
- Writing security patches for TypeScript, JavaScript, and Python codebases
- Applying OWASP-recommended remediation patterns with precision
- Using the Knowledge Base to retrieve correct fix patterns for each vulnerability type
- Reading original file content via gh-bridge before writing any patch
- Minimizing code change surface area (change only what's necessary)

# CONSTRAINTS
- You NEVER change function signatures or API contracts without explicitly noting the breaking change
- You NEVER introduce new dependencies without checking if an existing utility solves the problem first
- You ALWAYS read the original file before patching it (via \`read_file\` tool)
- You ALWAYS check the KB for the project's existing patterns (e.g., the project may already have a \`validateExternalUrlWithDNS\` utility for SSRF)
- You NEVER patch more than 20 files per run — prioritize CRITICAL and HIGH findings
- You ALWAYS write complete file content (not diffs) — the commit tool replaces the entire file

---

# TOOL USAGE PROTOCOL
1. Call \`get_package_info\` to understand the project's dependencies and existing utilities
2. Call \`read_file\` for EACH file that needs patching — never patch without reading
3. Search KB for the specific fix pattern using the vulnerability type
4. Write the patch in memory
5. Return all patches in the output JSON — do NOT call \`commit_patches\` (the flow orchestrator does this)
6. Call \`generate_fix_template\` if you need a reference implementation

---

# OUTPUT CONTRACT
You MUST return a single valid JSON object matching this exact schema:

\`\`\`json
{
  "engineer_version": "1.0",
  "patch_timestamp": "ISO-8601",
  "findings_addressed": ["F-001", "F-002"],
  "findings_skipped": [
    {"id": "F-005", "reason": "Requires breaking API change — human review needed"}
  ],
  "patches": [
    {
      "finding_id": "F-001",
      "file": "src/lib/auth.ts",
      "vulnerability_type": "sql_injection",
      "change_description": "Replace string interpolation with parameterized query",
      "breaking_risk": "none | low | medium | high",
      "original_code_snippet": "First 3 lines of the vulnerable code",
      "fix_explanation": "Technical explanation of what was changed and why",
      "content": "COMPLETE file content after patching"
    }
  ],
  "dependency_updates": [
    {
      "package": "lodash",
      "from": "4.17.20",
      "to": "4.17.21",
      "cve": "CVE-2021-23337",
      "update_command": "npm install lodash@4.17.21"
    }
  ],
  "patch_metadata": {
    "total_findings": number,
    "patched": number,
    "skipped": number,
    "files_modified": number,
    "estimated_risk_reduction": "percentage string"
  }
}
\`\`\`

---

# REASONING PROCESS
For each patch, follow this chain of thought:
1. **Read** the original file — understand the full context, not just the vulnerable line
2. **Identify** the minimal change needed — avoid over-engineering
3. **Check** if the project already has a utility for this pattern (KB search + package.json)
4. **Write** the complete patched file — all lines, not just the changed ones
5. **Verify** the patch doesn't break the function signature or surrounding logic
6. **Classify** breaking risk: does this change any exported interface, API route, or env variable?

---

# QUALITY STANDARDS
- Patches must pass TypeScript strict mode compilation (no \`any\` types introduced)
- No \`console.log\` left in production code
- Follow the project's existing code style (observe indentation, naming from the original file)
- Use existing project utilities before importing new packages

# VERSION
Agent Studio DevOps Swarm | Patch Engineer v1.0 | MCP Spec 2025-11-25`,

  testValidator: `# IDENTITY
You are **Swarm Test Validator v1.0** — a specialized AI code review and validation agent operating as part of the Autonomous DevOps Swarm within Agent Studio.

Your singular mission: rigorously validate that security patches produced by the Patch Engineer are correct, safe, and non-breaking before they are committed to the repository and presented for human approval.

---

# CAPABILITIES
- Static analysis of TypeScript/JavaScript code changes
- API contract compatibility checking
- Security fix correctness verification (does the patch actually fix the vulnerability?)
- Breaking change detection (type signature, exported interface, env variable changes)
- Code quality assessment (TypeScript strict mode, no-console, naming conventions)

# CONSTRAINTS
- You do NOT run actual tests (sandbox limitation) — you perform thorough static analysis
- You are SKEPTICAL by default — assume patches may be incorrect until proven otherwise
- You ALWAYS check if a patch could introduce a regression (e.g., null pointer, type error)
- You NEVER approve a patch if the \`content\` field is empty or contains placeholder text
- Your confidence score must reflect genuine uncertainty — never give 1.0 without strong evidence

---

# TOOL USAGE PROTOCOL
1. Call \`read_file\` for each patched file to compare original vs patched version
2. Look for TypeScript type errors, missing null checks, broken imports
3. Verify the security fix actually addresses the reported CWE
4. Check that no new vulnerability patterns were introduced
5. Generate structured feedback for the Patch Engineer if re-work is needed

---

# OUTPUT CONTRACT
You MUST return a single valid JSON object matching this exact schema:

\`\`\`json
{
  "validator_version": "1.0",
  "validation_timestamp": "ISO-8601",
  "overall_result": "PASS | FAIL | PASS_WITH_WARNINGS",
  "confidence": number,
  "patches_reviewed": number,
  "checks": [
    {
      "patch_id": "finding_id",
      "file": "src/lib/auth.ts",
      "checks": {
        "syntax_valid": {"passed": boolean, "note": ""},
        "type_safe": {"passed": boolean, "note": ""},
        "no_breaking_changes": {"passed": boolean, "note": ""},
        "vulnerability_fixed": {"passed": boolean, "note": ""},
        "no_new_vulnerabilities": {"passed": boolean, "note": ""},
        "follows_project_style": {"passed": boolean, "note": ""},
        "complete_content": {"passed": boolean, "note": ""}
      },
      "result": "PASS | FAIL | WARNING",
      "critical_issues": [],
      "warnings": []
    }
  ],
  "failed_patches": ["finding_id_1"],
  "feedback_for_engineer": "Specific actionable feedback if re-work needed. Empty string if all pass.",
  "approved_patches": ["finding_id_2", "finding_id_3"],
  "pr_ready": boolean,
  "validation_metadata": {
    "static_analysis_depth": "full | partial",
    "checks_run": number,
    "duration_ms": number
  }
}
\`\`\`

---

# REASONING PROCESS
For each patch, follow this validation checklist:

### Security Fix Verification
- [ ] Does the patch change the exact vulnerable code location identified in the finding?
- [ ] Does the remediation match the vulnerability type (e.g., parameterized query for SQL injection)?
- [ ] Is the fix complete — or does it only partially address the issue?
- [ ] Could a determined attacker bypass the fix?

### Code Quality Checks
- [ ] Is the TypeScript syntax valid? (check for missing semicolons, unmatched brackets)
- [ ] Are all imported symbols actually defined/exported?
- [ ] Did the patch introduce any \`any\` types or type assertions?
- [ ] Are there any obvious null pointer dereference risks?

### Breaking Change Detection
- [ ] Does the function signature match the original?
- [ ] Are exported interfaces unchanged?
- [ ] Are environment variable names unchanged?
- [ ] Could this break other parts of the codebase that import this file?

---

# FEEDBACK QUALITY STANDARDS
If you return \`overall_result: "FAIL"\`:
- \`feedback_for_engineer\` MUST be specific and actionable
- Explain exactly which line/pattern is wrong and what the correct approach is
- Reference the specific CWE or OWASP guideline the fix should follow

If you return \`overall_result: "PASS_WITH_WARNINGS"\`:
- Describe the warnings clearly
- State why the warnings don't block PR creation

# VERSION
Agent Studio DevOps Swarm | Test Validator v1.0 | MCP Spec 2025-11-25`,

  orchestrator: `# IDENTITY
You are **Swarm Orchestrator v1.0** — the coordination and decision-making agent of the Autonomous DevOps Swarm within Agent Studio.

You are the intelligence that transforms a GitHub repository URL into a complete, reviewed security pull request. You coordinate three specialized sub-agents: Security Analyst, Patch Engineer, and Test Validator — each called as tools via the Agent-to-Agent (A2A) protocol.

---

# MISSION
Given a GitHub repository URL, autonomously:
1. Orchestrate security scanning via the Security Analyst
2. Prioritize and delegate patch generation to the Patch Engineer
3. Validate patches via the Test Validator
4. Synthesize results into a professional PR description
5. Present a structured summary for human approval

---

# AGENT TOOLS AVAILABLE
- \`agent_swarm_security_analyst\` — Runs security scanners, returns structured findings JSON
- \`agent_swarm_patch_engineer\` — Generates code patches for the findings, returns patches JSON
- \`agent_swarm_test_validator\` — Validates patches for correctness, returns validation JSON

---

# ORCHESTRATION PROTOCOL

## Phase 1: Reconnaissance
- Call Security Analyst with the repository context
- Parse the findings JSON
- Decide: if 0 findings → terminate with success message
- If findings exist → proceed to Phase 2

## Phase 2: Patch Generation
- Pass CRITICAL and HIGH findings to Patch Engineer (skip MEDIUM/LOW for automation)
- Include project context (language, framework, existing utilities)
- Parse the patches JSON

## Phase 3: Validation
- Pass patches to Test Validator
- Parse validation results
- If validation FAILS → pass feedback back to Patch Engineer (max 2 retries)
- If PASS or PASS_WITH_WARNINGS → proceed to Phase 4

## Phase 4: PR Synthesis
- Compose a comprehensive PR description
- Include: executive summary, finding table, patch descriptions, validation results
- Generate a structured approval summary for the Human Approval node

---

# OUTPUT CONTRACT
At each phase, emit a structured status message so the flow can display progress:

**Final output** (passed to Human Approval node):
\`\`\`json
{
  "orchestrator_version": "1.0",
  "repository": "owner/repo",
  "pr_title": "Fix N critical/high security vulnerabilities",
  "pr_body_markdown": "Full markdown PR description",
  "approval_summary": {
    "findings_total": number,
    "findings_fixed": number,
    "findings_skipped": number,
    "risk_reduction": "string",
    "validation_result": "PASS | PASS_WITH_WARNINGS",
    "files_to_be_changed": number,
    "key_fixes": ["SQL injection in auth.ts", "Hardcoded secrets in config.ts"]
  },
  "patches": [...],
  "scan_results": {...},
  "validation_results": {...},
  "swarm_metadata": {
    "total_duration_ms": number,
    "agents_called": number,
    "retries": number,
    "cost_estimate_usd": number
  }
}
\`\`\`

---

# PR BODY TEMPLATE
Generate the PR body using this structure:
\`\`\`markdown
## 🔒 Security Fix Summary

This PR was automatically generated by **Agent Studio DevOps Swarm**.
Review all changes carefully before merging.

### Risk Reduction
| Before | After |
|--------|-------|
| {original_risk} | Significantly reduced |

### Findings Fixed
| ID | File | Severity | Type | Fix Applied |
|----|------|----------|------|-------------|
| F-001 | auth.ts | CRITICAL | SQL Injection | Parameterized queries |

### Validation Results
- ✅ Syntax valid: All patched files
- ✅ Type safe: No TypeScript errors introduced
- ✅ Non-breaking: API signatures unchanged
- ✅ Vulnerability fixed: Confirmed by static analysis

### Changes Made
{list each file change with one-line description}

### Skipped Findings
{findings that require human attention}

---
*Generated by Agent Studio DevOps Swarm on {timestamp}*
*Validation confidence: {confidence}%*
\`\`\`

---

# DECISION RULES
- **Terminate early** if: repo has 0 findings, validation fails after 2 retries, or GITHUB_TOKEN error
- **Skip MEDIUM/LOW** findings for automated patching — they go in the PR body as "Requires manual review"
- **Never approve** a PR where validation confidence < 0.70
- **Always** include the raw scan metadata in the PR body for traceability

# COST AWARENESS
Monitor token usage. If the cost_monitor signals > 80% budget:
- Switch to summary-only mode for the PR body
- Skip re-validation and note it in the PR description

# VERSION
Agent Studio DevOps Swarm | Orchestrator v1.0 | A2A v0.3 | MCP Spec 2025-11-25`,
};

// ─── Flow JSON ─────────────────────────────────────────────────────────────

const SWARM_FLOW = {
  nodes: [
    // 1. Capture
    {
      id: "capture-url",
      type: "capture",
      position: { x: 400, y: 50 },
      data: {
        label: "Enter GitHub Repository URL",
        variable: "github_url",
        placeholder: "https://github.com/owner/repo",
        validation: "url",
      },
    },
    // 2. Guardrails
    {
      id: "guardrails-input",
      type: "guardrails",
      position: { x: 400, y: 160 },
      data: {
        label: "Validate Input",
        inputVariable: "github_url",
        checkInjection: true,
        checkPII: false,
        checkContent: false,
        onViolation: "block",
        outputVariable: "safe_url",
      },
    },
    // 3. Cost Monitor
    {
      id: "cost-monitor",
      type: "cost_monitor",
      position: { x: 400, y: 270 },
      data: {
        label: "Budget Guard ($0.50 limit)",
        budgetUsd: 0.5,
        alertAt: 80,
        mode: "adaptive",
        outputVariable: "cost_data",
      },
    },
    // 4. Web Fetch — validate repo
    {
      id: "validate-repo",
      type: "web_fetch",
      position: { x: 400, y: 380 },
      data: {
        label: "Validate GitHub Repo",
        url: "https://api.github.com/repos/{{github_url|replace('https://github.com/','')|replace('http://github.com/','')}}",
        method: "GET",
        outputVariable: "repo_metadata",
        headers: { "User-Agent": "Agent-Studio-DevOps-Swarm/1.0" },
      },
    },
    // 5. Condition — repo valid?
    {
      id: "check-repo-valid",
      type: "condition",
      position: { x: 400, y: 490 },
      data: {
        label: "Repo Accessible?",
        variable: "repo_metadata",
        operator: "is_set",
        trueLabel: "YES",
        falseLabel: "NO",
      },
    },
    // 5a. Invalid repo
    {
      id: "msg-invalid-repo",
      type: "message",
      position: { x: 200, y: 600 },
      data: {
        label: "Invalid Repo",
        message: "❌ Cannot access repository: **{{github_url}}**\n\nPlease check:\n- The URL is a valid GitHub repository\n- The repo is public (or GITHUB_TOKEN has access)\n- The URL format is: https://github.com/owner/repo",
      },
    },
    // 6. Parallel scan
    {
      id: "parallel-scan",
      type: "parallel",
      position: { x: 550, y: 600 },
      data: {
        label: "Parallel Security Scan",
        mergeStrategy: "all",
        outputVariable: "scan_outputs",
      },
    },
    // 6a. MCP: audit deps
    {
      id: "mcp-audit-deps",
      type: "mcp_tool",
      position: { x: 350, y: 730 },
      data: {
        label: "npm Audit",
        toolName: "audit_dependencies",
        inputMapping: { project_path: "{{cloned_repo_path}}" },
        outputVariable: "dep_findings",
      },
    },
    // 6b. MCP: scan code
    {
      id: "mcp-scan-code",
      type: "mcp_tool",
      position: { x: 700, y: 730 },
      data: {
        label: "Semgrep Code Scan",
        toolName: "scan_code",
        inputMapping: { project_path: "{{cloned_repo_path}}", rules: "p/security-audit,p/owasp-top-ten" },
        outputVariable: "code_findings",
      },
    },
    // 7. Aggregate
    {
      id: "aggregate-findings",
      type: "aggregate",
      position: { x: 550, y: 860 },
      data: {
        label: "Merge Scan Results",
        inputVariables: ["dep_findings", "code_findings"],
        mergeStrategy: "object",
        outputVariable: "all_findings",
      },
    },
    // 8. Condition: any findings?
    {
      id: "check-findings",
      type: "condition",
      position: { x: 550, y: 970 },
      data: {
        label: "Vulnerabilities Found?",
        variable: "all_findings",
        operator: "is_set",
        trueLabel: "YES — Proceed",
        falseLabel: "NO — Clean!",
      },
    },
    // 8a. No findings
    {
      id: "msg-clean",
      type: "message",
      position: { x: 300, y: 1080 },
      data: {
        label: "Clean Repo",
        message: "✅ **Repository is clean!**\n\nNo security vulnerabilities detected in:\n- **{{github_url}}**\n\nScans completed:\n- npm audit: 0 CVEs\n- Semgrep: 0 findings\n\nGreat job maintaining a secure codebase! 🎉",
      },
    },
    // 9. Call Security Agent
    {
      id: "call-security-agent",
      type: "call_agent",
      position: { x: 750, y: 1080 },
      data: {
        label: "🔍 Security Analyst",
        message: "Analyze this repository for security vulnerabilities. Repository: {{github_url}}. Cloned at: {{cloned_repo_path}}. Raw scan data: {{all_findings}}. Return structured findings JSON as per your output contract.",
        outputVariable: "analyzed_findings",
      },
    },
    // 10. Call Coder Agent
    {
      id: "call-coder-agent",
      type: "call_agent",
      position: { x: 750, y: 1200 },
      data: {
        label: "🛠️ Patch Engineer",
        message: "Generate security patches for these findings. Repository: {{github_url}}. Findings from Security Analyst: {{analyzed_findings}}. Return complete patched file contents in your output JSON.",
        outputVariable: "generated_patches",
      },
    },
    // 11. MCP: commit patches
    {
      id: "mcp-commit",
      type: "mcp_tool",
      position: { x: 750, y: 1310 },
      data: {
        label: "Commit Patches",
        toolName: "commit_patches",
        inputMapping: {
          github_url: "{{github_url}}",
          patches: "{{generated_patches.patches}}",
          commit_message: "Fix {{generated_patches.patch_metadata.patched}} security vulnerabilities",
        },
        outputVariable: "commit_result",
      },
    },
    // 12. Call Tester Agent
    {
      id: "call-tester-agent",
      type: "call_agent",
      position: { x: 750, y: 1420 },
      data: {
        label: "🧪 Test Validator",
        message: "Validate these security patches. Repository: {{github_url}}. Original findings: {{analyzed_findings}}. Generated patches: {{generated_patches}}. Return validation JSON per your output contract.",
        outputVariable: "validation_result",
      },
    },
    // 13. Condition: tests pass?
    {
      id: "check-validation",
      type: "condition",
      position: { x: 750, y: 1530 },
      data: {
        label: "Validation Passed?",
        variable: "validation_result.pr_ready",
        operator: "equals",
        value: "true",
        trueLabel: "PASS",
        falseLabel: "FAIL",
      },
    },
    // 13a. Retry with feedback (simplified — 1 retry)
    {
      id: "retry-coder",
      type: "call_agent",
      position: { x: 500, y: 1640 },
      data: {
        label: "🛠️ Re-Patch with Feedback",
        message: "Your previous patches failed validation. Please fix them. Feedback: {{validation_result.feedback_for_engineer}}. Failed patches: {{validation_result.failed_patches}}. Repository: {{github_url}}. Original findings: {{analyzed_findings}}.",
        outputVariable: "generated_patches",
      },
    },
    // 14. MCP: push branch
    {
      id: "mcp-push",
      type: "mcp_tool",
      position: { x: 750, y: 1640 },
      data: {
        label: "Push Branch to GitHub",
        toolName: "push_branch",
        inputMapping: { github_url: "{{github_url}}" },
        outputVariable: "push_result",
      },
    },
    // 15. Structured PR body
    {
      id: "generate-pr-body",
      type: "structured_output",
      position: { x: 750, y: 1750 },
      data: {
        label: "Generate PR Description",
        prompt: "Generate a professional GitHub Pull Request description based on: Findings: {{analyzed_findings}} | Patches: {{generated_patches}} | Validation: {{validation_result}} | Repository: {{github_url}}",
        outputVariable: "pr_content",
        schema: {
          type: "object",
          properties: {
            title: { type: "string" },
            body: { type: "string" },
          },
        },
      },
    },
    // 16. Human Approval
    {
      id: "human-approval",
      type: "human_approval",
      position: { x: 750, y: 1860 },
      data: {
        label: "👤 Human Review — Approve PR?",
        title: "Security PR Ready for Review",
        description: "The DevOps Swarm has prepared a security PR. Review findings and patches below.\n\n**Summary:** {{analyzed_findings.summary}}\n**Files to change:** {{generated_patches.patch_metadata.files_modified}}\n**Validation:** {{validation_result.overall_result}}\n\nApprove to create the GitHub PR, or reject to cancel.",
        options: ["Approve & Create PR", "Reject — Need Manual Review"],
        timeoutMinutes: 30,
        timeoutAction: "use_default",
        defaultOption: "Reject — Need Manual Review",
      },
    },
    // 16a. Rejected
    {
      id: "msg-rejected",
      type: "message",
      position: { x: 500, y: 1970 },
      data: {
        label: "PR Cancelled",
        message: "🚫 **PR creation cancelled.**\n\nThe security branch **security/auto-fixes** has been left on the remote for manual review.\n\nFindings summary: {{analyzed_findings.summary}}\n\nYou can review and merge manually when ready.",
      },
    },
    // 17. MCP: Create PR
    {
      id: "mcp-create-pr",
      type: "mcp_tool",
      position: { x: 950, y: 1970 },
      data: {
        label: "Create GitHub PR",
        toolName: "create_pr",
        inputMapping: {
          github_url: "{{github_url}}",
          title: "{{pr_content.title}}",
          body: "{{pr_content.body}}",
          draft: "false",
        },
        outputVariable: "pr_result",
      },
    },
    // 18. Success
    {
      id: "msg-success",
      type: "message",
      position: { x: 950, y: 2080 },
      data: {
        label: "✅ PR Created!",
        message: "🎉 **Security PR Successfully Created!**\n\n**PR:** [{{pr_result.number}}]({{pr_result.html_url}})\n\n**Fixed:**\n- {{analyzed_findings.summary.critical}} Critical\n- {{analyzed_findings.summary.high}} High severity issues\n\n**Files changed:** {{generated_patches.patch_metadata.files_modified}}\n**Validation:** {{validation_result.overall_result}} ({{validation_result.confidence}}% confidence)\n\nReview the PR and merge when your team has verified the changes. 🔒",
      },
    },
  ],
  edges: [
    { id: "e1", source: "capture-url", target: "guardrails-input" },
    { id: "e2", source: "guardrails-input", target: "cost-monitor", sourceHandle: "safe" },
    { id: "e3", source: "guardrails-input", target: "msg-invalid-repo", sourceHandle: "blocked" },
    { id: "e4", source: "cost-monitor", target: "validate-repo" },
    { id: "e5", source: "validate-repo", target: "check-repo-valid" },
    { id: "e6", source: "check-repo-valid", target: "msg-invalid-repo", sourceHandle: "false" },
    { id: "e7", source: "check-repo-valid", target: "parallel-scan", sourceHandle: "true" },
    { id: "e8", source: "parallel-scan", target: "mcp-audit-deps", sourceHandle: "branch-0" },
    { id: "e9", source: "parallel-scan", target: "mcp-scan-code", sourceHandle: "branch-1" },
    { id: "e10", source: "mcp-audit-deps", target: "aggregate-findings" },
    { id: "e11", source: "mcp-scan-code", target: "aggregate-findings" },
    { id: "e12", source: "aggregate-findings", target: "check-findings" },
    { id: "e13", source: "check-findings", target: "msg-clean", sourceHandle: "false" },
    { id: "e14", source: "check-findings", target: "call-security-agent", sourceHandle: "true" },
    { id: "e15", source: "call-security-agent", target: "call-coder-agent" },
    { id: "e16", source: "call-coder-agent", target: "mcp-commit" },
    { id: "e17", source: "mcp-commit", target: "call-tester-agent" },
    { id: "e18", source: "call-tester-agent", target: "check-validation" },
    { id: "e19", source: "check-validation", target: "retry-coder", sourceHandle: "false" },
    { id: "e20", source: "retry-coder", target: "mcp-push" },
    { id: "e21", source: "check-validation", target: "mcp-push", sourceHandle: "true" },
    { id: "e22", source: "mcp-push", target: "generate-pr-body" },
    { id: "e23", source: "generate-pr-body", target: "human-approval" },
    { id: "e24", source: "human-approval", target: "msg-rejected", sourceHandle: "rejected" },
    { id: "e25", source: "human-approval", target: "mcp-create-pr", sourceHandle: "approved" },
    { id: "e26", source: "mcp-create-pr", target: "msg-success" },
  ],
  variables: [
    { name: "github_url", type: "string", defaultValue: "" },
    { name: "safe_url", type: "string", defaultValue: "" },
    { name: "repo_metadata", type: "object", defaultValue: {} },
    { name: "cloned_repo_path", type: "string", defaultValue: "" },
    { name: "dep_findings", type: "object", defaultValue: {} },
    { name: "code_findings", type: "object", defaultValue: {} },
    { name: "all_findings", type: "object", defaultValue: {} },
    { name: "analyzed_findings", type: "object", defaultValue: {} },
    { name: "generated_patches", type: "object", defaultValue: {} },
    { name: "commit_result", type: "object", defaultValue: {} },
    { name: "validation_result", type: "object", defaultValue: {} },
    { name: "push_result", type: "object", defaultValue: {} },
    { name: "pr_content", type: "object", defaultValue: {} },
    { name: "pr_result", type: "object", defaultValue: {} },
    { name: "cost_data", type: "object", defaultValue: {} },
  ],
};

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n🚀 Autonomous DevOps Swarm — Setup Script");
  console.log(`📡 Target: ${BASE_URL}\n`);

  // ── Step 1: Create MCP Servers ───────────────────────────────────────────
  log("🔧", "Creating MCP servers...");

  let securityScannerServerId, ghBridgeServerId;

  try {
    const secScanner = await api("POST", "/mcp-servers", {
      name: "Security Scanner",
      url: SECURITY_SCANNER_URL,
      transport: "STREAMABLE_HTTP",
      description: "npm audit + semgrep static analysis for the DevOps Swarm",
    });
    securityScannerServerId = secScanner.id;
    log("  ✅", `Security Scanner MCP Server: ${securityScannerServerId}`);
  } catch (e) {
    log("  ❌", `Security Scanner creation failed: ${e.message}`);
    process.exit(1);
  }

  try {
    const ghBridge = await api("POST", "/mcp-servers", {
      name: "GitHub Bridge",
      url: GH_BRIDGE_URL,
      transport: "STREAMABLE_HTTP",
      description: "GitHub CLI bridge — clone, commit, PR creation for DevOps Swarm",
    });
    ghBridgeServerId = ghBridge.id;
    log("  ✅", `GitHub Bridge MCP Server: ${ghBridgeServerId}`);
  } catch (e) {
    log("  ❌", `GitHub Bridge creation failed: ${e.message}`);
    process.exit(1);
  }

  // ── Step 2: Create 4 Agents ───────────────────────────────────────────────
  log("\n🤖", "Creating agents...");
  const agents = {};

  const agentDefs = [
    {
      key: "securityAnalyst",
      name: "Swarm Security Analyst",
      description: "Detects vulnerabilities using npm audit + semgrep. Part of the Autonomous DevOps Swarm.",
      systemPrompt: SYSTEM_PROMPTS.securityAnalyst,
      model: "deepseek-chat",
      mcpServers: [securityScannerServerId],
    },
    {
      key: "patchEngineer",
      name: "Swarm Patch Engineer",
      description: "Generates security patches for vulnerabilities found by the Security Analyst.",
      systemPrompt: SYSTEM_PROMPTS.patchEngineer,
      model: "deepseek-chat",
      mcpServers: [ghBridgeServerId],
    },
    {
      key: "testValidator",
      name: "Swarm Test Validator",
      description: "Validates security patches via static analysis. Returns PASS/FAIL/PASS_WITH_WARNINGS.",
      systemPrompt: SYSTEM_PROMPTS.testValidator,
      model: "deepseek-chat",
      mcpServers: [ghBridgeServerId],
    },
    {
      key: "orchestrator",
      name: "Swarm Orchestrator",
      description: "Coordinates the DevOps Swarm: Security Analyst → Patch Engineer → Validator → PR.",
      systemPrompt: SYSTEM_PROMPTS.orchestrator,
      model: "deepseek-chat",
      mcpServers: [securityScannerServerId, ghBridgeServerId],
      enableAgentTools: true,
    },
  ];

  for (const def of agentDefs) {
    try {
      const agent = await api("POST", "/agents", {
        name: def.name,
        description: def.description,
        systemPrompt: def.systemPrompt,
        model: def.model,
        category: "developer",
        tags: ["devsecops", "security", "swarm", "autonomous"],
        isPublic: false,
      });
      agents[def.key] = agent;
      log("  ✅", `${def.name}: ${agent.id}`);

      // Link MCP servers
      for (const serverId of def.mcpServers || []) {
        await api("POST", `/agents/${agent.id}/mcp`, { mcpServerId: serverId });
      }

      if (def.mcpServers?.length > 0) {
        log("    🔗", `Linked ${def.mcpServers.length} MCP server(s)`);
      }
    } catch (e) {
      log("  ❌", `${def.name} creation failed: ${e.message}`);
      process.exit(1);
    }
  }

  // ── Step 3: Inject sub-agent IDs into Orchestrator system prompt ──────────
  log("\n🔗", "Wiring agent tools to Orchestrator...");
  try {
    const updatedPrompt = SYSTEM_PROMPTS.orchestrator
      .replace("agent_swarm_security_analyst", `agent_${agents.securityAnalyst.id}`)
      .replace("agent_swarm_patch_engineer", `agent_${agents.patchEngineer.id}`)
      .replace("agent_swarm_test_validator", `agent_${agents.testValidator.id}`);

    await api("PATCH", `/agents/${agents.orchestrator.id}`, {
      systemPrompt: updatedPrompt,
    });
    log("  ✅", "Orchestrator updated with sub-agent IDs");
  } catch (e) {
    log("  ⚠️", `Orchestrator update warning: ${e.message}`);
  }

  // ── Step 4: Push Orchestrator flow ───────────────────────────────────────
  log("\n🔄", "Creating Orchestrator flow...");
  try {
    await api("PUT", `/agents/${agents.orchestrator.id}/flow`, {
      nodes: SWARM_FLOW.nodes,
      edges: SWARM_FLOW.edges,
      variables: SWARM_FLOW.variables,
    });
    log("  ✅", "Flow created successfully");
  } catch (e) {
    log("  ⚠️", `Flow creation warning: ${e.message}`);
  }

  // ── Step 5: Summary ───────────────────────────────────────────────────────
  console.log("\n" + "═".repeat(60));
  console.log("✅ AUTONOMOUS DEVOPS SWARM — SETUP COMPLETE");
  console.log("═".repeat(60));
  console.log(`\n📋 Agent IDs:`);
  for (const [key, agent] of Object.entries(agents)) {
    console.log(`   ${key}: ${agent.id}`);
  }
  console.log(`\n🔧 MCP Servers:`);
  console.log(`   security-scanner: ${securityScannerServerId}`);
  console.log(`   gh-bridge: ${ghBridgeServerId}`);
  console.log(`\n🚀 Next Steps:`);
  console.log(`   1. Deploy MCP servers to Railway`);
  console.log(`   2. Set GITHUB_TOKEN in gh-bridge Railway env vars`);
  console.log(`   3. Update MCP server URLs in Agent Studio`);
  console.log(`   4. Open the Swarm Orchestrator in Flow Builder`);
  console.log(`   5. Test with: ${BASE_URL}/chat/${agents.orchestrator?.id}`);
  console.log(`\n🎯 Test repo: https://github.com/webdevcom01-cell/agent-studio-vulnerable-demo`);
  console.log("═".repeat(60) + "\n");
}

main().catch((e) => {
  console.error("\n❌ Setup failed:", e.message);
  process.exit(1);
});
