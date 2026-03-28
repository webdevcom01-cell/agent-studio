import type { NodeHandler } from "../types";
import { resolveTemplate } from "../template";
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
}

const MAX_ITERATIONS = 5;
const DEFAULT_PASSING_SCORE = 7;
const DEFAULT_MAX_TOKENS = 2000;

/**
 * reflexive_loop — Self-correcting node that generates output, evaluates quality,
 * and retries with feedback until the passing score is reached or max iterations hit.
 *
 * Combines ai_response + evaluator + retry into a single composable node.
 * Routes to "passed" on quality pass, "failed" on max iterations exhausted.
 */
export const reflexiveLoopHandler: NodeHandler = async (node, context) => {
  const executorModel = (node.data.executorModel as string) || "deepseek-chat";
  const evaluatorModel = (node.data.evaluatorModel as string) || "deepseek-chat";
  const maxIterations = Math.min(
    MAX_ITERATIONS,
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
              `--- Attempt ${t.iteration} (score: ${t.score}/10) ---\nOutput: ${t.output}\nFeedback: ${t.feedback}`,
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

      currentScore = score;
      const iterDurationMs = Math.round(performance.now() - iterStart);

      trajectory.push({
        iteration,
        output,
        score,
        feedback,
        model: executorModel,
        durationMs: iterDurationMs,
      });

      logger.info("Reflexive loop iteration", {
        agentId: context.agentId,
        iteration,
        score,
        passingScore,
        durationMs: iterDurationMs,
      });

      if (score >= passingScore) {
        passed = true;
        break;
      }
    }

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
        },
      },
    };
  } catch (error) {
    logger.error("Reflexive loop failed", error, {
      agentId: context.agentId,
    });

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
      },
    };
  }
};
