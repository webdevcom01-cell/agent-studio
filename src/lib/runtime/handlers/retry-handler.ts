import type { NodeHandler, RuntimeContext } from "../types";
import { getHandler } from "./index";
import type { FlowNode, FlowContent } from "@/types";

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_BASE_DELAY_MS = 1000;

interface PRGateIssue {
  severity: string;
  category: string;
  file: string;
  line?: number;
  message: string;
  fix: string;
}

/**
 * retry — Exponential backoff wrapper for any child node.
 *
 * When `enableEscalation` is true, each retry attempt injects progressively
 * richer feedback into `__retry_escalation`:
 *   Attempt 1 → PR Gate issues with concrete fixes + project context
 *   Attempt 2+ → everything above + sandbox errors + few-shot code examples
 */
export const retryHandler: NodeHandler = async (node, context) => {
  const targetNodeId = (node.data.targetNodeId as string) ?? "";
  const maxRetries = (node.data.maxRetries as number) ?? DEFAULT_MAX_RETRIES;
  const baseDelayMs = (node.data.baseDelayMs as number) ?? DEFAULT_BASE_DELAY_MS;
  const outputVariable = (node.data.outputVariable as string) || "";
  const enableEscalation = (node.data.enableEscalation as boolean) ?? false;
  const prGateVariable = (node.data.prGateVariable as string) || "gateResult";
  const sandboxErrorsVariable = (node.data.sandboxErrorsVariable as string) || "sandboxErrors";
  const projectContextVariable = (node.data.projectContextVariable as string) || "projectContext";
  const codeExamplesVariable = (node.data.codeExamplesVariable as string) || "codeExamples";
  const failureVariable = (node.data.failureVariable as string) || "";
  const failureValues: string[] = Array.isArray(node.data.failureValues)
    ? (node.data.failureValues as string[])
    : ["FAIL", "BLOCK"];

  if (!targetNodeId) {
    return {
      messages: [{ role: "assistant", content: "Retry node has no target node configured." }],
      nextNodeId: null,
      waitForInput: false,
    };
  }

  const targetNode = findNode(targetNodeId, context.flowContent);
  if (!targetNode) {
    return {
      messages: [{ role: "assistant", content: `Retry: target node "${targetNodeId}" not found.` }],
      nextNodeId: null,
      waitForInput: false,
    };
  }

  const handler = getHandler(targetNode.type);
  if (!handler) {
    return {
      messages: [{ role: "assistant", content: `Retry: no handler for node type "${targetNode.type}".` }],
      nextNodeId: null,
      waitForInput: false,
    };
  }

  let lastError = "";
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const callContext = buildCallContext(context, attempt, enableEscalation, {
        prGateVariable,
        sandboxErrorsVariable,
        projectContextVariable,
        codeExamplesVariable,
      });

      const result = await handler(targetNode, callContext);

      const hasStructuredFailure = isStructuredFailure(
        result.updatedVariables,
        failureVariable,
        failureValues,
      );
      const hasErrorPrefix = result.updatedVariables
        ? Object.values(result.updatedVariables).some(
            (v) => typeof v === "string" && v.startsWith("[Error:"),
          )
        : false;

      if (!hasStructuredFailure && !hasErrorPrefix) {
        const retryMeta = outputVariable ? { [`${outputVariable}_attempts`]: attempt + 1 } : {};
        return {
          ...result,
          updatedVariables: {
            ...context.variables,
            ...result.updatedVariables,
            ...retryMeta,
          },
        };
      }

      lastError = hasStructuredFailure
        ? `${failureVariable} = ${String(result.updatedVariables?.[failureVariable])}`
        : "Node returned an error result";
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }

    if (attempt < maxRetries) {
      const delayMs = baseDelayMs * Math.pow(2, attempt);
      const jitter = Math.round(delayMs * (Math.random() * 0.5 - 0.25));
      await new Promise((resolve) => setTimeout(resolve, delayMs + jitter));
    }
  }

  return {
    messages: [],
    nextNodeId: null,
    waitForInput: false,
    updatedVariables: {
      ...context.variables,
      ...(outputVariable
        ? {
            [outputVariable]: `[Error: Failed after ${maxRetries + 1} attempts: ${lastError}]`,
            [`${outputVariable}_attempts`]: maxRetries + 1,
          }
        : {}),
    },
  };
};

function buildCallContext(
  context: RuntimeContext,
  attempt: number,
  enableEscalation: boolean,
  config: {
    prGateVariable: string;
    sandboxErrorsVariable: string;
    projectContextVariable: string;
    codeExamplesVariable: string;
  },
): RuntimeContext {
  if (!enableEscalation || attempt === 0) return context;

  const escalation = buildEscalationContext(attempt, context.variables, config);
  return {
    ...context,
    variables: {
      ...context.variables,
      __retry_attempt: attempt,
      __retry_escalation: escalation,
    },
  };
}

function buildEscalationContext(
  attempt: number,
  variables: Record<string, unknown>,
  config: {
    prGateVariable: string;
    sandboxErrorsVariable: string;
    projectContextVariable: string;
    codeExamplesVariable: string;
  },
): string {
  const sections: string[] = [];

  sections.push(`## Retry Attempt ${attempt} — Apply All Feedback Below`);

  const prGateResult = variables[config.prGateVariable];
  if (prGateResult && typeof prGateResult === "object") {
    const gate = prGateResult as Record<string, unknown>;
    const issues = Array.isArray(gate.issues) ? (gate.issues as PRGateIssue[]) : [];
    if (issues.length > 0) {
      const issueLines = issues.map((issue) => {
        const loc = issue.line ? `:${issue.line}` : "";
        return `- [${issue.severity}] ${issue.file}${loc}: ${issue.message}\n  FIX: ${issue.fix}`;
      });
      sections.push(`## PR Gate Issues — Apply These Exact Fixes\n${issueLines.join("\n")}`);
    }
  }

  const projectContext = variables[config.projectContextVariable];
  if (typeof projectContext === "string" && projectContext.trim().length > 0) {
    sections.push(`## Project Conventions (MUST follow)\n${projectContext.trim()}`);
  }

  if (attempt >= 2) {
    const sandboxErrors = variables[config.sandboxErrorsVariable];
    if (Array.isArray(sandboxErrors) && sandboxErrors.length > 0) {
      const errorLines = (sandboxErrors as string[])
        .map((e, i) => `${i + 1}. ${e}`)
        .join("\n");
      sections.push(
        `## Sandbox Verification Errors — Fix Every One\n${errorLines}`,
      );
    }

    const codeExamples = variables[config.codeExamplesVariable];
    if (typeof codeExamples === "string" && codeExamples.trim().length > 0) {
      sections.push(
        `## Reference Code Examples (use these patterns)\n${codeExamples.trim()}`,
      );
    }
  }

  return sections.join("\n\n");
}

function isStructuredFailure(
  updatedVariables: Record<string, unknown> | undefined,
  failureVariable: string,
  failureValues: string[],
): boolean {
  if (!failureVariable || !updatedVariables) return false;
  return failureValues.includes(String(updatedVariables[failureVariable] ?? ""));
}

function findNode(nodeId: string, flowContent: FlowContent): FlowNode | undefined {
  return flowContent.nodes.find((n) => n.id === nodeId);
}
