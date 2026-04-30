import type { NodeHandler } from "../types";
import { resolveTemplate } from "../template";
import { detectPII, redactPII, type PIIMatch } from "@/lib/safety/pii-detector";
import { detectInjection } from "@/lib/safety/injection-detector";
import { moderateContent } from "@/lib/safety/content-moderator";
import { writeAuditLog } from "@/lib/safety/audit-logger";
import { logger } from "@/lib/logger";

const DEFAULT_OUTPUT_VARIABLE = "guardrails_result";

type ActionMode = "block" | "warn" | "redact";

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

  // Per-module action configuration
  const injectionAction = (node.data.injectionAction as ActionMode) ?? "block";
  const moderationAction = (node.data.moderationAction as ActionMode) ?? "block";
  const piiAction = (node.data.piiAction as ActionMode) ?? "redact";

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
  let cleanedText = inputText;
  let blocked = false;
  let blockReason = "";

  // ── 1. Injection detection (first — most critical) ──────────────────────
  if (checks.includes("injection_detection")) {
    const injResult = detectInjection(inputText);
    const injPassed = !injResult.detected || injectionAction === "warn";
    results.push({
      name: "injection_detection",
      passed: injPassed,
      reason: injResult.detected
        ? `Injection patterns: ${injResult.patterns.join(", ")} (action: ${injectionAction})`
        : "No injection detected",
      severity: injResult.severity,
    });

    if (injResult.detected) {
      if (injectionAction === "block") {
        blocked = true;
        blockReason = "Input blocked: prompt injection detected";
      } else {
        logger.warn("Guardrails injection warning (non-blocking)", {
          agentId: context.agentId,
          patterns: injResult.patterns,
        });
      }
    }
  }

  // ── 2. Content moderation ───────────────────────────────────────────────
  if (!blocked && checks.includes("content_moderation")) {
    const modResult = await moderateContent(inputText);
    const modPassed = !modResult.flagged || moderationAction === "warn";
    results.push({
      name: "content_moderation",
      passed: modPassed,
      reason: modResult.reasoning,
      severity: modResult.severity,
    });

    if (modResult.flagged) {
      if (moderationAction === "block") {
        blocked = true;
        blockReason = "Input blocked: content policy violation";
      } else {
        logger.warn("Guardrails moderation warning (non-blocking)", {
          agentId: context.agentId,
          categories: modResult.categories,
        });
      }
    }
  }

  // ── 3. PII detection ────────────────────────────────────────────────────
  if (!blocked && checks.includes("pii_detection")) {
    piiFound = detectPII(inputText);
    const hasPII = piiFound.length > 0;
    // PII check "passes" when no PII found, OR when PII is redacted/warned (handled)
    const piiPassed = !hasPII || piiAction === "redact" || piiAction === "warn";
    results.push({
      name: "pii_detection",
      passed: piiPassed,
      reason: hasPII
        ? `Found ${piiFound.length} PII items: ${piiFound.map((p) => p.type).join(", ")} (action: ${piiAction})`
        : "No PII detected",
      severity: hasPII ? "medium" : "none",
    });

    if (hasPII) {
      if (piiAction === "block") {
        blocked = true;
        blockReason = "Input blocked: PII detected";
      } else if (piiAction === "redact") {
        cleanedText = redactPII(inputText, piiFound);
        logger.info("Guardrails PII redacted", {
          agentId: context.agentId,
          piiCount: piiFound.length,
          types: piiFound.map((p) => p.type),
        });
      } else {
        logger.warn("Guardrails PII warning (non-blocking)", {
          agentId: context.agentId,
          piiCount: piiFound.length,
        });
      }
    }
  }

  // ── 4. Custom policy ────────────────────────────────────────────────────
  if (!blocked && checks.includes("custom_policy") && customPolicy) {
    const policyResult = await evaluateCustomPolicy(inputText, customPolicy);
    results.push(policyResult);
    if (!policyResult.passed) {
      blocked = true;
      blockReason = `Custom policy violation: ${policyResult.reason}`;
    }
  }

  // ── 5. EU audit trail ───────────────────────────────────────────────────
  if (checks.includes("eu_audit")) {
    results.push({
      name: "eu_audit",
      passed: true,
      reason: "Audit trail recorded",
      severity: "none",
    });
  }

  const allPassed = !blocked && results.every((r) => r.passed);

  // ── 6. Audit log ────────────────────────────────────────────────────────
  let auditId: string | null = null;
  if (auditLog) {
    auditId = await writeAuditLog({
      userId: context.userId,
      action: "GUARDRAILS_CHECK",
      resourceType: "Agent",
      resourceId: context.agentId,
      after: {
        passed: allPassed,
        blocked,
        checks: results,
        inputLength: inputText.length,
        piiRedacted: cleanedText !== inputText,
      },
    });
  }

  const explanation = explainability
    ? results.map((r) => `${r.name}: ${r.passed ? "PASS" : "FAIL"} — ${r.reason}`).join("\n")
    : undefined;

  const output = {
    passed: allPassed,
    blocked,
    checks: results,
    piiFound: piiFound.map((p) => ({ type: p.type, start: p.start, end: p.end })),
    cleanedText: cleanedText !== inputText ? cleanedText : undefined,
    auditId,
    explanation,
  };

  if (blocked || !allPassed) {
    if (onFail === "stop_flow") {
      return {
        messages: [
          {
            role: "assistant",
            content: blockReason || `Guardrails check failed: ${results.filter((r) => !r.passed).map((r) => r.name).join(", ")}`,
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

  // Pass — store cleaned text (redacted if PII was found) for downstream nodes
  return {
    messages: [],
    nextNodeId: "pass",
    waitForInput: false,
    updatedVariables: {
      ...context.variables,
      [outputVariable]: output,
      ...(cleanedText !== inputText && inputVariable
        ? { [inputVariable]: cleanedText }
        : {}),
    },
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
      model: getModel("gpt-4.1-mini"),
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
