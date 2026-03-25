import { logger } from "@/lib/logger";
import type { MetricRecord } from "./types";

const OTEL_ENDPOINT = process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? "";
const SERVICE_NAME = process.env.OTEL_SERVICE_NAME ?? "agent-studio";

const METRIC_BUFFER: MetricRecord[] = [];
const FLUSH_INTERVAL_MS = 30_000;
const MAX_BUFFER_SIZE = 500;

let flushTimer: ReturnType<typeof setInterval> | null = null;

export function recordMetric(
  name: string,
  value: number,
  unit: string,
  attributes: Record<string, string | number> = {}
): void {
  const record: MetricRecord = {
    name,
    value,
    unit,
    attributes: { "service.name": SERVICE_NAME, ...attributes },
    timestamp: Date.now(),
  };

  METRIC_BUFFER.push(record);

  if (METRIC_BUFFER.length >= MAX_BUFFER_SIZE) {
    flushMetrics().catch(() => {});
  }

  if (!flushTimer && OTEL_ENDPOINT) {
    flushTimer = setInterval(() => {
      flushMetrics().catch(() => {});
    }, FLUSH_INTERVAL_MS);
  }
}

export function recordChatLatency(
  agentId: string,
  model: string,
  durationMs: number
): void {
  recordMetric("gen_ai.chat.duration", durationMs, "ms", {
    agentId,
    "gen_ai.request.model": model,
  });
}

export function recordTokenUsage(
  agentId: string,
  model: string,
  inputTokens: number,
  outputTokens: number
): void {
  recordMetric("gen_ai.usage.input_tokens", inputTokens, "tokens", {
    agentId,
    "gen_ai.request.model": model,
  });
  recordMetric("gen_ai.usage.output_tokens", outputTokens, "tokens", {
    agentId,
    "gen_ai.request.model": model,
  });
}

export function recordSkillCall(
  skillSlug: string,
  durationMs: number,
  success: boolean
): void {
  recordMetric("ecc.skill.call.duration", durationMs, "ms", {
    skill: skillSlug,
    success: success ? 1 : 0,
  });
}

export function recordInstinctPromotion(agentId: string): void {
  recordMetric("ecc.instinct.promotion", 1, "count", { agentId });
}

export async function flushMetrics(): Promise<number> {
  if (METRIC_BUFFER.length === 0) return 0;

  const batch = METRIC_BUFFER.splice(0, MAX_BUFFER_SIZE);

  if (OTEL_ENDPOINT) {
    try {
      await fetch(`${OTEL_ENDPOINT}/v1/metrics`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resourceMetrics: [
            {
              resource: {
                attributes: [
                  { key: "service.name", value: { stringValue: SERVICE_NAME } },
                ],
              },
              scopeMetrics: [
                {
                  metrics: batch.map((m) => ({
                    name: m.name,
                    unit: m.unit,
                    gauge: {
                      dataPoints: [
                        {
                          asDouble: m.value,
                          timeUnixNano: m.timestamp * 1_000_000,
                          attributes: Object.entries(m.attributes).map(
                            ([k, v]) => ({
                              key: k,
                              value:
                                typeof v === "number"
                                  ? { intValue: v }
                                  : { stringValue: String(v) },
                            })
                          ),
                        },
                      ],
                    },
                  })),
                },
              ],
            },
          ],
        }),
        signal: AbortSignal.timeout(5000),
      });
    } catch {
      // Fire-and-forget
    }
  }

  logger.info("metrics_flush", { count: batch.length });
  return batch.length;
}

export function stopMetricsFlusher(): void {
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
}
