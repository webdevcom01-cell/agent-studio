"use client";

import { useEffect, useState } from "react";
import { ArrowRightLeft, AlertTriangle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface AgentCallStats {
  period: string;
  totalCalls: number;
  successRate: number;
  avgDurationMs: number;
  totalTokensUsed: number;
  estimatedTotalCost: number;
  topCallerAgents: { agentId: string; name: string; callCount: number }[];
  topCalleeAgents: { agentId: string; name: string; callCount: number }[];
  recentFailures: {
    taskId: string;
    callerName: string;
    calleeName: string;
    error: string;
    createdAt: string;
  }[];
}

interface AgentCallMonitorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AgentCallMonitor({ open, onOpenChange }: AgentCallMonitorProps) {
  const [stats, setStats] = useState<AgentCallStats | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [period, setPeriod] = useState("24h");

  useEffect(() => {
    if (!open) return;
    setIsLoading(true);
    fetch(`/api/agent-calls/stats?period=${period}`)
      .then((r) => r.json())
      .then((res) => {
        if (res.success) setStats(res.data);
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, [open, period]);

  function formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  }

  function formatTimeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return "just now";
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hr ago`;
    return `${Math.floor(hours / 24)} days ago`;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft className="size-5" />
            Agent Calls
          </DialogTitle>
        </DialogHeader>

        <div className="flex gap-1 mb-4">
          {(["1h", "24h", "7d"] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`rounded px-3 py-1 text-xs font-medium transition-colors ${
                period === p
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-accent"
              }`}
            >
              {p}
            </button>
          ))}
        </div>

        {isLoading && (
          <div className="py-8 text-center text-muted-foreground text-sm">
            Loading stats...
          </div>
        )}

        {!isLoading && stats && (
          <div className="space-y-4">
            <div className="grid grid-cols-4 gap-3">
              <StatCard label="Calls" value={String(stats.totalCalls)} />
              <StatCard
                label="Success"
                value={`${Math.round(stats.successRate * 100)}%`}
              />
              <StatCard
                label="Avg"
                value={formatDuration(stats.avgDurationMs)}
              />
              <StatCard
                label="Cost"
                value={`$${stats.estimatedTotalCost.toFixed(3)}`}
              />
            </div>

            {stats.topCalleeAgents.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  Most Called
                </h4>
                <div className="space-y-1">
                  {stats.topCalleeAgents.map((agent) => (
                    <div
                      key={agent.agentId}
                      className="flex items-center justify-between rounded px-2 py-1.5 text-sm bg-muted/50"
                    >
                      <span className="truncate">{agent.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {agent.callCount} calls
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {stats.recentFailures.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1">
                  <AlertTriangle className="size-3" />
                  Recent Failures ({stats.recentFailures.length})
                </h4>
                <div className="space-y-1">
                  {stats.recentFailures.map((f) => (
                    <div
                      key={f.taskId}
                      className="rounded border border-destructive/20 bg-destructive/5 px-2 py-1.5"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium truncate">
                          {f.callerName} → {f.calleeName}
                        </span>
                        <span className="text-muted-foreground shrink-0 ml-2">
                          {formatTimeAgo(f.createdAt)}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {f.error}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {stats.totalCalls === 0 && (
              <div className="py-6 text-center text-muted-foreground text-sm">
                No agent calls in this period
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border p-2 text-center">
      <p className="text-lg font-semibold">{value}</p>
      <p className="text-[10px] text-muted-foreground uppercase">{label}</p>
    </div>
  );
}
