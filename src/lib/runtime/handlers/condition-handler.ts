import type { NodeHandler } from "../types";

interface ConditionBranch {
  id: string;
  variable: string;
  operator: string;
  value: string;
}

function evaluateCondition(
  branch: ConditionBranch,
  variables: Record<string, unknown>
): boolean {
  const varValue = variables[branch.variable];
  const compareValue = branch.value;

  switch (branch.operator) {
    case "equals":
      return String(varValue) === compareValue;
    case "not_equals":
      return String(varValue) !== compareValue;
    case "contains":
      return String(varValue ?? "").includes(compareValue);
    case "greater_than":
      return Number(varValue) > Number(compareValue);
    case "less_than":
      return Number(varValue) < Number(compareValue);
    case "is_set":
      return varValue != null && varValue !== "";
    case "is_empty":
      return varValue == null || varValue === "";
    default:
      return false;
  }
}

export const conditionHandler: NodeHandler = async (node, context) => {
  const branches = (node.data.branches as ConditionBranch[]) ?? [];

  for (const branch of branches) {
    if (evaluateCondition(branch, context.variables)) {
      const edge = context.flowContent.edges.find(
        (e) => e.source === node.id && e.sourceHandle === branch.id
      );
      return {
        messages: [],
        nextNodeId: edge?.target ?? null,
        waitForInput: false,
      };
    }
  }

  const elseEdge = context.flowContent.edges.find(
    (e) => e.source === node.id && e.sourceHandle === "else"
  );

  if (elseEdge) {
    return { messages: [], nextNodeId: elseEdge.target, waitForInput: false };
  }

  return {
    messages: [{ role: "assistant", content: "I'm not sure how to proceed." }],
    nextNodeId: null,
    waitForInput: false,
  };
};
