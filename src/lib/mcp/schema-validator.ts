import { validateAgainstSchema } from "@/lib/sdlc/schemas";

interface JsonSchemaProperty {
  type?: string;
  description?: string;
}

interface JsonSchema {
  type?: string;
  required?: string[];
  properties?: Record<string, JsonSchemaProperty>;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validates args against the MCP tool's native JSON Schema from toolsCache.
 * Checks required fields are present and that types match (string/number/boolean/object/array).
 * Missing schema = always valid (backward compatible).
 */
export function validateMCPInputArgs(
  args: Record<string, unknown>,
  toolInputSchema: unknown,
): ValidationResult {
  if (!toolInputSchema || typeof toolInputSchema !== "object") {
    return { valid: true, errors: [] };
  }

  const schema = toolInputSchema as JsonSchema;
  const errors: string[] = [];

  if (Array.isArray(schema.required)) {
    for (const field of schema.required) {
      if (args[field] === undefined || args[field] === null || args[field] === "") {
        errors.push(`Required parameter "${field}" is missing or empty`);
      }
    }
  }

  if (schema.properties) {
    for (const [field, propSchema] of Object.entries(schema.properties)) {
      const value = args[field];
      if (value === undefined) continue;

      const expected = propSchema.type;
      if (!expected) continue;

      const actual = Array.isArray(value) ? "array" : typeof value;
      if (actual !== expected) {
        errors.push(
          `Parameter "${field}" expected type "${expected}", got "${actual}"`,
        );
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validates a value against a named Zod schema from the registry.
 * Returns valid=true (no errors) when schemaName is empty — backward compatible.
 */
export function validateNamedSchema(
  schemaName: string | undefined,
  value: unknown,
  label: string,
): ValidationResult {
  if (!schemaName || schemaName === "__none__") {
    return { valid: true, errors: [] };
  }

  const result = validateAgainstSchema(schemaName, value);
  if (result.success) {
    return { valid: true, errors: [] };
  }

  return {
    valid: false,
    errors: [`${label} schema validation failed (${schemaName}): ${result.error}`],
  };
}
