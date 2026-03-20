export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { validateEnv } = await import("@/lib/env");
    validateEnv();

    // Initialize OTEL metrics flusher when endpoint is configured
    if (process.env.OTEL_EXPORTER_OTLP_ENDPOINT) {
      const { logger } = await import("@/lib/logger");
      logger.info("OTEL export enabled", {
        endpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT.replace(/\/\/.*@/, "//***@"),
        serviceName: process.env.OTEL_SERVICE_NAME ?? "agent-studio",
      });
    }
  }
}
