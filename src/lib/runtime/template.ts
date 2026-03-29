export function resolveTemplate(
  template: string,
  variables: Record<string, unknown>
): string {
  return template.replace(/\{\{([\w-]+(?:[\.\[][\w-\]]+)*)\}\}/g, (_, path: string) => {
    const parts = path
      .replace(/\[/g, ".")
      .replace(/\]/g, "")
      .split(".")
      .filter(Boolean);

    let value: unknown = variables;
    for (let i = 0; i < parts.length; i++) {
      if (value == null) {
        return `{{${path}}}`;
      }

      // If value is a string and we still have nested parts to resolve,
      // attempt JSON.parse — handles call_agent output stored as JSON string
      if (typeof value === "string" && i > 0) {
        const parsed = tryParseJSON(value);
        if (parsed !== null) {
          value = parsed;
        } else {
          return `{{${path}}}`;
        }
      }

      if (typeof value !== "object" && !Array.isArray(value)) {
        return `{{${path}}}`;
      }

      value = (value as Record<string, unknown>)[parts[i]];
    }

    if (value == null) return `{{${path}}}`;
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
  });
}

/**
 * Attempts to parse a string as JSON.
 * Returns the parsed value if it's an object/array, null otherwise.
 * Never throws.
 */
function tryParseJSON(str: string): Record<string, unknown> | unknown[] | null {
  const trimmed = str.trimStart();
  if (trimmed[0] !== "{" && trimmed[0] !== "[") return null;

  try {
    const parsed: unknown = JSON.parse(str);
    if (typeof parsed === "object" && parsed !== null) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}
