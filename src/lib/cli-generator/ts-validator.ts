/**
 * Post-generation validation for TypeScript MCP bridge files (P4-T3).
 *
 * Catches common AI hallucinations:
 * - server.tool() (deprecated, should be registerTool)
 * - Missing ESM .js extensions on local imports
 * - Missing "type": "module" in package.json
 * - Missing McpServer import
 */

import { logger } from "@/lib/logger";

export interface ValidationIssue {
  file: string;
  severity: "error" | "warning";
  message: string;
  line?: number;
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
}

const EXPECTED_TS_FILES = [
  "index.ts",
  "bridge.ts",
  "server.ts",
  "bridge.test.ts",
  "server.test.ts",
  "package.json",
  "tsconfig.json",
  "README.md",
] as const;

export function validateTSOutput(files: Record<string, string>): ValidationResult {
  const issues: ValidationIssue[] = [];

  // Check all expected files are present
  for (const expected of EXPECTED_TS_FILES) {
    if (!files[expected]) {
      issues.push({
        file: expected,
        severity: "error",
        message: `Missing required file: ${expected}`,
      });
    }
  }

  // Validate server.ts
  const serverTs = files["server.ts"];
  if (serverTs) {
    if (serverTs.includes("server.tool(")) {
      issues.push({
        file: "server.ts",
        severity: "error",
        message: "Uses deprecated server.tool() — must use server.registerTool()",
      });
    }

    if (!serverTs.includes("McpServer")) {
      issues.push({
        file: "server.ts",
        severity: "error",
        message: "Missing McpServer import from @modelcontextprotocol/sdk",
      });
    }

    if (!serverTs.includes("registerTool")) {
      issues.push({
        file: "server.ts",
        severity: "warning",
        message: "No registerTool calls found — server may have no tools",
      });
    }

    if (!serverTs.includes("StdioServerTransport")) {
      issues.push({
        file: "server.ts",
        severity: "warning",
        message: "Missing StdioServerTransport — server cannot connect via stdio",
      });
    }
  }

  // Validate ESM imports in .ts files (not .test.ts)
  for (const [filename, content] of Object.entries(files)) {
    if (!filename.endsWith(".ts") || filename.endsWith(".test.ts")) continue;

    const localImports = content.match(/from\s+["']\.\/[^"']+["']/g) ?? [];
    for (const imp of localImports) {
      if (!imp.includes(".js")) {
        issues.push({
          file: filename,
          severity: "warning",
          message: `Local import missing .js extension: ${imp}`,
        });
      }
    }
  }

  // Validate package.json
  const packageJson = files["package.json"];
  if (packageJson) {
    try {
      const pkg = JSON.parse(packageJson) as Record<string, unknown>;
      if (pkg.type !== "module") {
        issues.push({
          file: "package.json",
          severity: "error",
          message: 'Missing "type": "module" — required for ESM',
        });
      }
      if (!pkg.scripts || typeof pkg.scripts !== "object") {
        issues.push({
          file: "package.json",
          severity: "warning",
          message: "Missing scripts section",
        });
      } else {
        const scripts = pkg.scripts as Record<string, string>;
        if (!scripts.build) {
          issues.push({
            file: "package.json",
            severity: "warning",
            message: 'Missing "build" script',
          });
        }
        if (!scripts.test) {
          issues.push({
            file: "package.json",
            severity: "warning",
            message: 'Missing "test" script',
          });
        }
      }
    } catch {
      issues.push({
        file: "package.json",
        severity: "error",
        message: "Invalid JSON in package.json",
      });
    }
  }

  // Validate tsconfig.json
  const tsconfig = files["tsconfig.json"];
  if (tsconfig) {
    try {
      const config = JSON.parse(tsconfig) as Record<string, unknown>;
      const compilerOptions = config.compilerOptions as Record<string, unknown> | undefined;
      if (!compilerOptions?.strict) {
        issues.push({
          file: "tsconfig.json",
          severity: "warning",
          message: "strict mode not enabled in tsconfig.json",
        });
      }
    } catch {
      issues.push({
        file: "tsconfig.json",
        severity: "error",
        message: "Invalid JSON in tsconfig.json",
      });
    }
  }

  const hasErrors = issues.some((i) => i.severity === "error");

  if (issues.length > 0) {
    logger.warn("TS validation issues", {
      errors: issues.filter((i) => i.severity === "error").length,
      warnings: issues.filter((i) => i.severity === "warning").length,
    });
  }

  return { valid: !hasErrors, issues };
}
