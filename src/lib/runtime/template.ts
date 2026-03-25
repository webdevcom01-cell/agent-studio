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
    for (const part of parts) {
      if (value == null || (typeof value !== "object" && !Array.isArray(value))) {
        return `{{${path}}}`;
      }
      value = (value as Record<string, unknown>)[part];
    }
    if (value == null) return `{{${path}}}`;
    return String(value);
  });
}
