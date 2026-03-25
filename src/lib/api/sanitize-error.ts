import { logger } from "@/lib/logger";

const GENERIC_MESSAGE = "An internal error occurred";

export function sanitizeErrorMessage(
  error: unknown,
  context?: string
): string {
  const err =
    error instanceof Error ? error : new Error(String(error));

  logger.error(context ?? "Unhandled error", err);

  if (process.env.NODE_ENV !== "production") {
    return err.message;
  }

  return GENERIC_MESSAGE;
}
