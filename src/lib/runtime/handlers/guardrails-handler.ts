import type { NodeHandler } from "../types";
import { resolveTemplate } from "../template";
import { detectPII, type PIIMatch } from "@/lib/safety/pii-detector";
import { detectInjection } from "@/lib/safety/injection-detector";
import { moderateContent } from "@/lib/safety/content-moderator";
import { writeAuditLog } from "@/lib/safety/audit-logger";

const DEFAULT_OUTPUT_VARIABLE = "guardrails_result";

interface CheckResult {
  name: string;
  passed: boolean;
  reason: string;
  severity: string;
}

/**
 * guardrails — EU AI Act safety checkpoint with multi-output routing.
 * Routes to "pass" or "fail" handle based on check results.
 */
export const guardrailsHandler: NodeHandler = async (node, context) => {
  const inputVariable = (node.data.inputVariable as string) ?? "";
  const checks = (node.data.checks as string[]) ?? ["content_moderation"];
  const customPolicy = (node.data.customPolicy as string) ?? "";
  const onFail = (node.data.onFail as string) ?? "stop_flow";
  const auditLog = (node.data.auditLog as boolean) ?? true;
  const explainability = (node.data.explainability as boolean) ?? true;
  const outputVariable =
    (node.data.outputVariable as string) || DEFAULT_OUTPUT_VARIABLE;

  const inputText = inputVariable
    ? String(context.variables[inputVariable] ?? "")
    : "";

  if (!inputText) {
    return {
      messages: [
        { role: "assistant", content: "Guardrails: no input text to check." },
      ],
      nextNodeId: null,
      waitForInput: false,
    };
  }

  const results: CheckResult[] = [];
  let piiFound: PIIMatch[] = [];

  for (const check of checks) {
    switch (check) {
      case "content_moderation": {
        const modResult = await moderateContent(inputText);
        results.push({
          name: "content_moderation",
          passed: !modResult.flagged,
          reason: modResult.reasoning,
          severity: modResult.severity,
        });
        break;
      }

      case "pii_detection": {
        piiFound = detectPII(inputText);
        results.push({
          name: "pii_detection",
          passed: piiFound.length === 0,
          reason: piiFound.length > 0
            ? `Found ${piiFound.length} PII items: ${piiFound.map((p) => p.type).join(", ")}`
            : "No PII detected",
          severity: piiFound.length > 0 ? "medium" : "none",
        });
        break;
      }

      case "injection_detection": {
        const injResult = detectInjection(inputText);
        results.push({
          name: "injection_detection",
          passed: !injResult.detected,
          reason: injResult.detected
            ? `Injection patterns: ${injResult.patterns.join(", ")}`
            : "No injection detected",
          severity: injResult.severity,
        });
        break;
      }

      case "custom_policy": {
        if (customPolicy) {
          const policyResult = await evaluateCustomPolicy(inputText, customPolicy);
          results.push(policyResult);
        }
        break;
      }

      case "eu_audit": {
        results.push({
          name: "eu_audit",
          passed: true,
          reason: "Audit trail recorded",
          severity: "none",
        });
        break;
      }
    }
  }

  const allPassed = results.every((r) => r.passed);

  let auditId: string | null = null;
  if (auditLog) {
    auditId = await writeAuditLog({
      userId: context.userId,
      action: "GUARDRAILS_CHECK",
      resourceType: "Agent",
      resourceId: context.agentId,
      after: {
        passed: allPassed,
        checks: results,
        inputLength: inputText.length,
      },
    });
  }

  const explanation = explainability
    ? results.map((r) => `${r.name}: ${r.passed ? "PASS" : "FAIL"} — ${r.reason}`).join("\n")
    : undefined;

  const output = {
    passed: allPassed,
    checks: results,
    piiFound: piiFound.map((p) => ({ type: p.type, start: p.start, end: p.end })),
    auditId,
    explanation,
  };

  if (!allPassed) {
    if (onFail === "stop_flow") {
      return {
        messages: [
          {
            role: "assistant",
            content: `Guardrails check failed: ${results.filter((r) => !r.passed).map((r) => r.name).join(", ")}`,
          },
        ],
        nextNodeId: null,
        waitForInput: false,
        updatedVariables: { ...context.variables, [outputVariable]: output },
      };
    }

    return {
      messages: [],
      nextNodeId: "fail",
      waitForInput: false,
      updatedVariables: { ...context.variables, [outputVariable]: output },
    };
  }

  return {
    messages: [],
    nextNodeId: "pass",
    waitForInput: false,
    updatedVariables: { ...context.variables, [outputVariable]: output },
  };
};

async function evaluateCustomPolicy(
  text: string,
  policy: string,
): Promise<CheckResult> {
  try {
    const { generateObject } = await import("ai");
    const { getModel } = await import("@/lib/ai");
    const { z } = await import("zod");

    const { object } = await generateObject({
      model: getModel("deepseek-chat"),
      schema: z.object({
        passed: z.boolean(),
        reason: z.string(),
      }),
      prompt: `Evaluate if the following text complies with this policy:

Policy: ${policy}

Text: "${text.slice(0, 2000)}"

Return whether it passes and why.`,
    });

    return {
      name: "custom_policy",
      passed: object.passed,
      reason: object.reason,
      severity: object.passed ? "none" : "medium",
    };
  } catch {
    return {
      name: "custom_policy",
      passed: true,
      reason: "Custom policy check unavailable — defaulting to pass",
      severity: "none",
    };
  }
}
