/**
 * Post-generation validation for Python FastMCP bridge files (F3).
 *
 * Catches common AI hallucinations:
 * - mcp.Server() (deprecated — must use FastMCP)
 * - Missing from mcp.server.fastmcp import FastMCP
 * - Missing @mcp.tool decorators
 * - Missing mcp in requirements.txt
 * - Missing required files
 */

import { logger } from "@/lib/logger";

export interface ValidationIssue {
  file: string;
  severity: "error" | "warning";
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
}

const EXPECTED_PY_FILES = [
  "server.py",
  "bridge.py",
  "requirements.txt",
  "pyproject.toml",
  "README.md",
] as const;

export function validatePythonOutput(files: Record<string, string>): ValidationResult {
  const issues: ValidationIssue[] = [];

  // Check expected files are present
  for (const expected of EXPECTED_PY_FILES) {
    if (!files[expected]) {
      issues.push({
        file: expected,
        severity: "error",
        message: `Missing required file: ${expected}`,
      });
    }
  }

  // Validate server.py
  const serverPy = files["server.py"];
  if (serverPy) {
    if (!serverPy.includes("FastMCP")) {
      issues.push({
        file: "server.py",
        severity: "error",
        message: "Missing FastMCP — must use `from mcp.server.fastmcp import FastMCP`",
      });
    }
    if (serverPy.includes("mcp.Server(")) {
      issues.push({
        file: "server.py",
        severity: "error",
        message: "Uses deprecated mcp.Server() — must use FastMCP from mcp.server.fastmcp",
      });
    }
    if (!serverPy.includes("@mcp.tool") && !serverPy.includes(".tool(")) {
      issues.push({
        file: "server.py",
        severity: "warning",
        message: "No @mcp.tool decorators found — server may have no tools",
      });
    }
    if (!serverPy.includes("mcp.run(") && !serverPy.includes(".run(")) {
      issues.push({
        file: "server.py",
        severity: "warning",
        message: "Missing mcp.run() call — server may not start correctly",
      });
    }
  }

  // Validate bridge.py
  const bridgePy = files["bridge.py"];
  if (bridgePy) {
    if (!bridgePy.includes("subprocess")) {
      issues.push({
        file: "bridge.py",
        severity: "warning",
        message: "Missing subprocess import — bridge may not invoke CLI commands",
      });
    }
  }

  // Validate requirements.txt
  const requirements = files["requirements.txt"];
  if (requirements) {
    if (!requirements.toLowerCase().includes("mcp")) {
      issues.push({
        file: "requirements.txt",
        severity: "error",
        message: 'Missing "mcp" dependency — required for FastMCP server',
      });
    }
  }

  const hasErrors = issues.some((i) => i.severity === "error");

  if (issues.length > 0) {
    logger.warn("Python validation issues", {
      errors: issues.filter((i) => i.severity === "error").length,
      warnings: issues.filter((i) => i.severity === "warning").length,
    });
  }

  return { valid: !hasErrors, issues };
}
