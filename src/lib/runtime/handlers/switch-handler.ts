import type { FlowNode } from "@/types";
import type { RuntimeContext, ExecutionResult } from "../types";
import { resolveTemplate } from "../template";
import { logger } from "@/lib/logger";

interface SwitchCase {
  value: string;
  label?: string;
}

export const switchHandler = async (
  node: FlowNode,
  context: RuntimeContext
): Promise<ExecutionResult> => {
  const variable = (node.data.variable as string) || "";
  const outputVariable = (node.data.outputVariable as string) || "switch_result";
  const cases = (node.data.cases as SwitchCase[]) || [];
  const operator = (node.data.operator as string) || "equals";

  if (!variable) {
    logger.warn("Switch: no variable specified", { nodeId: node.id });
    return {
      messages: [{ role: "assistant", content: "⚠️ Switch skipped — no variable specified." }],
      nextNodeId: null,
      waitForInput: false,
      updatedVariables: {
        [outputVariable]: { matched: false, reason: "no_variable" },
      },
    };
  }

  // Resolve the variable value
  const resolved = resolveTemplate(`{{${variable}}}`, context.variables);
  const actualValue = resolved === `{{${variable}}}` ? "" : resolved;

  if (cases.length === 0) {
    logger.warn("Switch: no cases defined", { nodeId: node.id });
    return {
      messages: [{ role: "assistant", content: "⚠️ Switch has no cases defined." }],
      nextNodeId: null,
      waitForInput: false,
      updatedVariables: {
        [outputVariable]: { matched: false, value: actualValue, reason: "no_cases" },
      },
    };
  }

  // Find matching case
  let matchedIndex = -1;
  for (let i = 0; i < cases.length; i++) {
    const caseValue = resolveTemplate(cases[i].value, context.variables);
    if (matchesCase(actualValue, caseValue, operator)) {
      matchedIndex = i;
      break;
    }
  }

  // Build sourceHandle — "case_0", "case_1", ..., or "default"
  const sourceHandle = matchedIndex >= 0 ? `case_${matchedIndex}` : "default";
  const matchedCase = matchedIndex >= 0 ? cases[matchedIndex] : null;

  logger.info("Switch evaluated", {
    nodeId: node.id,
    variable,
    value: actualValue,
    matchedIndex,
    sourceHandle,
  });

  return {
    messages: [],
    nextNodeId: sourceHandle,
    waitForInput: false,
    updatedVariables: {
      [outputVariable]: {
        matched: matchedIndex >= 0,
        value: actualValue,
        matchedCase: matchedCase?.value ?? null,
        matchedLabel: matchedCase?.label ?? null,
        caseIndex: matchedIndex,
      },
    },
  };
};

function matchesCase(actual: string, expected: string, operator: string): boolean {
  const a = actual.toLowerCase();
  const e = expected.toLowerCase();

  switch (operator) {
    case "equals":
      return a === e;
    case "contains":
      return a.includes(e);
    case "starts_with":
      return a.startsWith(e);
    case "ends_with":
      return a.endsWith(e);
    case "regex": {
      try {
        return new RegExp(expected, "i").test(actual);
      } catch {
        return false;
      }
    }
    case "gt":
      return Number(actual) > Number(expected);
    case "gte":
      return Number(actual) >= Number(expected);
    case "lt":
      return Number(actual) < Number(expected);
    case "lte":
      return Number(actual) <= Number(expected);
    default:
      return a === e;
  }
}
