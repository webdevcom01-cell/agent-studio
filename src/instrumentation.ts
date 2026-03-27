// Next.js instrumentation hook — runs once per server startup
// Uses custom OTLP push implementation (not @opentelemetry/sdk-node)
// because the full SDK conflicts with Next.js edge runtime in 15.5.
//
// The observability module (src/lib/observability/) provides:
// - tracer.ts: span creation + OTLP /v1/traces push
// - metrics.ts: metric recording + OTLP /v1/metrics push (30s flush)
//
// Both are zero-dependency, fire-and-forget, and gracefully no-op
// when OTEL_EXPORTER_OTLP_ENDPOINT is not configured.

import { logger } from "@/lib/logger";

export async function register(): Promise<void> {
  // Only run on Node.js server (not edge runtime)
  if (process.env.NEXT_RUNTIME === "edge") return;

  // ── Validate critical environment variables ───────────────────────────────
  const requiredVars = ["DATABASE_URL", "DEEPSEEK_API_KEY", "OPENAI_API_KEY", "AUTH_SECRET"];
  const missing = requiredVars.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    logger.error("Missing required environment variables", {
      missing,
      hint: "Check .env.local or Railway environment variables",
    });
  }

  // ── Start metrics flusher if OTLP endpoint is configured ──────────────────
  const otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  const serviceName = process.env.OTEL_SERVICE_NAME ?? "agent-studio";

  if (otlpEndpoint) {
    logger.info("OpenTelemetry configured", {
      endpoint: otlpEndpoint,
      serviceName,
      transport: "OTLP/HTTP (custom push)",
    });
  } else {
    logger.info("OpenTelemetry not configured — spans and metrics will be logged only", {
      hint: "Set OTEL_EXPORTER_OTLP_ENDPOINT to enable OTLP push",
    });
  }

  // ── Graceful shutdown: flush pending metrics on process exit ───────────────
  const shutdown = async (): Promise<void> => {
    try {
      // Dynamic import to avoid edge runtime issues
      const { flushMetrics, stopMetricsFlusher } = await import("@/lib/observability");
      const flushed = await flushMetrics();
      stopMetricsFlusher();
      if (flushed > 0) {
        logger.info("Shutdown: flushed pending metrics", { count: flushed });
      }
    } catch {
      // Best effort — process is exiting
    }
  };

  process.on("SIGTERM", () => { shutdown().finally(() => process.exit(0)); });
  process.on("SIGINT", () => { shutdown().finally(() => process.exit(0)); });

  logger.info("Instrumentation registered", {
    runtime: process.env.NEXT_RUNTIME ?? "nodejs",
    nodeVersion: process.version,
    env: process.env.NODE_ENV,
  });
}
