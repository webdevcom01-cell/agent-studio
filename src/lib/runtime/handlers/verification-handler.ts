import type { NodeHandler } from "../types";
import { runVerificationCommands } from "../verification-commands";
import type { CommandResult } from "../verification-commands";
import { emitSessionEvent } from "../session-events";
import { logger } from "@/lib/logger";

const MAX_OVERALL_TIMEOUT_MS = 300_000; // 5 minutes total

interface VerificationCheck {
  type: "build" | "test" | "lint" | "custom";
  command: string;
  label?: string;
}

interface VerificationResult {
  type: string;
  command: string;
  label: string;
  exitCode: number;
  output: string;
  durationMs: number;
}

function parseChecks(raw: unknown): VerificationCheck[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (c): c is Record<string, unknown> =>
        typeof c === "object" && c !== null && typeof (c as Record<string, unknown>).command === "string",
    )
    .map((c) => ({
      type: (typeof c.type === "string" && ["build", "test", "lint", "custom"].includes(c.type))
        ? c.type as VerificationCheck["type"]
        : "custom",
      command: String(c.command),
      label: typeof c.label === "string" ? c.label : undefined,
    }));
}

/**
 * verification — Runs build/test/lint/custom commands and routes to passed or failed.
 *
 * Config:
 *   checks: Array<{ type: "build"|"test"|"lint"|"custom", command: string, label?: string }>
 *   outputVariable?: string — stores per-check results array
 *
 * Routing:
 *   All checks pass (exit code 0) → "passed" sourceHandle
 *   Any check fails → "failed" sourceHandle
 *
 * Security: Uses execFile with command whitelist (shared with reflexive_loop).
 */
export const verificationHandler: NodeHandler = async (node, context) => {
  try {
    const checks = parseChecks(node.data.checks);
    const outputVariable = (node.data.outputVariable as string) || "verificationResults";

    // Empty checks = auto-pass
    if (checks.length === 0) {
      return {
        messages: [{ role: "assistant", content: "Verification passed: no checks configured." }],
        nextNodeId: "passed",
        waitForInput: false,
        updatedVariables: {
          [outputVariable]: [],
        },
      };
    }

    const commands = checks.map((c) => c.command);
    const startMs = Date.now();

    // Run with overall timeout guard
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("Verification overall timeout (5 min)")), MAX_OVERALL_TIMEOUT_MS);
    });

    const execPromise = runVerificationCommands(commands, context.agentId);
    const result = await Promise.race([execPromise, timeoutPromise]);

    const totalDurationMs = Date.now() - startMs;

    // Map CommandResult[] to VerificationResult[] with check metadata
    const verificationResults: VerificationResult[] = result.results.map(
      (r: CommandResult, i: number) => ({
        type: checks[i]?.type ?? "custom",
        command: r.command,
        label: checks[i]?.label ?? checks[i]?.type ?? "check",
        exitCode: r.passed ? 0 : 1,
        output: r.output,
        durationMs: r.durationMs,
      }),
    );

    const passedCount = verificationResults.filter((r) => r.exitCode === 0).length;
    const failedCount = verificationResults.filter((r) => r.exitCode !== 0).length;

    const summary = result.allPassed
      ? `✅ Verification passed: all ${checks.length} checks passed (${totalDurationMs}ms)`
      : `❌ Verification failed: ${failedCount}/${checks.length} checks failed (${totalDurationMs}ms)`;

    logger.info("Verification completed", {
      nodeId: node.id,
      agentId: context.agentId,
      allPassed: result.allPassed,
      passedCount,
      failedCount,
      totalDurationMs,
    });

    emitSessionEvent(
      context,
      result.allPassed ? "session.verification_passed" : "session.verification_failed",
      {
        durationMs: totalDurationMs,
        meta: { passedCount, failedCount, checks: checks.length },
      },
    );

    return {
      messages: [
        { role: "assistant", content: `${summary}\n\n${result.output}` },
      ],
      nextNodeId: result.allPassed ? "passed" : "failed",
      waitForInput: false,
      updatedVariables: {
        [outputVariable]: verificationResults,
      },
    };
  } catch (error) {
    logger.error("verification-handler error", { nodeId: node.id, error });
    return {
      messages: [
        {
          role: "assistant",
          content: "An error occurred in verification node.",
        },
      ],
      nextNodeId: "failed",
      waitForInput: false,
      updatedVariables: {},
    };
  }
};
