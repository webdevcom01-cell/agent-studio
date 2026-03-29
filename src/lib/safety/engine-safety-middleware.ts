import { detectInjection } from "./injection-detector";
import { detectPII, redactPII } from "./pii-detector";
import { writeAuditLog } from "./audit-logger";
import { logger } from "@/lib/logger";

const SAFETY_ENABLED_KEY = "SAFETY_CHECK_ENABLED";

function isEnabled(): boolean {
  return process.env[SAFETY_ENABLED_KEY] !== "false";
}

export interface InputSafetyResult {
  safe: boolean;
  reason?: string;
  sanitized: string;
}

export interface OutputSafetyResult {
  safe: boolean;
  sanitized: string;
  piiRedacted: boolean;
}

/**
 * Pre-AI-call safety check: detects prompt injection in user input.
 * Non-blocking when disabled via SAFETY_CHECK_ENABLED=false.
 */
export async function checkInputSafety(
  input: string,
  agentId: string,
  nodeId: string,
): Promise<InputSafetyResult> {
  if (!isEnabled()) {
    return { safe: true, sanitized: input };
  }

  if (!input) {
    return { safe: true, sanitized: input };
  }

  const injResult = detectInjection(input);

  if (injResult.detected) {
    logger.warn("Engine safety: injection detected in AI input", {
      agentId,
      nodeId,
      patterns: injResult.patterns,
      severity: injResult.severity,
    });

    await writeAuditLog({
      action: "SAFETY_INPUT_BLOCKED",
      resourceType: "Agent",
      resourceId: agentId,
      after: {
        nodeId,
        reason: "prompt_injection",
        patterns: injResult.patterns,
        severity: injResult.severity,
      },
    }).catch(() => {});

    return {
      safe: false,
      reason: `Prompt injection detected: ${injResult.patterns.join(", ")}`,
      sanitized: input,
    };
  }

  return { safe: true, sanitized: input };
}

/**
 * Post-AI-call safety check: redacts PII from AI output.
 * Always returns safe: true — PII redaction is non-blocking.
 */
export async function checkOutputSafety(
  output: string,
  agentId: string,
  nodeId: string,
): Promise<OutputSafetyResult> {
  if (!isEnabled()) {
    return { safe: true, sanitized: output, piiRedacted: false };
  }

  if (!output) {
    return { safe: true, sanitized: output, piiRedacted: false };
  }

  const piiMatches = detectPII(output);

  if (piiMatches.length > 0) {
    const sanitized = redactPII(output, piiMatches);

    logger.info("Engine safety: PII redacted from AI output", {
      agentId,
      nodeId,
      piiCount: piiMatches.length,
      types: piiMatches.map((m) => m.type),
    });

    await writeAuditLog({
      action: "SAFETY_OUTPUT_REDACTED",
      resourceType: "Agent",
      resourceId: agentId,
      after: {
        nodeId,
        piiCount: piiMatches.length,
        piiTypes: piiMatches.map((m) => m.type),
      },
    }).catch(() => {});

    return { safe: true, sanitized, piiRedacted: true };
  }

  return { safe: true, sanitized: output, piiRedacted: false };
}
