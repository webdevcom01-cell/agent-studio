// Server-side only — do NOT import in client components ("use client")

type LogLevel = "info" | "warn" | "error";

interface LogContext {
  agentId?: string;
  conversationId?: string;
  userId?: string;
  [key: string]: unknown;
}

const SENSITIVE_KEY_RE = /apiKey|api_key|token|secret|password|authorization|cookie|credential/i;
const SENSITIVE_VALUE_PREFIXES = ["sk-", "pk-", "ghp_", "gho_"];
const REDACTED = "[REDACTED]";

export function sanitizeLogData(data: unknown): unknown {
  if (data === null || data === undefined) return data;

  if (typeof data === "string") {
    if (SENSITIVE_VALUE_PREFIXES.some((prefix) => data.startsWith(prefix))) {
      return REDACTED;
    }
    return data;
  }

  if (typeof data !== "object") return data;

  if (Array.isArray(data)) {
    return data.map(sanitizeLogData);
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    if (SENSITIVE_KEY_RE.test(key)) {
      result[key] = REDACTED;
    } else {
      result[key] = sanitizeLogData(value);
    }
  }
  return result;
}

function formatLog(level: LogLevel, message: string, context?: LogContext): string {
  const sanitized = context ? sanitizeLogData(context) as LogContext : undefined;
  const entry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...sanitized,
  };
  return JSON.stringify(entry);
}

export const logger = {
  info(message: string, context?: LogContext): void {
    process.stdout.write(formatLog("info", message, context) + "\n");
  },
  warn(message: string, context?: LogContext): void {
    process.stdout.write(formatLog("warn", message, context) + "\n");
  },
  error(message: string, error?: unknown, context?: LogContext): void {
    const errorInfo =
      error instanceof Error
        ? { errorMessage: error.message, stack: error.stack }
        : error !== undefined
          ? { errorMessage: String(error) }
          : {};
    const merged = { ...context, ...errorInfo };
    process.stdout.write(
      formatLog("error", message, sanitizeLogData(merged) as LogContext) + "\n"
    );
  },
};
