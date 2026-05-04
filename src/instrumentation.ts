// Next.js instrumentation hook — runs once per server startup.
// Uses custom OTLP push implementation (not @opentelemetry/sdk-node)
// because the full SDK conflicts with Next.js edge runtime in 15.5.
//
// IMPORTANT: No top-level imports of Node.js-only modules (logger, crypto, etc.)
// instrumentation.ts is compiled for BOTH Node.js and Edge runtimes.
// All Node.js-specific code must be behind a dynamic import inside the function,
// gated on NEXT_RUNTIME !== "edge". See: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation

export async function register(): Promise<void> {
  // Only run on Node.js server — not in Edge runtime (middleware/edge functions)
  // Edge runtime lacks process.stdout, fs, worker_threads, etc.
  if (process.env.NEXT_RUNTIME === "edge") return;

  // Dynamic import — keeps logger.ts (uses process.stdout) out of the edge bundle
  const { logger } = await import("@/lib/logger");

  // ── Validate critical environment variables ───────────────────────────────
  const requiredVars = ["DATABASE_URL", "DEEPSEEK_API_KEY", "OPENAI_API_KEY", "AUTH_SECRET"];
  const missing = requiredVars.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    logger.error("Missing required environment variables", {
      missing,
      hint: "Check .env.local or Railway environment variables",
    });
  }

  // ── Warn about security-critical vars that are optional locally but required in prod ──
  if (process.env.NODE_ENV === "production") {
    if (!process.env.ADMIN_USER_IDS) {
      logger.error(
        "ADMIN_USER_IDS is not set — any authenticated user has admin access. Set this in Railway environment variables.",
        { hint: "ADMIN_USER_IDS=userId1,userId2" },
      );
    }
    if (!process.env.CRON_SECRET) {
      logger.error(
        "CRON_SECRET is not set — cron endpoints are unprotected. Set this in Railway environment variables.",
        { hint: "Generate with: openssl rand -base64 32" },
      );
    }
    if (!process.env.SENTRY_DSN) {
      logger.warn(
        "[Sentry] SENTRY_DSN not set — errors will not be reported to Sentry",
        { hint: "Set SENTRY_DSN in Railway environment variables" },
      );
    }
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
    logger.warn("OpenTelemetry not configured — spans and metrics will be logged only. Set OTEL_EXPORTER_OTLP_ENDPOINT for production observability.", {
      hint: "Set OTEL_EXPORTER_OTLP_ENDPOINT to enable OTLP push to Grafana Cloud",
    });
  }

  // ── Graceful shutdown: flush pending metrics on process exit ───────────────
  const shutdown = async (): Promise<void> => {
    try {
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
