/**
 * e2b-executor.ts
 *
 * E2B cloud sandbox execution for SDLC pipeline code verification.
 * Replaces local tsc + vitest execution with isolated E2B sandbox.
 * Falls back gracefully if E2B is unavailable.
 */

import { Sandbox } from "@e2b/code-interpreter";
import { join } from "node:path";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { logger } from "@/lib/logger";
import type { ParsedFile, WorkspaceExecResult } from "@/lib/sdlc/code-extractor";

const TSC_TIMEOUT_MS   = 90_000;
const VITEST_TIMEOUT_MS = 180_000;
const SANDBOX_TIMEOUT_MS = 300_000;
const SANDBOX_WORK_DIR = "/home/user/workspace";

const PACKAGE_JSON = JSON.stringify({
  name: "sdlc-sandbox",
  version: "1.0.0",
  private: true,
  scripts: { test: "vitest run" },
}, null, 2);

const TSCONFIG = JSON.stringify({
  compilerOptions: {
    target: "ES2020",
    module: "ESNext",
    moduleResolution: "bundler",
    strict: true,
    skipLibCheck: true,
    noEmit: true,
  },
  include: ["./**/*.ts"],
  exclude: ["node_modules"],
}, null, 2);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseTypecheckPassed(output: string): boolean {
  return !output.includes("error TS") && !output.includes("TypeScript error");
}

function parseTestsPassed(output: string): boolean {
  return (
    output.includes("passed") &&
    !output.includes("failed") &&
    !output.includes("FAIL")
  );
}

function collectFilesFromDir(dir: string, base = dir): ParsedFile[] {
  const results: ParsedFile[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      results.push(...collectFilesFromDir(full, base));
    } else {
      const rel = full.slice(base.length + 1);
      const ext = entry.split(".").pop() ?? "";
      results.push({
        path: rel,
        content: readFileSync(full, "utf-8"),
        language: ext,
      });
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// Main executor
// ---------------------------------------------------------------------------

export async function executeInE2BSandbox(
  files: ParsedFile[],
  workDir: string,
  agentId: string,
): Promise<WorkspaceExecResult> {
  const apiKey = process.env.E2B_API_KEY;
  if (!apiKey) {
    throw new Error("E2B_API_KEY is not set");
  }

  let sandbox: Sandbox | null = null;

  try {
    logger.info("e2b-executor: creating sandbox", {
      agentId,
      fileCount: files.length,
    });

    sandbox = await Sandbox.create({
      apiKey,
      timeoutMs: SANDBOX_TIMEOUT_MS,
    });

    // Write package.json and tsconfig
    await sandbox.files.write(
      `${SANDBOX_WORK_DIR}/package.json`,
      PACKAGE_JSON,
    );
    await sandbox.files.write(
      `${SANDBOX_WORK_DIR}/tsconfig.json`,
      TSCONFIG,
    );

    // Write all generated files
    const writtenPaths: string[] = [];
    for (const file of files) {
      const destPath = `${SANDBOX_WORK_DIR}/${file.path}`;
      await sandbox.files.write(destPath, file.content);
      writtenPaths.push(file.path);
    }

    // Install dependencies
    const installResult = await sandbox.commands.run(
      "cd /home/user/workspace && npm install --save-dev typescript vitest @types/node 2>&1",
      { timeoutMs: 60_000 },
    );
    logger.info("e2b-executor: npm install complete", {
      agentId,
      exitCode: installResult.exitCode,
    });

    // TypeScript check
    const tscResult = await sandbox.commands.run(
      "cd /home/user/workspace && npx tsc --noEmit --pretty false 2>&1",
      { timeoutMs: TSC_TIMEOUT_MS },
    );
    const tscOutput = tscResult.stdout + tscResult.stderr;
    const typecheckPassed = tscResult.exitCode === 0 && parseTypecheckPassed(tscOutput);

    logger.info("e2b-executor: typecheck complete", {
      agentId,
      typecheckPassed,
      exitCode: tscResult.exitCode,
    });

    // Run tests
    const vitestResult = await sandbox.commands.run(
      "cd /home/user/workspace && npx vitest run 2>&1",
      { timeoutMs: VITEST_TIMEOUT_MS },
    );
    const vitestOutput = vitestResult.stdout + vitestResult.stderr;
    const testsPassed = vitestResult.exitCode === 0 && parseTestsPassed(vitestOutput);

    logger.info("e2b-executor: tests complete", {
      agentId,
      testsPassed,
      exitCode: vitestResult.exitCode,
    });

    const testOutput = [
      "=== TypeScript Check ===",
      tscOutput || "(no output)",
      "",
      "=== Test Results ===",
      vitestOutput || "(no output)",
    ].join("\n");

    return {
      filesWritten: writtenPaths.length,
      writtenPaths,
      testOutput,
      typecheckPassed,
      testsPassed,
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    logger.warn("e2b-executor: sandbox execution failed", { agentId, error });
    throw err;
  } finally {
    if (sandbox) {
      try {
        await sandbox.kill();
        logger.info("e2b-executor: sandbox killed", { agentId });
      } catch {
        // ignore cleanup errors
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Workspace re-execution (for runWorkspaceTests path)
// ---------------------------------------------------------------------------

export async function executeWorkspaceInE2BSandbox(
  workDir: string,
  agentId: string,
): Promise<WorkspaceExecResult> {
  const workspaceDir = join(workDir, "workspace");
  let files: ParsedFile[];

  try {
    files = collectFilesFromDir(workspaceDir);
  } catch {
    logger.warn("e2b-executor: could not read workspace dir", { agentId, workspaceDir });
    return {
      filesWritten: 0,
      writtenPaths: [],
      testOutput: "Workspace directory not found",
      typecheckPassed: false,
      testsPassed: false,
    };
  }

  return executeInE2BSandbox(files, workDir, agentId);
}
