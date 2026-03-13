"use client";

import { useState } from "react";
import useSWR from "swr";
import {
  ArrowRightLeft,
  AlertTriangle,
  Activity,
  Clock,
  Zap,
  DollarSign,
  ArrowRight,
  CheckCircle2,
  XCircle,
  Loader2,
  TrendingUp,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────────────────────────

type Period = "1h" | "24h" | "7d";

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

interface CallLog {
  id: string;
  traceId: string;
  spanId: string;
  parentSpanId: string | null;
  status: string;
  durationMs: number | null;
  tokensUsed: number | null;
  estimatedCostUsd: number | null;
  depth: number;
  createdAt: string;
  completedAt: string | null;
  errorMessage: string | null;
  callerAgent: { id: string; name: string };
  calleeAgent: { id: string; name: string } | null;
}

interface AgentCallMonitorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ─── Fetchers ───────────────────────────────────────────────────────────────

const fetchStats = (url: string) => fetch(url).then((r) => r.json());
const fetchLogs = (url: string) => fetch(url).then((r) => r.json());

// ─── Utils ──────────────────────────────────────────────────────────────────

function formatDuration(ms: number | null): string {
  if (ms === null || ms === 0) return "–";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function formatCost(usd: number | null): string {
  if (usd === null || usd === 0) return "$0";
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  if (usd < 1) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(2)}`;
}

function formatTokens(n: number | null): string {
  if (n === null || n === 0) return "0";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

const STATUS_CONFIG: Record<string, { icon: typeof CheckCircle2; color: string; label: string }> = {
  COMPLETED: { icon: CheckCircle2, color: "text-emerald-500", label: "Completed" },
  FAILED: { icon: XCircle, color: "text-red-500", label: "Failed" },
  WORKING: { icon: Loader2, color: "text-blue-500", label: "Working" },
  SUBMITTED: { icon: Clock, color: "text-yellow-500", label: "Submitted" },
  INPUT_REQUIRED: { icon: AlertTriangle, color: "text-orange-500", label: "Input Required" },
};

// ─── Stat Card ──────────────────────────────────────────────────────────────

function MetricCard({
  icon: Icon,
  label,
  value,
  subValue,
  accent,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  subValue?: string;
  accent?: "emerald" | "red" | "default";
}): React.ReactElement {
  return (
    <Card>
      <CardContent className="px-3.5 pt-3.5 pb-3">
        <div className="flex items-center gap-2.5">
          <div
            className={cn(
              "flex size-9 shrink-0 items-center justify-center rounded-lg",
              accent === "emerald" && "bg-emerald-500/10",
              accent === "red" && "bg-red-500/10",
              (!accent || accent === "default") && "bg-primary/10"
            )}
          >
            <Icon
              className={cn(
                "size-4",
                accent === "emerald" && "text-emerald-500",
                accent === "red" && "text-red-500",
                (!accent || accent === "default") && "text-primary"
              )}
            />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider leading-none mb-0.5">
              {label}
            </p>
            <p className="text-lg font-bold tracking-tight leading-tight">{value}</p>
            {subValue && (
              <p className="text-[10px] text-muted-foreground leading-none mt-0.5">{subValue}</p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Call Chain ──────────────────────────────────────────────────────────────

function CallChainItem({ log }: { log: CallLog }): React.ReactElement {
  const statusConf = STATUS_CONFIG[log.status] ?? STATUS_CONFIG["SUBMITTED"];
  const StatusIcon = statusConf.icon;

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors",
        log.status === "FAILED" && "border-red-500/20 bg-red-500/5",
        log.status === "COMPLETED" && "border-border",
        log.status !== "FAILED" && log.status !== "COMPLETED" && "border-border bg-muted/30"
      )}
    >
      {/* Depth indicator */}
      {log.depth > 0 && (
        <div className="flex items-center gap-0.5">
          {Array.from({ length: log.depth }).map((_, i) => (
            <div key={i} className="h-5 w-0.5 rounded-full bg-border" />
          ))}
        </div>
      )}

      {/* Status icon */}
      <StatusIcon
        className={cn(
          "size-4 shrink-0",
          statusConf.color,
          log.status === "WORKING" && "animate-spin"
        )}
      />

      {/* Agent chain */}
      <div className="flex items-center gap-1.5 min-w-0 flex-1">
        <span className="text-sm font-medium truncate">
          {log.callerAgent.name}
        </span>
        <ArrowRight className="size-3 text-muted-foreground shrink-0" />
        <span className="text-sm font-medium truncate">
          {log.calleeAgent?.name ?? "External"}
        </span>
      </div>

      {/* Metrics */}
      <div className="flex items-center gap-3 shrink-0 text-xs text-muted-foreground">
        {log.durationMs !== null && (
          <span className="tabular-nums">{formatDuration(log.durationMs)}</span>
        )}
        {log.tokensUsed !== null && log.tokensUsed > 0 && (
          <span className="tabular-nums">{formatTokens(log.tokensUsed)} tok</span>
        )}
        <span>{formatTimeAgo(log.createdAt)}</span>
      </div>
    </div>
  );
}

// ─── Agent Bar ──────────────────────────────────────────────────────────────

function AgentBar({
  name,
  count,
  maxCount,
  type,
}: {
  name: string;
  count: number;
  maxCount: number;
  type: "caller" | "callee";
}): React.ReactElement {
  const pct = maxCount > 0 ? (count / maxCount) * 100 : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium truncate">{name}</span>
        <span className="text-xs text-muted-foreground tabular-nums">{count} calls</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-500",
            type === "caller" ? "bg-primary/60" : "bg-primary"
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ─── Empty State ────────────────────────────────────────────────────────────

function EmptyState(): React.ReactElement {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-muted mb-4">
        <ArrowRightLeft className="size-6 text-muted-foreground" />
      </div>
      <h3 className="text-sm font-semibold mb-1">No agent calls yet</h3>
      <p className="text-xs text-muted-foreground max-w-[260px]">
        Agent-to-agent calls will appear here when you enable orchestration on ai_response nodes.
      </p>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function AgentCallMonitor({ open, onOpenChange }: AgentCallMonitorProps) {
  const [period, setPeriod] = useState<Period>("24h");

  const { data: statsRes, isLoading: statsLoading } = useSWR(
    open ? `/api/agent-calls/stats?period=${period}` : null,
    fetchStats,
    { refreshInterval: period === "1h" ? 15000 : 0 }
  );

  const { data: logsRes, isLoading: logsLoading } = useSWR(
    open ? `/api/agent-calls?limit=30` : null,
    fetchLogs,
    { refreshInterval: period === "1h" ? 15000 : 0 }
  );

  const stats: AgentCallStats | null = statsRes?.success ? statsRes.data : null;
  const logs: CallLog[] = logsRes?.success ? logsRes.data : [];

  const isLoading = statsLoading || logsLoading;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader className="shrink-0">
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2">
              <ArrowRightLeft className="size-5" />
              Agent Calls
            </DialogTitle>
            <div className="flex items-center gap-2">
              {period === "1h" && (
                <Badge variant="secondary" className="gap-1 text-xs">
                  <Activity className="size-3" />
                  Live
                </Badge>
              )}
              <div className="flex gap-0.5 rounded-lg border p-0.5">
                {(["1h", "24h", "7d"] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() => setPeriod(p)}
                    className={cn(
                      "px-2.5 py-1 text-xs rounded-md transition-all font-medium",
                      period === p
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                    )}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </DialogHeader>

        {/* Content — scrollable */}
        <div className="flex-1 overflow-y-auto -mx-6 px-6 pb-2">
          {isLoading && !stats ? (
            <div className="space-y-3 py-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Card key={i}>
                    <CardContent className="px-3.5 pt-3.5 pb-3">
                      <div className="space-y-2">
                        <div className="h-3 w-16 rounded bg-muted animate-pulse" />
                        <div className="h-5 w-12 rounded bg-muted animate-pulse" />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
              <div className="h-40 rounded-lg bg-muted animate-pulse" />
            </div>
          ) : stats?.totalCalls === 0 ? (
            <EmptyState />
          ) : stats ? (
            <div className="space-y-4 py-2">
              {/* Metrics grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <MetricCard
                  icon={Zap}
                  label="Total Calls"
                  value={stats.totalCalls.toLocaleString()}
                />
                <MetricCard
                  icon={TrendingUp}
                  label="Success Rate"
                  value={`${Math.round(stats.successRate * 100)}%`}
                  accent={stats.successRate >= 0.95 ? "emerald" : stats.successRate < 0.8 ? "red" : "default"}
                />
                <MetricCard
                  icon={Clock}
                  label="Avg Latency"
                  value={formatDuration(stats.avgDurationMs)}
                />
                <MetricCard
                  icon={DollarSign}
                  label="Total Cost"
                  value={formatCost(stats.estimatedTotalCost)}
                  subValue={`${formatTokens(stats.totalTokensUsed)} tokens`}
                />
              </div>

              {/* Tabs */}
              <Tabs defaultValue="activity" className="space-y-3">
                <TabsList className="w-full justify-start">
                  <TabsTrigger value="activity" className="text-xs">
                    Recent Activity
                  </TabsTrigger>
                  <TabsTrigger value="agents" className="text-xs">
                    Top Agents
                  </TabsTrigger>
                  <TabsTrigger value="failures" className="text-xs">
                    Failures
                    {stats.recentFailures.length > 0 && (
                      <Badge variant="destructive" className="ml-1.5 text-[10px] px-1 py-0">
                        {stats.recentFailures.length}
                      </Badge>
                    )}
                  </TabsTrigger>
                </TabsList>

                {/* Activity Tab */}
                <TabsContent value="activity" className="space-y-1.5 mt-0">
                  {logs.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      No call logs in this period
                    </p>
                  ) : (
                    logs.map((log) => <CallChainItem key={log.id} log={log} />)
                  )}
                </TabsContent>

                {/* Agents Tab */}
                <TabsContent value="agents" className="mt-0">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {stats.topCallerAgents.length > 0 && (
                      <div className="space-y-3">
                        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                          Top Callers
                        </h4>
                        <div className="space-y-2.5">
                          {stats.topCallerAgents.map((a) => (
                            <AgentBar
                              key={a.agentId}
                              name={a.name}
                              count={a.callCount}
                              maxCount={stats.topCallerAgents[0]?.callCount ?? 1}
                              type="caller"
                            />
                          ))}
                        </div>
                      </div>
                    )}
                    {stats.topCalleeAgents.length > 0 && (
                      <div className="space-y-3">
                        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                          Most Called
                        </h4>
                        <div className="space-y-2.5">
                          {stats.topCalleeAgents.map((a) => (
                            <AgentBar
                              key={a.agentId}
                              name={a.name}
                              count={a.callCount}
                              maxCount={stats.topCalleeAgents[0]?.callCount ?? 1}
                              type="callee"
                            />
                          ))}
                        </div>
                      </div>
                    )}
                    {stats.topCallerAgents.length === 0 &&
                      stats.topCalleeAgents.length === 0 && (
                        <p className="text-sm text-muted-foreground text-center py-8 col-span-2">
                          No agent data available
                        </p>
                      )}
                  </div>
                </TabsContent>

                {/* Failures Tab */}
                <TabsContent value="failures" className="mt-0 space-y-1.5">
                  {stats.recentFailures.length === 0 ? (
                    <div className="flex flex-col items-center py-8">
                      <CheckCircle2 className="size-8 text-emerald-500 mb-2" />
                      <p className="text-sm font-medium">All clear</p>
                      <p className="text-xs text-muted-foreground">
                        No failures in this period
                      </p>
                    </div>
                  ) : (
                    stats.recentFailures.map((f) => (
                      <div
                        key={f.taskId}
                        className="rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2.5"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5 text-sm">
                            <XCircle className="size-3.5 text-red-500 shrink-0" />
                            <span className="font-medium truncate">
                              {f.callerName}
                            </span>
                            <ArrowRight className="size-3 text-muted-foreground shrink-0" />
                            <span className="font-medium truncate">
                              {f.calleeName}
                            </span>
                          </div>
                          <span className="text-[10px] text-muted-foreground shrink-0 ml-2">
                            {formatTimeAgo(f.createdAt)}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                          {f.error}
                        </p>
                      </div>
                    ))
                  )}
                </TabsContent>
              </Tabs>
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
