import type { NodeHandler } from "../types";
import { resolveTemplate } from "../template";
import { logger } from "@/lib/logger";

interface EvalCriterion {
  name: string;
  description: string;
  weight: number;
}

export const evaluatorHandler: NodeHandler = async (node, context) => {
  let inputVariable = ((node.data.inputVariable as string) ?? "").trim();
  const outputVariable = (node.data.outputVariable as string) ?? "eval_result";
  const modelId = (node.data.model as string) ?? "";
  const passingScore = Math.min(10, Math.max(0, Number(node.data.passingScore) || 7));

  // Auto-strip template syntax: "{{risk_assessment}}" → "risk_assessment"
  if (inputVariable.startsWith("{{") && inputVariable.endsWith("}}")) {
    const extracted = inputVariable.slice(2, -2).trim();
    logger.info("inputVariable contained template syntax — extracted variable name", {
      nodeId: node.id,
      original: inputVariable,
      extracted,
    });
    inputVariable = extracted;
  }

  // Normalize criteria: accept string[] (legacy) or EvalCriterion[]
  const criteria = normalizeCriteria(node.data.criteria, node.id);

  // Get the input value to evaluate
  const inputTemplate = inputVariable
    ? resolveTemplate(`{{${inputVariable}}}`, context.variables)
    : "";

  if (!inputTemplate) {
    return {
      messages: [
        {
          role: "assistant",
          content: "Evaluation skipped: no input to evaluate.",
        },
      ],
      nextNodeId: null,
      waitForInput: false,
    };
  }

  if (criteria.length === 0) {
    return {
      messages: [
        {
          role: "assistant",
          content:
            "Evaluator node requires at least one criterion. Add criteria in the property panel.",
        },
      ],
      nextNodeId: null,
      waitForInput: false,
    };
  }

  try {
    const { getModel } = await import("@/lib/ai");
    const { generateText } = await import("ai");

    const model = getModel(modelId || "deepseek-chat");

    const criteriaText = criteria
      .map(
        (c, i) =>
          `${i + 1}. ${c.name} (weight: ${c.weight}): ${c.description}`
      )
      .join("\n");

    const prompt = `You are an evaluation judge. Score the following content on each criterion from 0-10.

CONTENT TO EVALUATE:
${inputTemplate}

CRITERIA:
${criteriaText}

Respond in valid JSON only, no markdown. Format:
{
  "scores": [
    { "name": "<criterion name>", "score": <0-10>, "reasoning": "<brief reasoning>" }
  ],
  "overallScore": <weighted average 0-10>,
  "summary": "<1-2 sentence overall assessment>"
}`;

    const { text } = await generateText({
      model,
      prompt,
      temperature: 0.1,
      maxOutputTokens: 1024,
    });

    // Parse AI response
    let evalResult: {
      scores: Array<{ name: string; score: number; reasoning: string }>;
      overallScore: number;
      summary: string;
    };

    try {
      // Strip markdown code fences if present
      const cleaned = text.replace(/```json?\n?/g, "").replace(/```\n?/g, "").trim();
      evalResult = JSON.parse(cleaned);
    } catch {
      logger.warn("Failed to parse evaluation response", {
        agentId: context.agentId,
      });

      return {
        messages: [
          {
            role: "assistant",
            content: "Evaluation completed but the result could not be parsed.",
          },
        ],
        nextNodeId: null,
        waitForInput: false,
        updatedVariables: {
          [outputVariable]: { raw: text, parseError: true },
          __last_eval: { success: false, parseError: true },
        },
      };
    }

    const passed = evalResult.overallScore >= passingScore;

    // Route based on pass/fail via sourceHandle
    const nextHandle = passed ? "passed" : "failed";

    return {
      messages: [],
      nextNodeId: nextHandle,
      waitForInput: false,
      updatedVariables: {
        [outputVariable]: evalResult,
        __last_eval: {
          success: true,
          overallScore: evalResult.overallScore,
          passed,
          passingScore,
          criteriaCount: criteria.length,
        },
      },
    };
  } catch (error) {
    logger.error("Evaluation failed", error, {
      agentId: context.agentId,
    });

    return {
      messages: [
        {
          role: "assistant",
          content: "I had trouble evaluating the content, but I'll continue.",
        },
      ],
      nextNodeId: null,
      waitForInput: false,
      updatedVariables: {
        [outputVariable]: null,
        __last_eval: { success: false },
      },
    };
  }
};

/**
 * Normalizes criteria input — accepts EvalCriterion[] or string[] (legacy).
 * Converts string[] to EvalCriterion[] with default weight 1.
 */
function normalizeCriteria(
  raw: unknown,
  nodeId: string,
): EvalCriterion[] {
  if (!Array.isArray(raw)) return [];
  if (raw.length === 0) return [];

  // Check if it's a string array (legacy format)
  if (typeof raw[0] === "string") {
    logger.warn("Evaluator criteria are strings — auto-converting to structured format", {
      nodeId,
      count: raw.length,
    });
    return (raw as string[]).map((s) => ({
      name: s,
      description: s,
      weight: 1,
    }));
  }

  // Already EvalCriterion[]
  return raw as EvalCriterion[];
}
