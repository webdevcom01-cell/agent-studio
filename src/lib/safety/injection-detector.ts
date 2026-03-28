export interface InjectionResult {
  detected: boolean;
  patterns: string[];
  severity: "low" | "medium" | "high";
}

const INJECTION_PATTERNS: { pattern: RegExp; label: string; severity: "low" | "medium" | "high" }[] = [
  { pattern: /ignore\s+(all\s+)?previous\s+instructions/i, label: "ignore_previous", severity: "high" },
  { pattern: /disregard\s+(all\s+)?(prior|above|previous)/i, label: "disregard_prior", severity: "high" },
  { pattern: /you\s+are\s+now\s+(?:a|an)\s+/i, label: "role_override", severity: "high" },
  { pattern: /system\s*:\s*you\s+are/i, label: "system_prompt_inject", severity: "high" },
  { pattern: /\[INST\]|\[\/INST\]|<\|system\|>|<\|user\|>/i, label: "template_inject", severity: "high" },
  { pattern: /do\s+not\s+follow\s+(your|the)\s+(rules|guidelines|instructions)/i, label: "rule_override", severity: "medium" },
  { pattern: /pretend\s+(you\s+are|to\s+be)/i, label: "pretend_role", severity: "medium" },
  { pattern: /forget\s+(everything|all|your\s+instructions)/i, label: "forget_instructions", severity: "medium" },
  { pattern: /\bDAN\b.*\bjailbreak\b|\bjailbreak\b.*\bDAN\b/i, label: "jailbreak_dan", severity: "high" },
  { pattern: /base64\s*decode|eval\s*\(/i, label: "code_injection", severity: "medium" },
  { pattern: /repeat\s+after\s+me\s*:/i, label: "echo_attack", severity: "low" },
];

export function detectInjection(text: string): InjectionResult {
  const matched: string[] = [];
  let maxSeverity: "low" | "medium" | "high" = "low";

  for (const entry of INJECTION_PATTERNS) {
    if (entry.pattern.test(text)) {
      matched.push(entry.label);
      if (entry.severity === "high") maxSeverity = "high";
      else if (entry.severity === "medium" && maxSeverity !== "high") maxSeverity = "medium";
    }
  }

  return {
    detected: matched.length > 0,
    patterns: matched,
    severity: matched.length > 0 ? maxSeverity : "low",
  };
}
