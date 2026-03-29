"""
Security Scanner MCP Server
============================
Python FastMCP bridge that exposes npm audit and semgrep as structured MCP tools.
Part of the Autonomous DevOps Swarm — Agent Studio.

MCP Spec: 2025-11-25 (Streamable HTTP)
Transport: HTTP + SSE
Port: 8001
"""

import os
import json
import subprocess
import hashlib
import re
from pathlib import Path
from typing import Any

from mcp.server.fastmcp import FastMCP

# ─── Server Init ─────────────────────────────────────────────────────────────

mcp = FastMCP(
    "security-scanner",
    description="Autonomous security scanning: dependency audit (npm audit) + static code analysis (semgrep). Pre-processes all outputs to stay within MCP 10K character limit.",
    version="1.0.0",
)

# ─── Constants ────────────────────────────────────────────────────────────────

MAX_FINDINGS = 50          # Max findings returned per tool
MAX_CHARS = 9_000          # Leave buffer under 10K MCP limit
SEMGREP_TIMEOUT = 60       # seconds
SEMGREP_MAX_BYTES = 500_000  # 500KB per file


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _truncate(obj: Any, label: str) -> str:
    """Serialize JSON and warn if truncated."""
    s = json.dumps(obj, indent=2)
    if len(s) > MAX_CHARS:
        s = s[:MAX_CHARS] + f'\n\n[TRUNCATED — showing first {MAX_CHARS} chars of {len(s)} total. Use get_finding_detail for full data.]'
    return s


def _severity_rank(sev: str) -> int:
    return {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2, "LOW": 3, "INFO": 4}.get(sev.upper(), 5)


def _cvss_to_severity(score: float) -> str:
    if score >= 9.0: return "CRITICAL"
    if score >= 7.0: return "HIGH"
    if score >= 4.0: return "MEDIUM"
    return "LOW"


# ─── Tool: audit_dependencies ─────────────────────────────────────────────────

@mcp.tool()
def audit_dependencies(project_path: str) -> str:
    """
    Run npm audit on the project and return structured vulnerability findings.
    Pre-parses JSON output and limits to top 50 findings sorted by severity.
    Returns summary counts + findings array with CVE details.

    Args:
        project_path: Absolute path to the npm project directory (must contain package.json)

    Returns:
        JSON string with structure:
        {
          "summary": {"critical": N, "high": N, "medium": N, "low": N, "total": N},
          "findings": [{"id", "package", "severity", "title", "cvss", "cve", "url", "fix_available", "fix_command"}],
          "scan_metadata": {"path", "node_version", "npm_version", "duration_ms"}
        }
    """
    import time
    start = time.time()

    path = Path(project_path)
    if not path.exists():
        return json.dumps({"error": f"Path not found: {project_path}"})
    if not (path / "package.json").exists():
        return json.dumps({"error": "No package.json found. Not an npm project."})

    # Get npm/node version for metadata
    try:
        node_ver = subprocess.run(["node", "--version"], capture_output=True, text=True, timeout=5).stdout.strip()
        npm_ver = subprocess.run(["npm", "--version"], capture_output=True, text=True, timeout=5).stdout.strip()
    except Exception:
        node_ver = npm_ver = "unknown"

    # Run npm audit
    try:
        result = subprocess.run(
            ["npm", "audit", "--json"],
            cwd=str(path),
            capture_output=True,
            text=True,
            timeout=120,
        )
        raw = result.stdout or result.stderr
    except subprocess.TimeoutExpired:
        return json.dumps({"error": "npm audit timed out after 120s"})
    except FileNotFoundError:
        return json.dumps({"error": "npm not found. Install Node.js and npm."})

    # Parse JSON output
    try:
        audit_data = json.loads(raw)
    except json.JSONDecodeError:
        return json.dumps({"error": "Failed to parse npm audit output", "raw": raw[:500]})

    # Extract vulnerabilities (npm audit v7+ format)
    findings = []
    vulnerabilities = audit_data.get("vulnerabilities", {})
    for pkg_name, vuln in vulnerabilities.items():
        severity = vuln.get("severity", "UNKNOWN").upper()
        via = vuln.get("via", [])

        # via can be list of strings (transitive) or objects (direct)
        for source in via:
            if isinstance(source, dict):
                cvss = source.get("cvss", {})
                score = cvss.get("score", 0.0) if isinstance(cvss, dict) else 0.0
                findings.append({
                    "id": hashlib.md5(f"{pkg_name}{source.get('name', '')}".encode()).hexdigest()[:8],
                    "package": pkg_name,
                    "via_package": source.get("name", pkg_name),
                    "severity": severity,
                    "cvss": score,
                    "title": source.get("title", f"Vulnerability in {pkg_name}"),
                    "cve": source.get("cve", []),
                    "url": source.get("url", ""),
                    "fix_available": vuln.get("fixAvailable", False),
                    "fix_command": f"npm audit fix" if vuln.get("fixAvailable") else "Manual fix required",
                })

    # Sort by severity then CVSS
    findings.sort(key=lambda f: (_severity_rank(f["severity"]), -f["cvss"]))
    findings = findings[:MAX_FINDINGS]

    # Count by severity
    summary = {"critical": 0, "high": 0, "medium": 0, "low": 0, "total": len(findings)}
    for f in findings:
        sev_key = f["severity"].lower()
        if sev_key in summary:
            summary[sev_key] += 1

    result_obj = {
        "summary": summary,
        "findings": findings,
        "scan_metadata": {
            "path": project_path,
            "node_version": node_ver,
            "npm_version": npm_ver,
            "duration_ms": int((time.time() - start) * 1000),
            "findings_shown": len(findings),
            "findings_truncated": len(vulnerabilities) > MAX_FINDINGS,
        }
    }
    return _truncate(result_obj, "audit_dependencies")


# ─── Tool: scan_code ──────────────────────────────────────────────────────────

@mcp.tool()
def scan_code(project_path: str, rules: str = "p/security-audit,p/owasp-top-ten") -> str:
    """
    Run semgrep static analysis on the project codebase.
    Focuses on security patterns: OWASP Top 10, injection, auth issues, secrets.
    Pre-processes and limits output to top 50 findings by severity.

    Args:
        project_path: Absolute path to the project directory
        rules: Comma-separated semgrep rule configs (default: security + OWASP rules)

    Returns:
        JSON string with structure:
        {
          "summary": {"critical": N, "high": N, "medium": N, "low": N, "total": N},
          "findings": [{"id", "file", "line", "severity", "rule_id", "message", "code_snippet", "fix_suggestion"}],
          "scan_metadata": {"path", "rules", "files_scanned", "duration_ms", "semgrep_version"}
        }
    """
    import time
    start = time.time()

    path = Path(project_path)
    if not path.exists():
        return json.dumps({"error": f"Path not found: {project_path}"})

    # Check semgrep is available
    try:
        ver_result = subprocess.run(["semgrep", "--version"], capture_output=True, text=True, timeout=10)
        semgrep_version = ver_result.stdout.strip()
    except FileNotFoundError:
        return json.dumps({"error": "semgrep not found. Install: pip install semgrep"})

    # Build rule args
    rule_args = []
    for r in rules.split(","):
        rule_args += ["--config", r.strip()]

    # Run semgrep
    try:
        result = subprocess.run(
            [
                "semgrep",
                *rule_args,
                "--json",
                "--timeout", str(SEMGREP_TIMEOUT),
                "--max-target-bytes", str(SEMGREP_MAX_BYTES),
                "--no-git-ignore",
                "--exclude", "node_modules",
                "--exclude", ".git",
                "--exclude", "dist",
                "--exclude", "build",
                "--exclude", "*.min.js",
                str(path),
            ],
            capture_output=True,
            text=True,
            timeout=SEMGREP_TIMEOUT + 30,
        )
        raw = result.stdout or result.stderr
    except subprocess.TimeoutExpired:
        return json.dumps({"error": f"semgrep timed out after {SEMGREP_TIMEOUT + 30}s"})

    # Parse semgrep JSON
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return json.dumps({"error": "Failed to parse semgrep output", "raw": raw[:500]})

    results = data.get("results", [])
    files_scanned = len({r.get("path", "") for r in results})

    # Map semgrep severity to our format
    sev_map = {"ERROR": "HIGH", "WARNING": "MEDIUM", "INFO": "LOW"}

    findings = []
    for r in results:
        extra = r.get("extra", {})
        severity_raw = extra.get("severity", extra.get("metadata", {}).get("severity", "WARNING"))
        severity = sev_map.get(severity_raw.upper(), "MEDIUM")

        # Detect secrets separately → escalate to CRITICAL
        rule_id = r.get("check_id", "")
        if any(kw in rule_id.lower() for kw in ["secret", "hardcoded", "credential", "api.key", "password"]):
            severity = "CRITICAL"

        code_lines = extra.get("lines", "")[:200]  # Limit code snippet

        findings.append({
            "id": hashlib.md5(f"{r.get('path', '')}{r.get('start', {}).get('line', 0)}{rule_id}".encode()).hexdigest()[:8],
            "file": r.get("path", "").replace(str(path), "").lstrip("/"),
            "line": r.get("start", {}).get("line", 0),
            "end_line": r.get("end", {}).get("line", 0),
            "severity": severity,
            "rule_id": rule_id,
            "message": extra.get("message", "Security issue detected"),
            "code_snippet": code_lines,
            "fix_suggestion": extra.get("fix", extra.get("metadata", {}).get("fix", "")),
            "cwe": extra.get("metadata", {}).get("cwe", []),
            "owasp": extra.get("metadata", {}).get("owasp", []),
            "references": extra.get("metadata", {}).get("references", [])[:3],
        })

    # Sort: CRITICAL > HIGH > MEDIUM > LOW, then by file/line
    findings.sort(key=lambda f: (_severity_rank(f["severity"]), f["file"], f["line"]))
    findings = findings[:MAX_FINDINGS]

    summary = {"critical": 0, "high": 0, "medium": 0, "low": 0, "total": len(findings)}
    for f in findings:
        sev_key = f["severity"].lower()
        if sev_key in summary:
            summary[sev_key] += 1

    result_obj = {
        "summary": summary,
        "findings": findings,
        "scan_metadata": {
            "path": project_path,
            "rules": rules,
            "files_scanned": files_scanned,
            "semgrep_version": semgrep_version,
            "duration_ms": int((time.time() - start) * 1000),
            "findings_shown": len(findings),
            "total_raw_findings": len(results),
        }
    }
    return _truncate(result_obj, "scan_code")


# ─── Tool: get_finding_detail ─────────────────────────────────────────────────

@mcp.tool()
def get_finding_detail(finding_type: str, package_or_rule: str, project_path: str) -> str:
    """
    Get detailed information about a specific vulnerability or rule.
    Use when Coder Agent needs more context to write a precise fix.

    Args:
        finding_type: "dependency" (npm) or "code" (semgrep)
        package_or_rule: Package name (for dependency) or rule ID (for code)
        project_path: Project path for context

    Returns:
        JSON with detailed description, fix patterns, and references
    """
    if finding_type == "dependency":
        try:
            result = subprocess.run(
                ["npm", "audit", "--json"],
                cwd=project_path,
                capture_output=True,
                text=True,
                timeout=60,
            )
            data = json.loads(result.stdout)
            vuln = data.get("vulnerabilities", {}).get(package_or_rule, {})
            return _truncate({
                "package": package_or_rule,
                "severity": vuln.get("severity", "unknown"),
                "details": vuln,
            }, "get_finding_detail")
        except Exception as e:
            return json.dumps({"error": str(e)})
    else:
        # Return semgrep rule info
        try:
            result = subprocess.run(
                ["semgrep", "--json", f"--config={package_or_rule}", "--dry-run"],
                capture_output=True,
                text=True,
                timeout=30,
            )
            return _truncate({"rule_id": package_or_rule, "raw": result.stdout[:2000]}, "rule_detail")
        except Exception as e:
            return json.dumps({"error": str(e)})


# ─── Tool: generate_fix_template ──────────────────────────────────────────────

@mcp.tool()
def generate_fix_template(severity: str, finding_type: str, language: str = "typescript") -> str:
    """
    Returns common fix patterns for a category of security finding.
    Helps Coder Agent produce correct patches faster without hallucinating syntax.

    Args:
        severity: CRITICAL / HIGH / MEDIUM / LOW
        finding_type: "sql_injection" | "xss" | "path_traversal" | "hardcoded_secret" |
                      "ssrf" | "dependency_outdated" | "insecure_random" | "weak_crypto"
        language: "typescript" | "javascript" | "python"

    Returns:
        JSON with {pattern, vulnerable_example, secure_example, explanation, references}
    """
    patterns = {
        "sql_injection": {
            "typescript": {
                "pattern": "Parameterized queries / ORM",
                "vulnerable_example": 'db.query(`SELECT * FROM users WHERE id = ${userId}`)',
                "secure_example": "db.query('SELECT * FROM users WHERE id = $1', [userId])",
                "explanation": "Never interpolate user input into SQL strings. Use parameterized queries or an ORM like Prisma which handles this automatically.",
                "references": ["https://owasp.org/www-community/attacks/SQL_Injection", "https://www.prisma.io/docs/guides/performance-and-optimization/query-optimization-performance"],
            }
        },
        "xss": {
            "typescript": {
                "pattern": "Output encoding / CSP",
                "vulnerable_example": 'element.innerHTML = userInput',
                "secure_example": 'element.textContent = userInput  // or use DOMPurify for HTML\nimport DOMPurify from "dompurify";\nelement.innerHTML = DOMPurify.sanitize(userInput)',
                "explanation": "Never use innerHTML with untrusted data. Use textContent for plain text or DOMPurify for HTML content.",
                "references": ["https://owasp.org/www-community/attacks/xss/", "https://github.com/cure53/DOMPurify"],
            }
        },
        "path_traversal": {
            "typescript": {
                "pattern": "Path normalization + allowlist",
                "vulnerable_example": 'const file = path.join(baseDir, req.params.filename)',
                "secure_example": 'import path from "path";\nconst safe = path.resolve(baseDir, req.params.filename);\nif (!safe.startsWith(path.resolve(baseDir))) {\n  throw new Error("Path traversal detected");\n}',
                "explanation": "Always resolve and validate that the final path is within the allowed base directory.",
                "references": ["https://owasp.org/www-community/attacks/Path_Traversal"],
            }
        },
        "hardcoded_secret": {
            "typescript": {
                "pattern": "Environment variables",
                "vulnerable_example": 'const API_KEY = "sk-1234abcd..."',
                "secure_example": 'const API_KEY = process.env.API_KEY;\nif (!API_KEY) throw new Error("API_KEY env var is required");',
                "explanation": "Never hardcode secrets. Use environment variables and validate they exist at startup (see src/lib/env.ts for Zod-based validation pattern).",
                "references": ["https://12factor.net/config"],
            }
        },
        "ssrf": {
            "typescript": {
                "pattern": "URL allowlist + DNS validation",
                "vulnerable_example": 'const response = await fetch(userProvidedUrl)',
                "secure_example": 'import { validateExternalUrlWithDNS } from "@/lib/utils/url-validation";\nawait validateExternalUrlWithDNS(userProvidedUrl); // throws on private IPs\nconst response = await fetch(userProvidedUrl)',
                "explanation": "Validate external URLs against a DNS-based blocklist to prevent SSRF attacks. The project already has validateExternalUrlWithDNS() in src/lib/utils/url-validation.ts.",
                "references": ["https://owasp.org/www-community/attacks/Server_Side_Request_Forgery"],
            }
        },
        "insecure_random": {
            "typescript": {
                "pattern": "crypto.randomBytes",
                "vulnerable_example": 'const token = Math.random().toString(36)',
                "secure_example": 'import { randomBytes } from "crypto";\nconst token = randomBytes(32).toString("base64url")',
                "explanation": "Math.random() is not cryptographically secure. Use crypto.randomBytes() for security tokens, session IDs, and CSRF tokens.",
                "references": ["https://nodejs.org/api/crypto.html#cryptorandombytessize-callback"],
            }
        },
    }

    lang_patterns = patterns.get(finding_type, {}).get(language, patterns.get(finding_type, {}).get("typescript", {}))
    if not lang_patterns:
        return json.dumps({"error": f"No pattern found for {finding_type} in {language}", "available": list(patterns.keys())})

    return json.dumps({
        "finding_type": finding_type,
        "severity": severity,
        "language": language,
        **lang_patterns,
    }, indent=2)


# ─── Health check ─────────────────────────────────────────────────────────────

@mcp.tool()
def health() -> str:
    """Returns scanner health status: available tools, versions, config."""
    checks = {}

    # npm
    try:
        npm = subprocess.run(["npm", "--version"], capture_output=True, text=True, timeout=5)
        checks["npm"] = {"available": True, "version": npm.stdout.strip()}
    except Exception:
        checks["npm"] = {"available": False}

    # semgrep
    try:
        sg = subprocess.run(["semgrep", "--version"], capture_output=True, text=True, timeout=10)
        checks["semgrep"] = {"available": True, "version": sg.stdout.strip()}
    except Exception:
        checks["semgrep"] = {"available": False, "install": "pip install semgrep"}

    return json.dumps({
        "status": "healthy" if all(c.get("available") for c in checks.values()) else "degraded",
        "tools": checks,
        "config": {
            "max_findings": MAX_FINDINGS,
            "semgrep_timeout": SEMGREP_TIMEOUT,
            "mcp_spec": "2025-11-25",
        }
    }, indent=2)


# ─── Entry point ──────────────────────────────────────────────────────────────

if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8001"))
    mcp.run(transport="streamable-http", host="0.0.0.0", port=port, path="/mcp")
