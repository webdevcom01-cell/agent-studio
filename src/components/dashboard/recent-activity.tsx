"use client";

import { useEffect, useState } from "react";

interface Item {
  id: string;
  agentName: string;
  status: string;
  durationMs: number | null;
  error: string | null;
  createdAt: string;
}

function statusColor(status: string): string {
  switch (status) {
    case "SUCCESS":
      return "hsl(var(--success))";
    case "FAILED":
      return "hsl(var(--destructive))";
    case "TIMEOUT":
      return "hsl(var(--warning))";
    case "RUNNING":
      return "hsl(var(--info))";
    default:
      return "hsl(var(--muted-foreground))";
  }
}

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function detail(it: Item): string {
  if (it.status === "FAILED" || it.status === "TIMEOUT") {
    return it.error ? it.error.slice(0, 48) : it.status.toLowerCase();
  }
  if (it.durationMs != null) {
    return it.durationMs >= 1000 ? `${(it.durationMs / 1000).toFixed(1)}s` : `${Math.round(it.durationMs)}ms`;
  }
  return it.status.toLowerCase();
}

export function RecentActivity(): React.ReactElement | null {
  const [items, setItems] = useState<Item[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetch("/api/analytics/activity?limit=8")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { items?: Item[] }) => {
        if (active) {
          setItems(d.items ?? []);
          setLoading(false);
        }
      })
      .catch(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  // Hide entirely when there is no activity (e.g. new accounts).
  if (!loading && (!items || items.length === 0)) return null;

  return (
    <section aria-label="Recent activity">
      <h2 className="mb-3 text-sm font-medium text-foreground">Recent activity</h2>
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        {loading && !items
          ? [0, 1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-2.5 border-b border-border px-3.5 py-2.5 last:border-b-0">
                <span className="size-2 shrink-0 rounded-full bg-muted" />
                <span className="h-2.5 w-32 rounded bg-muted" />
              </div>
            ))
          : (items ?? []).map((it) => (
              <div key={it.id} className="flex items-center gap-2.5 border-b border-border px-3.5 py-2.5 last:border-b-0">
                <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: statusColor(it.status) }} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-medium text-foreground">{it.agentName}</div>
                  <div className="truncate text-[11px] text-muted-foreground">{detail(it)}</div>
                </div>
                <span className="shrink-0 font-mono text-[11px] text-muted-foreground/60">{relTime(it.createdAt)}</span>
              </div>
            ))}
      </div>
    </section>
  );
}
