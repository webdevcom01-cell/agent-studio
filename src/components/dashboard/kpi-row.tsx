"use client";

import { useEffect, useState, useCallback } from "react";

interface Summary {
  period: string;
  activeAgents: number;
  runs: number;
  successRate: number | null;
  spendUsd: number;
  avgLatencyMs: number | null;
  openReviews: number;
}

const PERIODS = ["7d", "30d", "90d"] as const;
type Period = (typeof PERIODS)[number];

function fmtLatency(ms: number | null): string {
  if (ms == null) return "—";
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`;
}

/** Color for success-rate traffic-light (green good / amber warn / red bad). */
function successVar(rate: number | null): string | undefined {
  if (rate == null) return undefined;
  if (rate >= 95) return "hsl(var(--success))";
  if (rate >= 85) return "hsl(var(--warning))";
  return "hsl(var(--destructive))";
}

export function KpiRow(): React.ReactElement {
  const [period, setPeriod] = useState<Period>("30d");
  const [data, setData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [errored, setErrored] = useState(false);

  const load = useCallback(async (p: Period) => {
    setLoading(true);
    setErrored(false);
    try {
      const res = await fetch(`/api/analytics/summary?period=${p}`);
      if (!res.ok) throw new Error("bad status");
      setData((await res.json()) as Summary);
    } catch {
      setErrored(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(period);
  }, [period, load]);

  const cards: { label: string; value: string; accent?: string; hint?: string }[] = [
    { label: "Active agents", value: data ? String(data.activeAgents) : "—" },
    { label: "Runs", value: data ? data.runs.toLocaleString() : "—" },
    {
      label: "Success rate",
      value: data && data.successRate != null ? `${data.successRate.toFixed(1)}%` : "—",
      accent: data ? successVar(data.successRate) : undefined,
    },
    { label: "Spend", value: data ? `$${data.spendUsd.toFixed(2)}` : "—" },
    { label: "Avg latency", value: data ? fmtLatency(data.avgLatencyMs) : "—" },
    { label: "Open reviews", value: data ? String(data.openReviews) : "—" },
  ];

  return (
    <section aria-label="Key metrics" className="mb-6">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-medium text-foreground">Overview</h2>
        <div className="inline-flex overflow-hidden rounded-md border border-border" role="group" aria-label="Time range">
          {PERIODS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              aria-pressed={period === p}
              className="px-2.5 py-1 text-xs font-medium transition-colors"
              style={
                period === p
                  ? { background: "hsl(var(--brand-subtle))", color: "hsl(var(--brand-subtle-foreground))" }
                  : { color: "hsl(var(--muted-foreground))" }
              }
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        {cards.map((c) => (
          <div key={c.label} className="rounded-lg border border-border bg-card p-3.5">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              {c.accent && (
                <span aria-hidden className="size-1.5 rounded-full" style={{ background: c.accent }} />
              )}
              {c.label}
            </div>
            <div
              className="mt-2 text-2xl font-bold tracking-tight"
              style={c.accent ? { color: c.accent } : undefined}
              aria-live="polite"
            >
              {errored ? "—" : loading && !data ? "·" : c.value}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
