// Server-side only — do NOT import in client components ("use client")

type LogLevel = "info" | "warn" | "error";

interface LogContext {
  agentId?: string;
  conversationId?: string;
  userId?: string;
  [key: string]: unknown;
}

function formatLog(level: LogLevel, message: string, context?: LogContext): string {
  const entry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...context,
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
    process.stdout.write(
      formatLog("error", message, { ...context, ...errorInfo }) + "\n"
    );
  },
};
