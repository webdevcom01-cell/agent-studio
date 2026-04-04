import type { NodeHandler } from "../types";
import { resolveTemplate } from "../template";
import { emitHook } from "../hooks";
import { logger } from "@/lib/logger";

interface EvalCriterion {
  name: string;
  description: string;
  weight: number;
}

interface IterationRecord {
  iteration: number;
  output: string;
  score: number;
  feedback: string;
  model: string;
  durationMs: number;
  verificationPassed?: boolean;
  verificationOutput?: string;
}

const MAX_ITERATIONS = 5;
const MAX_PERSISTENT_ITERATIONS = 20;
const DEFAULT_PASSING_SCORE = 7;
const DEFAULT_MAX_TOKENS = 2000;

/**
 * Whitelist of allowed command prefixes for verification commands.
 * Only common build/test/lint tools are permitted.
 */
const ALLOWED_COMMAND_PREFIXES = /^(npm|npx|yarn|pnpm|python|pytest|tsc|eslint|jest|vitest|cargo|go|make|dotnet|ruby|bundle|mix|gradle|mvn)\b/;

/**
 * Shell metacharacters that indicate command chaining/injection.
 * These are blocked to prevent abuse via verification commands.
 */
const SHELL_METACHARACTERS = /[;&|`$(){}<>!#]/;

/**
 * Validate and sanitize a verification command.
 * Returns null if the command is not allowed.
 */
function validateCommand(command: string): string | null {
  const trimmed = command.trim();
  if (!trimmed) return null;

  // Block shell metacharacters (prevents && rm -rf, pipes, subshells, etc.)
  if (SHELL_METACHARACTERS.test(trimmed)) {
    logger.warn("Verification command blocked: shell metacharacters detected", {
      command: trimmed,
    });
    return null;
  }

  // Must start with a whitelisted command
  if (!ALLOWED_COMMAND_PREFIXES.test(trimmed)) {
    logger.warn("Verification command blocked: not in whitelist", {
      command: trimmed,
    });
    return null;
  }

  return trimmed;
}

/**
 * Run verification commands using child_process.execFile for safety.
 * Returns { allPassed, output } — output includes stdout/stderr of each command.
 *
 * Uses execFile (not exec) to avoid shell interpretation.
 * Each command gets a 60s timeout.
 */
async function runVerificationCommands(
  commands: string[],
  agentId: string,
): Promise<{ allPassed: boolean; output: string }> {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const execFileAsync = promisify(execFile);

  const results: string[] = [];
  let allPassed = true;

  for (const raw of commands) {
    const validated = validateCommand(raw);
    if (!validated) {
      results.push(`⛔ BLOCKED: "${raw}" — command not allowed`);
      allPassed = false;
      continue;
    }

    // Split command into executable + args for execFile
    const parts = validated.split(/\s+/);
    const cmd = parts[0];
    const args = parts.slice(1);

    try {
      const { stdout, stderr } = await execFileAsync(cmd, args, {
        timeout: 60_000,
        maxBuffer: 1024 * 512, // 512KB
        env: { ...process.env, CI: "true", FORCE_COLOR: "0" },
      });

      const output = (stdout + (stderr ? `\nstderr: ${stderr}` : "")).trim();
      results.push(`✅ ${validated}\n${output.slice(0, 2000)}`);

      logger.info("Verification command passed", {
        agentId,
        command: validated,
      });
    } catch (error: unknown) {
      allPassed = false;
      const errMsg =
        error instanceof Error ? error.message : String(error);
      results.push(
        `❌ ${validated}\n${errMsg.slice(0, 2000)}`,
      );

      logger.warn("Verification command failed", {
        agentId,
        command: validated,
        error: errMsg.slice(0, 500),
      });
    }
  }

  return { allPassed, output: results.join("\n\n") };
}

/**
 * reflexive_loop — Self-correcting node that generates output, evaluates quality,
 * and retries with feedback until the passing score is reached or max iterations hit.
 *
 * Combines ai_response + evaluator + retry into a single composable node.
 * Routes to "passed" on quality pass, "failed" on max iterations exhausted.
 *
 * Supports two modes:
 * - "bounded" (default): max 5 iterations, AI-only evaluation
 * - "persistent": max 20 iterations, optional verification commands (build/test/lint),
 *   sets __persistent_mode context variables so end-handler routes back until verified
 */
export const reflexiveLoopHandler: NodeHandler = async (node, context) => {
  const executorModel = (node.data.executorModel as string) || "deepseek-chat";
  const evaluatorModel = (node.data.evaluatorModel as string) || "deepseek-chat";
  const mode = (node.data.mode as string) === "persistent" ? "persistent" : "bounded";
  const iterationCap = mode === "persistent" ? MAX_PERSISTENT_ITERATIONS : MAX_ITERATIONS;
  const maxIterations = Math.min(
    iterationCap,
    Math.max(1, Number(node.data.maxIterations) || 3),
  );
  const passingScore = Math.min(
    10,
    Math.max(0, Number(node.data.passingScore) || DEFAULT_PASSING_SCORE),
  );
  const criteria = (node.data.criteria as EvalCriterion[]) ?? [];
  const includeHistory = node.data.includeHistory !== false;
  const outputVariable =
    (node.data.outputVariable as string) || "reflexive_result";

  // Persistent mode: verification commands (optional)
  const verificationCommands =
    mode === "persistent"
      ? ((node.data.verificationCommands as string[]) ?? []).filter(
          (c) => typeof c === "string" && c.trim(),
        )
      : [];

  // Resolve task input
  const inputVar = (node.data.inputVariable as string) || "";
  const taskInput = inputVar.trim()
    ? resolveTemplate(`{{${inputVar}}}`, context.variables)
    : (context.variables.last_message as string) ||
      (context.variables.user_input as string) ||
      "";

  const systemPrompt = (node.data.systemPrompt as string) || "";

  if (!taskInput) {
    return {
      messages: [
        { role: "assistant", content: "Reflexive loop skipped: no input provided." },
      ],
      nextNodeId: null,
      waitForInput: false,
    };
  }

  if (criteria.length === 0) {
    return {
      messages: [
        { role: "assistant", content: "Reflexive loop skipped: no evaluation criteria defined." },
      ],
      nextNodeId: null,
      waitForInput: false,
    };
  }

  // In persistent mode, set context variables for end-handler routing
  if (mode === "persistent") {
    context.variables.__persistent_mode = true;
    context.variables.__persistent_return_node = node.id;
    context.variables.__verifier_confirmed = false;
  }

  try {
    const { getModel } = await import("@/lib/ai");
    const { generateText } = await import("ai");

    const trajectory: IterationRecord[] = [];
    let currentOutput = "";
    let currentScore = 0;
    let passed = false;

    for (let iteration = 1; iteration <= maxIterations; iteration++) {
      const iterStart = performance.now();

      // ── Generate ──────────────────────────────────────────────────────
      let executorPrompt = "";

      if (iteration === 1) {
        executorPrompt = systemPrompt
          ? `${systemPrompt}\n\nTask: ${taskInput}`
          : taskInput;
      } else if (includeHistory) {
        // Include previous attempts + feedback for improvement
        const historyText = trajectory
          .map(
            (t) =>
              `--- Attempt ${t.iteration} (score: ${t.score}/10) ---\nOutput: ${t.output}\nFeedback: ${t.feedback}${
                t.verificationOutput
                  ? `\nVerification: ${t.verificationPassed ? "PASSED" : "FAILED"}\n${t.verificationOutput}`
                  : ""
              }`,
          )
          .join("\n\n");

        executorPrompt = `${systemPrompt ? systemPrompt + "\n\n" : ""}Task: ${taskInput}

Previous attempts and evaluator feedback:
${historyText}

Please produce an improved response that addresses the feedback. Focus on raising the quality score above ${passingScore}/10.`;
      } else {
        executorPrompt = `${systemPrompt ? systemPrompt + "\n\n" : ""}Task: ${taskInput}

Previous attempt scored ${currentScore}/10. Please produce a better response.`;
      }

      const { text: output } = await generateText({
        model: getModel(executorModel),
        prompt: executorPrompt,
        temperature: 0.4,
        maxOutputTokens: Number(node.data.maxTokens) || DEFAULT_MAX_TOKENS,
      });

      currentOutput = output;

      // ── Evaluate ──────────────────────────────────────────────────────
      const criteriaText = criteria
        .map(
          (c, i) =>
            `${i + 1}. ${c.name} (weight: ${c.weight}): ${c.description}`,
        )
        .join("\n");

      const evalPrompt = `You are a strict quality evaluator. Score this content on each criterion from 0-10.

ORIGINAL TASK: ${taskInput}

CONTENT TO EVALUATE:
${output}

CRITERIA:
${criteriaText}

Respond in valid JSON only, no markdown. Format:
{
  "scores": [{ "name": "<criterion>", "score": <0-10>, "reasoning": "<brief>" }],
  "overallScore": <weighted average 0-10>,
  "feedback": "<specific actionable feedback for improvement>"
}`;

      const { text: evalText } = await generateText({
        model: getModel(evaluatorModel),
        prompt: evalPrompt,
        temperature: 0.1,
        maxOutputTokens: 512,
      });

      // Parse evaluation
      let score = 0;
      let feedback = "Could not parse evaluation.";

      try {
        const cleaned = evalText
          .replace(/```json?\n?/g, "")
          .replace(/```\n?/g, "")
          .trim();
        const evalResult = JSON.parse(cleaned) as {
          overallScore: number;
          feedback: string;
        };
        score = evalResult.overallScore;
        feedback = evalResult.feedback;
      } catch {
        logger.warn("Reflexive loop: failed to parse evaluation", {
          agentId: context.agentId,
          iteration,
        });
        // Use a default low score to trigger retry
        score = 3;
        feedback = "Evaluation parse failed — retrying.";
      }

      // ── Verification commands (persistent mode only) ──────────────────
      let verificationPassed: boolean | undefined;
      let verificationOutput: string | undefined;

      if (
        score >= passingScore &&
        mode === "persistent" &&
        verificationCommands.length > 0
      ) {
        const verifyResult = await runVerificationCommands(
          verificationCommands,
          context.agentId,
        );
        verificationPassed = verifyResult.allPassed;
        verificationOutput = verifyResult.output;

        if (!verifyResult.allPassed) {
          // Override score — verification failure means we need another iteration
          score = Math.min(score, passingScore - 1);
          feedback = `AI evaluation passed (${score}/10) but verification commands failed:\n${verifyResult.output}\n\nOriginal feedback: ${feedback}`;
        }
      }

      currentScore = score;
      const iterDurationMs = Math.round(performance.now() - iterStart);

      trajectory.push({
        iteration,
        output,
        score,
        feedback,
        model: executorModel,
        durationMs: iterDurationMs,
        verificationPassed,
        verificationOutput,
      });

      logger.info("Reflexive loop iteration", {
        agentId: context.agentId,
        iteration,
        score,
        passingScore,
        mode,
        verificationPassed,
        durationMs: iterDurationMs,
      });

      if (score >= passingScore) {
        passed = true;
        break;
      }
    }

    // Safety cap reached in persistent mode — emit hook
    if (!passed && mode === "persistent") {
      emitHook(context, "onPersistentCap", {
        nodeId: node.id,
        nodeType: node.type,
        meta: {
          iterations: trajectory.length,
          lastScore: currentScore,
          passingScore,
        },
      });
    }

    // Clean up persistent state variables on exit (both passed and failed)
    const persistentCleanup: Record<string, unknown> =
      mode === "persistent"
        ? {
            __persistent_mode: false,
            __verifier_confirmed: passed,
            __persistent_return_node: null,
          }
        : {};

    const improved =
      trajectory.length > 1 &&
      trajectory[trajectory.length - 1].score > trajectory[0].score;

    return {
      messages: [
        {
          role: "assistant",
          content: currentOutput,
        },
      ],
      nextNodeId: passed ? "passed" : "failed",
      waitForInput: false,
      updatedVariables: {
        [outputVariable]: {
          finalOutput: currentOutput,
          finalScore: currentScore,
          iterations: trajectory.length,
          passed,
          improved,
          trajectory,
          mode,
        },
        ...persistentCleanup,
      },
    };
  } catch (error) {
    logger.error("Reflexive loop failed", error, {
      agentId: context.agentId,
    });

    // Clean up persistent state on error too
    const persistentCleanup: Record<string, unknown> =
      mode === "persistent"
        ? {
            __persistent_mode: false,
            __verifier_confirmed: false,
            __persistent_return_node: null,
          }
        : {};

    return {
      messages: [
        {
          role: "assistant",
          content:
            "I had trouble with the quality improvement loop, but here is my best attempt.",
        },
      ],
      nextNodeId: "failed",
      waitForInput: false,
      updatedVariables: {
        [outputVariable]: {
          error: error instanceof Error ? error.message : "Unknown error",
          success: false,
        },
        ...persistentCleanup,
      },
    };
  }
};
