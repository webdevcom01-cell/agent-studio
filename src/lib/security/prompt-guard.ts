const INJECTION_PATTERNS: RegExp[] = [
  /ignore\s+(all\s+)?previous\s+instructions/i,
  /disregard\s+(all\s+)?prior\s+(instructions|rules)/i,
  /you\s+are\s+now\s+(a|an)\s+/i,
  /system\s*:\s*you\s+are/i,
  /\[INST\]/i,
  /<\|im_start\|>/i,
  /<<SYS>>/i,
  /\bBEGIN\s+INJECTION\b/i,
  /\bENTER\s+ADMIN\s+MODE\b/i,
  /\bDAN\s+MODE\b/i,
  /\bJAILBREAK\b/i,
];

const PII_PATTERNS: { pattern: RegExp; replacement: string }[] = [
  { pattern: /\b\d{3}-\d{2}-\d{4}\b/g, replacement: "[SSN_REDACTED]" },
  { pattern: /\b\d{16}\b/g, replacement: "[CARD_REDACTED]" },
  { pattern: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, replacement: "[CARD_REDACTED]" },
  { pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, replacement: "[EMAIL_REDACTED]" },
  { pattern: /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g, replacement: "[PHONE_REDACTED]" },
];

export interface PromptGuardResult {
  safe: boolean;
  threats: string[];
}

export function detectPromptInjection(input: string): PromptGuardResult {
  const threats: string[] = [];

  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(input)) {
      threats.push(pattern.source);
    }
  }

  return {
    safe: threats.length === 0,
    threats,
  };
}

export function sanitizeOutput(text: string): string {
  let sanitized = text;
  for (const { pattern, replacement } of PII_PATTERNS) {
    sanitized = sanitized.replace(pattern, replacement);
  }
  return sanitized;
}

export function validateSkillInput(
  input: unknown,
  schema: { name: string; type: string; required?: boolean }[]
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!input || typeof input !== "object") {
    return { valid: false, errors: ["Input must be an object"] };
  }

  const data = input as Record<string, unknown>;

  for (const field of schema) {
    const value = data[field.name];

    if (field.required && (value === undefined || value === null || value === "")) {
      errors.push(`Missing required field: ${field.name}`);
      continue;
    }

    if (value !== undefined && value !== null) {
      const actualType = typeof value;
      if (field.type === "string" && actualType !== "string") {
        errors.push(`Field ${field.name} must be a string, got ${actualType}`);
      } else if (field.type === "number" && actualType !== "number") {
        errors.push(`Field ${field.name} must be a number, got ${actualType}`);
      } else if (field.type === "boolean" && actualType !== "boolean") {
        errors.push(`Field ${field.name} must be a boolean, got ${actualType}`);
      }

      if (actualType === "string") {
        const guard = detectPromptInjection(value as string);
        if (!guard.safe) {
          errors.push(`Potential prompt injection in field ${field.name}`);
        }
      }
    }
  }

  return { valid: errors.length === 0, errors };
}
