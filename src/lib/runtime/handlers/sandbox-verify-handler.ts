import { mkdirSync, writeFileSync, rmSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import type { NodeHandler } from "../types";
import { runVerificationCommands } from "../verification-commands";
import { logger } from "@/lib/logger";

const DEFAULT_CHECKS = ["forbidden_patterns"];
const PROJECT_ROOT = process.cwd();

interface ForbiddenPattern {
  pattern: string;
  message: string;
}

interface CodeFile {
  path: string;
  content: string;
}

const BUILT_IN_FORBIDDEN_PATTERNS: ForbiddenPattern[] = [
  { pattern: "@prisma/client", message: 'Use @/generated/prisma instead of @prisma/client' },
  { pattern: ": any\\b", message: 'No any types allowed — use proper types' },
  { pattern: "console\\.(log|error|warn)", message: 'Use logger from @/lib/logger instead of console' },
];

export const sandboxVerifyHandler: NodeHandler = async (node, context) => {
  const inputVariable = (node.data.inputVariable as string) || "generatedCode";
  const checks: string[] = Array.isArray(node.data.checks)
    ? (node.data.checks as string[])
    : DEFAULT_CHECKS;
  const customPatterns = parseForbiddenPatterns(node.data.forbiddenPatterns);
  const resultVar = (node.data.outputVariable as string) || "sandboxResult";

  try {
    const codeInput = context.variables[inputVariable];

    if (!codeInput) {
      return failResult(
        resultVar,
        [`No code found in variable "{{${inputVariable}}}" — nothing to verify`],
        "FAIL: input variable is empty",
      );
    }

    const codeFiles = extractCodeFiles(codeInput);
    if (codeFiles.length === 0) {
      return failResult(
        resultVar,
        [`Could not extract code from "{{${inputVariable}}}"`],
        "FAIL: no code files extracted",
      );
    }

    const allErrors: string[] = [];

    if (checks.includes("forbidden_patterns")) {
      const allPatterns = [...BUILT_IN_FORBIDDEN_PATTERNS, ...customPatterns];
      const patternErrors = runForbiddenPatternChecks(codeFiles, allPatterns);
      allErrors.push(...patternErrors);
    }

    if (checks.includes("typecheck") || checks.includes("lint")) {
      const tempDir = join(tmpdir(), `agent-sandbox-${context.agentId.slice(0, 8)}-${node.id.slice(0, 8)}`);
      try {
        writeTempFiles(tempDir, codeFiles);

        if (checks.includes("typecheck")) {
          const tcErrors = await runTypecheckOnFiles(codeFiles, tempDir, context.agentId);
          allErrors.push(...tcErrors);
        }

        if (checks.includes("lint")) {
          const lintErrors = await runLintOnFiles(codeFiles, tempDir, context.agentId);
          allErrors.push(...lintErrors);
        }
      } finally {
        cleanupTempDir(tempDir);
      }
    }

    const passed = allErrors.length === 0;
    const summary = passed
      ? `PASS: all ${checks.join(", ")} checks passed (${codeFiles.length} file${codeFiles.length !== 1 ? "s" : ""})`
      : `FAIL: ${allErrors.length} issue${allErrors.length !== 1 ? "s" : ""} found across ${codeFiles.length} file${codeFiles.length !== 1 ? "s" : ""}`;

    logger.info("sandbox-verify completed", {
      nodeId: node.id,
      agentId: context.agentId,
      passed,
      errorCount: allErrors.length,
      checks,
    });

    return {
      messages: [
        {
          role: "assistant",
          content: allErrors.length > 0
            ? `${summary}\n\n${allErrors.map((e, i) => `${i + 1}. ${e}`).join("\n")}`
            : summary,
        },
      ],
      nextNodeId: passed ? "passed" : "failed",
      waitForInput: false,
      updatedVariables: {
        [resultVar]: passed ? "PASS" : "FAIL",
        sandboxErrors: allErrors,
        sandboxSummary: summary,
      },
    };
  } catch (error) {
    logger.error("sandbox-verify-handler error", { nodeId: node.id, error });
    return {
      messages: [{ role: "assistant", content: "An error occurred in sandbox_verify node." }],
      nextNodeId: "failed",
      waitForInput: false,
      updatedVariables: {
        [resultVar]: "FAIL",
        sandboxErrors: ["Internal sandbox error"],
        sandboxSummary: "FAIL: internal error",
      },
    };
  }
};

function failResult(
  resultVar: string,
  errors: string[],
  summary: string,
): ReturnType<NodeHandler> {
  return Promise.resolve({
    messages: [{ role: "assistant", content: `${summary}\n\n${errors.join("\n")}` }],
    nextNodeId: "failed",
    waitForInput: false,
    updatedVariables: {
      [resultVar]: "FAIL",
      sandboxErrors: errors,
      sandboxSummary: summary,
    },
  });
}

function extractCodeFiles(input: unknown): CodeFile[] {
  if (typeof input === "string") {
    return [{ path: "generated.ts", content: input }];
  }

  if (typeof input === "object" && input !== null) {
    const obj = input as Record<string, unknown>;
    if (Array.isArray(obj.files)) {
      return (obj.files as Record<string, unknown>[])
        .filter((f) => typeof f.content === "string")
        .map((f) => ({
          path: typeof f.path === "string" ? f.path : "generated.ts",
          content: f.content as string,
        }));
    }
    if (typeof obj.content === "string") {
      return [{ path: "generated.ts", content: obj.content }];
    }
  }

  return [];
}

function runForbiddenPatternChecks(
  files: CodeFile[],
  patterns: ForbiddenPattern[],
): string[] {
  const errors: string[] = [];

  for (const file of files) {
    for (const { pattern, message } of patterns) {
      try {
        const regex = new RegExp(pattern);
        const lines = file.content.split("\n");
        lines.forEach((line, idx) => {
          if (regex.test(line)) {
            errors.push(`${file.path}:${idx + 1} — ${message} (found: "${line.trim().slice(0, 80)}")`);
          }
        });
      } catch {
        logger.warn("sandbox-verify: invalid regex pattern, skipping", { pattern });
      }
    }
  }

  return errors;
}

function parseForbiddenPatterns(raw: unknown): ForbiddenPattern[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (p): p is Record<string, unknown> =>
        typeof p === "object" && p !== null &&
        typeof (p as Record<string, unknown>).pattern === "string" &&
        typeof (p as Record<string, unknown>).message === "string",
    )
    .map((p) => ({ pattern: p.pattern as string, message: p.message as string }));
}

function writeTempFiles(tempDir: string, files: CodeFile[]): void {
  if (existsSync(tempDir)) {
    rmSync(tempDir, { recursive: true, force: true });
  }
  mkdirSync(tempDir, { recursive: true });
  for (const file of files) {
    const dest = join(tempDir, file.path.split("/").pop() ?? "generated.ts");
    writeFileSync(dest, file.content, "utf-8");
  }
}

function cleanupTempDir(tempDir: string): void {
  try {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  } catch (err) {
    logger.warn("sandbox-verify: failed to clean temp dir", { tempDir, err });
  }
}

async function runTypecheckOnFiles(
  files: CodeFile[],
  tempDir: string,
  agentId: string,
): Promise<string[]> {
  const tsFiles = files
    .filter((f) => f.path.endsWith(".ts") || f.path.endsWith(".tsx"))
    .map((f) => join(tempDir, f.path.split("/").pop() ?? "generated.ts").replace(PROJECT_ROOT + "/", ""));

  if (tsFiles.length === 0) return [];

  const command = `tsc --noEmit --allowJs --strict --skipLibCheck ${tsFiles.join(" ")}`;
  const { results } = await runVerificationCommands([command], agentId);
  const result = results[0];

  if (!result || result.passed) return [];
  return parseTypecheckErrors(result.output);
}

async function runLintOnFiles(
  files: CodeFile[],
  tempDir: string,
  agentId: string,
): Promise<string[]> {
  const lintableFiles = files
    .filter((f) => f.path.endsWith(".ts") || f.path.endsWith(".tsx") || f.path.endsWith(".js"))
    .map((f) => join(tempDir, f.path.split("/").pop() ?? "generated.ts").replace(PROJECT_ROOT + "/", ""));

  if (lintableFiles.length === 0) return [];

  const command = `eslint --quiet --no-ignore ${lintableFiles.join(" ")}`;
  const { results } = await runVerificationCommands([command], agentId);
  const result = results[0];

  if (!result || result.passed) return [];
  return result.output
    .split("\n")
    .filter((l) => l.includes("error") || l.includes("warning"))
    .slice(0, 20);
}

function parseTypecheckErrors(output: string): string[] {
  return output
    .split("\n")
    .filter((l) => l.includes("error TS") || l.includes("Error:"))
    .slice(0, 20);
}
