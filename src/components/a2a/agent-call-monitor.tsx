"use client";

import { useState, useMemo } from "react";
import useSWR from "swr";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
} from "recharts";
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
  ChevronDown,
  ChevronRight,
  Download,
  Bell,
  Shield,
  BarChart3,
  AppWindow,
} from "lucide-react";
import { DESKTOP_APPS } from "@/lib/constants/desktop-apps";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  statusBreakdown: Record<string, number>;
  timeSeries: {
    bucket: string;
    callCount: number;
    successCount: number;
    failCount: number;
    avgDurationMs: number;
  }[];
  latencyDistribution: { label: string; count: number }[];
  agentPairs: {
    callerId: string;
    callerName: string;
    calleeId: string | null;
    calleeName: string;
    callCount: number;
    successCount: number;
    successRate: number;
    avgDurationMs: number;
    totalTokens: number;
    totalCost: number;
  }[];
  latencyPercentiles: {
    p50Ms: number;
    p95Ms: number;
    p99Ms: number;
    maxMs: number;
  } | null;
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
  desktopApps?: string[];
}

interface AgentCallMonitorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ─── Fetchers & Constants ───────────────────────────────────────────────────

const fetchJson = (url: string) => fetch(url).then((r) => r.json());

const STATUS_COLORS: Record<string, string> = {
  COMPLETED: "hsl(150, 60%, 45%)",
  FAILED: "hsl(0, 70%, 55%)",
  WORKING: "hsl(210, 70%, 55%)",
  SUBMITTED: "hsl(45, 80%, 50%)",
  INPUT_REQUIRED: "hsl(30, 75%, 50%)",
};

const STATUS_LABELS: Record<string, string> = {
  COMPLETED: "Completed",
  FAILED: "Failed",
  WORKING: "Working",
  SUBMITTED: "Submitted",
  INPUT_REQUIRED: "Input Required",
};

const CHART_STYLE = {
  backgroundColor: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "8px",
  fontSize: "12px",
};

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

function formatBucket(bucket: string): string {
  if (bucket.includes(" ")) {
    const d = new Date(bucket);
    return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  }
  const d = new Date(bucket);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ─── Sub-Components ─────────────────────────────────────────────────────────

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
  accent?: "success" | "error" | "default";
}): React.ReactElement {
  return (
    <Card>
      <CardContent className="px-3.5 pt-3.5 pb-3">
        <div className="flex items-center gap-2.5">
          <div
            className={cn(
              "flex size-9 shrink-0 items-center justify-center rounded-lg",
              accent === "success" && "bg-muted/10",
              accent === "error" && "bg-muted/10",
              (!accent || accent === "default") && "bg-primary/10"
            )}
          >
            <Icon
              className={cn(
                "size-4",
                accent === "success" && "text-foreground/60",
                accent === "error" && "text-destructive",
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

function PercentileBar({
  label,
  value,
  maxValue,
  color,
}: {
  label: string;
  value: number;
  maxValue: number;
  color: string;
}): React.ReactElement {
  const pct = maxValue > 0 ? Math.min((value / maxValue) * 100, 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground font-medium">{label}</span>
        <span className="tabular-nums font-semibold">{formatDuration(value)}</span>
      </div>
      <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

function CallChainItem({
  log,
  expanded,
  onToggle,
}: {
  log: CallLog;
  expanded: boolean;
  onToggle: () => void;
}): React.ReactElement {
  const isFailed = log.status === "FAILED";
  const isCompleted = log.status === "COMPLETED";
  const isWorking = log.status === "WORKING";

  return (
    <div
      className={cn(
        "rounded-lg border transition-colors",
        isFailed && "border-destructive/20 bg-muted/5",
        isCompleted && "border-border hover:border-border/80",
        !isFailed && !isCompleted && "border-border bg-muted/30"
      )}
    >
      <button
        onClick={onToggle}
        className="flex items-center gap-2.5 w-full px-3 py-2.5 text-left"
      >
        {/* Depth indicator */}
        {log.depth > 0 && (
          <div className="flex items-center gap-0.5 shrink-0">
            {Array.from({ length: log.depth }).map((_, i) => (
              <div key={i} className="h-5 w-0.5 rounded-full bg-primary/30" />
            ))}
          </div>
        )}

        {/* Status icon */}
        {isCompleted ? (
          <CheckCircle2 className="size-4 text-foreground/60 shrink-0" />
        ) : isFailed ? (
          <XCircle className="size-4 text-destructive shrink-0" />
        ) : isWorking ? (
          <Loader2 className="size-4 text-muted-foreground shrink-0 animate-spin" />
        ) : (
          <Clock className="size-4 text-muted-foreground/60 shrink-0" />
        )}

        {/* Agent chain */}
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <span className="text-sm font-medium truncate">{log.callerAgent.name}</span>
          <ArrowRight className="size-3 text-muted-foreground shrink-0" />
          <span className="text-sm font-medium truncate">
            {log.calleeAgent?.name ?? "External"}
          </span>
          {log.desktopApps && log.desktopApps.length > 0 && (
            <DesktopAppIcons appIds={log.desktopApps} />
          )}
        </div>

        {/* Quick metrics */}
        <div className="flex items-center gap-2.5 shrink-0 text-xs text-muted-foreground">
          {log.durationMs !== null && (
            <span className="tabular-nums">{formatDuration(log.durationMs)}</span>
          )}
          <span>{formatTimeAgo(log.createdAt)}</span>
          {expanded ? (
            <ChevronDown className="size-3.5" />
          ) : (
            <ChevronRight className="size-3.5" />
          )}
        </div>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-3 pb-3 pt-0 border-t border-border/50">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-2.5 text-xs">
            <div>
              <span className="text-muted-foreground">Status</span>
              <p className="font-medium mt-0.5">
                <Badge
                  variant={isCompleted ? "secondary" : isFailed ? "destructive" : "outline"}
                  className="text-[10px]"
                >
                  {log.status}
                </Badge>
              </p>
            </div>
            <div>
              <span className="text-muted-foreground">Duration</span>
              <p className="font-semibold mt-0.5 tabular-nums">{formatDuration(log.durationMs)}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Tokens</span>
              <p className="font-semibold mt-0.5 tabular-nums">{formatTokens(log.tokensUsed)}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Cost</span>
              <p className="font-semibold mt-0.5 tabular-nums">
                {log.estimatedCostUsd !== null ? formatCost(Number(log.estimatedCostUsd)) : "–"}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 mt-2 text-xs">
            <div>
              <span className="text-muted-foreground">Trace ID</span>
              <p className="font-mono text-[10px] mt-0.5 truncate">{log.traceId}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Depth</span>
              <p className="font-medium mt-0.5">{log.depth}</p>
            </div>
          </div>
          {log.errorMessage && (
            <div className="mt-2 rounded-md bg-muted/10 border border-destructive/20 px-2.5 py-2 text-xs">
              <span className="text-destructive font-medium">Error: </span>
              <span className="text-muted-foreground">{log.errorMessage}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AgentPairCard({
  pair,
}: {
  pair: AgentCallStats["agentPairs"][0];
}): React.ReactElement {
  return (
    <div className="flex items-center gap-3 rounded-lg border px-3 py-2.5">
      <div className="flex items-center gap-1.5 min-w-0 flex-1">
        <span className="text-sm font-medium truncate">{pair.callerName}</span>
        <ArrowRight className="size-3 text-muted-foreground shrink-0" />
        <span className="text-sm font-medium truncate">{pair.calleeName}</span>
      </div>
      <div className="flex items-center gap-2 shrink-0 text-xs">
        <span className="tabular-nums text-muted-foreground">{pair.callCount} calls</span>
        <Badge
          variant={pair.successRate >= 95 ? "secondary" : pair.successRate >= 80 ? "outline" : "destructive"}
          className="text-[10px] tabular-nums"
        >
          {pair.successRate}%
        </Badge>
        <span className="tabular-nums text-muted-foreground">{formatDuration(pair.avgDurationMs)}</span>
      </div>
    </div>
  );
}

function DesktopAppIcons({
  appIds,
}: {
  appIds: string[];
}): React.ReactElement {
  const apps = appIds
    .map((id) => DESKTOP_APPS.find((a) => a.id === id))
    .filter(Boolean);

  if (apps.length === 0) {
    return (
      <span className="inline-flex items-center gap-0.5 ml-1" title="Desktop automation">
        <AppWindow className="size-3 text-foreground/60" />
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-0.5 ml-1">
      {apps.slice(0, 3).map((app) => {
        const Icon = app!.icon;
        return (
          <span
            key={app!.id}
            title={app!.label}
            className="inline-flex"
          >
            <Icon className="size-3 text-foreground/60" />
          </span>
        );
      })}
      {apps.length > 3 && (
        <span className="text-[10px] text-foreground/60 font-medium">
          +{apps.length - 3}
        </span>
      )}
    </span>
  );
}

function EmptyState(): React.ReactElement {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="flex size-16 items-center justify-center rounded-2xl bg-muted mb-4">
        <ArrowRightLeft className="size-7 text-muted-foreground" />
      </div>
      <h3 className="text-sm font-semibold mb-1.5">No agent calls yet</h3>
      <p className="text-xs text-muted-foreground max-w-[300px] leading-relaxed">
        Agent-to-agent calls appear here when you enable Agent Orchestration
        on ai_response nodes in your flow builder.
      </p>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function AgentCallMonitor({ open, onOpenChange }: AgentCallMonitorProps) {
  const [period, setPeriod] = useState<Period>("24h");
  const [expandedLogs, setExpandedLogs] = useState<Set<string>>(new Set());

  const { data: statsRes, isLoading: statsLoading } = useSWR(
    open ? `/api/agent-calls/stats?period=${period}` : null,
    fetchJson,
    { refreshInterval: period === "1h" ? 10000 : 0 }
  );

  const { data: logsRes, isLoading: logsLoading } = useSWR(
    open ? `/api/agent-calls?limit=50` : null,
    fetchJson,
    { refreshInterval: period === "1h" ? 10000 : 0 }
  );

  const stats: AgentCallStats | null = statsRes?.success ? statsRes.data : null;
  const logs: CallLog[] = logsRes?.success ? logsRes.data : [];
  const isLoading = statsLoading || logsLoading;

  // Group logs by traceId for trace tree view
  const traceGroups = useMemo(() => {
    const groups = new Map<string, CallLog[]>();
    for (const log of logs) {
      const existing = groups.get(log.traceId) ?? [];
      existing.push(log);
      groups.set(log.traceId, existing);
    }
    // Sort within each group by depth
    for (const group of groups.values()) {
      group.sort((a, b) => a.depth - b.depth);
    }
    return Array.from(groups.entries()).slice(0, 20);
  }, [logs]);

  // Status breakdown for pie chart
  const statusData = useMemo(() => {
    if (!stats?.statusBreakdown) return [];
    return Object.entries(stats.statusBreakdown)
      .filter(([, count]) => count > 0)
      .map(([status, count]) => ({
        name: STATUS_LABELS[status] ?? status,
        value: count,
        color: STATUS_COLORS[status] ?? "hsl(var(--muted))",
      }));
  }, [stats]);

  function toggleLog(id: string) {
    setExpandedLogs((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleExportLogs() {
    if (!logs.length) return;
    const csv = [
      ["Timestamp", "Caller", "Callee", "Status", "Duration(ms)", "Tokens", "TraceID", "Error"].join(","),
      ...logs.map((l) =>
        [
          l.createdAt,
          l.callerAgent.name,
          l.calleeAgent?.name ?? "External",
          l.status,
          l.durationMs ?? "",
          l.tokensUsed ?? "",
          l.traceId,
          `"${(l.errorMessage ?? "").replace(/"/g, '""')}"`,
        ].join(",")
      ),
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `agent-calls-${period}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
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
              {stats && stats.totalCalls > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs gap-1"
                  onClick={handleExportLogs}
                >
                  <Download className="size-3" />
                  Export
                </Button>
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

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto -mx-6 px-6 pb-4">
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
              <div className="h-48 rounded-lg bg-muted animate-pulse" />
              <div className="h-32 rounded-lg bg-muted animate-pulse" />
            </div>
          ) : stats?.totalCalls === 0 ? (
            <EmptyState />
          ) : stats ? (
            <div className="space-y-4 py-2">
              {/* ─── Metrics ──────────────────────────────────────── */}
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
                  accent={
                    stats.successRate >= 0.95
                      ? "success"
                      : stats.successRate < 0.8
                        ? "error"
                        : "default"
                  }
                />
                <MetricCard
                  icon={Clock}
                  label="Avg Latency"
                  value={formatDuration(stats.avgDurationMs)}
                  subValue={
                    stats.latencyPercentiles
                      ? `p95: ${formatDuration(stats.latencyPercentiles.p95Ms)}`
                      : undefined
                  }
                />
                <MetricCard
                  icon={DollarSign}
                  label="Total Cost"
                  value={formatCost(stats.estimatedTotalCost)}
                  subValue={`${formatTokens(stats.totalTokensUsed)} tokens`}
                />
              </div>

              {/* ─── Tabs ─────────────────────────────────────────── */}
              <Tabs defaultValue="overview" className="space-y-3">
                <TabsList className="w-full justify-start">
                  <TabsTrigger value="overview" className="text-xs gap-1">
                    <BarChart3 className="size-3" />
                    Overview
                  </TabsTrigger>
                  <TabsTrigger value="traces" className="text-xs gap-1">
                    <ArrowRightLeft className="size-3" />
                    Traces
                  </TabsTrigger>
                  <TabsTrigger value="agents" className="text-xs gap-1">
                    <Shield className="size-3" />
                    Agents
                  </TabsTrigger>
                  <TabsTrigger value="failures" className="text-xs gap-1">
                    <AlertTriangle className="size-3" />
                    Failures
                    {stats.recentFailures.length > 0 && (
                      <Badge variant="destructive" className="ml-1 text-[10px] px-1 py-0">
                        {stats.recentFailures.length}
                      </Badge>
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="alerts" className="text-xs gap-1">
                    <Bell className="size-3" />
                    Alerts
                  </TabsTrigger>
                </TabsList>

                {/* ═══ Overview Tab ═══ */}
                <TabsContent value="overview" className="space-y-4 mt-0">
                  {/* Call volume chart */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Call Volume</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {stats.timeSeries.length === 0 ? (
                        <div className="flex h-40 items-center justify-center text-muted-foreground text-sm">
                          No time series data
                        </div>
                      ) : (
                        <ResponsiveContainer width="100%" height={200}>
                          <AreaChart data={stats.timeSeries}>
                            <defs>
                              <linearGradient id="successGrad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="hsl(150, 60%, 45%)" stopOpacity={0.3} />
                                <stop offset="95%" stopColor="hsl(150, 60%, 45%)" stopOpacity={0} />
                              </linearGradient>
                              <linearGradient id="failGrad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="hsl(0, 70%, 55%)" stopOpacity={0.3} />
                                <stop offset="95%" stopColor="hsl(0, 70%, 55%)" stopOpacity={0} />
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                            <XAxis
                              dataKey="bucket"
                              tickFormatter={formatBucket}
                              className="text-xs"
                              tick={{ fill: "hsl(var(--muted-foreground))" }}
                              axisLine={false}
                              tickLine={false}
                            />
                            <YAxis
                              className="text-xs"
                              tick={{ fill: "hsl(var(--muted-foreground))" }}
                              allowDecimals={false}
                              axisLine={false}
                              tickLine={false}
                            />
                            <Tooltip contentStyle={CHART_STYLE} />
                            <Area
                              type="monotone"
                              dataKey="successCount"
                              stroke="hsl(150, 60%, 45%)"
                              fill="url(#successGrad)"
                              strokeWidth={2}
                              name="Success"
                              stackId="1"
                            />
                            <Area
                              type="monotone"
                              dataKey="failCount"
                              stroke="hsl(0, 70%, 55%)"
                              fill="url(#failGrad)"
                              strokeWidth={2}
                              name="Failed"
                              stackId="1"
                            />
                          </AreaChart>
                        </ResponsiveContainer>
                      )}
                    </CardContent>
                  </Card>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Latency distribution */}
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm">Latency Distribution</CardTitle>
                      </CardHeader>
                      <CardContent>
                        {stats.latencyDistribution.length === 0 ? (
                          <div className="flex h-36 items-center justify-center text-muted-foreground text-sm">
                            No latency data
                          </div>
                        ) : (
                          <ResponsiveContainer width="100%" height={160}>
                            <BarChart data={stats.latencyDistribution}>
                              <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                              <XAxis
                                dataKey="label"
                                className="text-[10px]"
                                tick={{ fill: "hsl(var(--muted-foreground))" }}
                                axisLine={false}
                                tickLine={false}
                              />
                              <YAxis
                                className="text-xs"
                                tick={{ fill: "hsl(var(--muted-foreground))" }}
                                allowDecimals={false}
                                axisLine={false}
                                tickLine={false}
                              />
                              <Tooltip contentStyle={CHART_STYLE} />
                              <Bar
                                dataKey="count"
                                fill="hsl(var(--primary))"
                                radius={[4, 4, 0, 0]}
                                name="Calls"
                              />
                            </BarChart>
                          </ResponsiveContainer>
                        )}
                      </CardContent>
                    </Card>

                    {/* Status breakdown + percentiles */}
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm">Status & Percentiles</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-2 gap-4">
                          {/* Donut chart */}
                          <div>
                            {statusData.length === 0 ? (
                              <div className="flex h-32 items-center justify-center text-muted-foreground text-xs">
                                No data
                              </div>
                            ) : (
                              <ResponsiveContainer width="100%" height={130}>
                                <PieChart>
                                  <Pie
                                    data={statusData}
                                    dataKey="value"
                                    nameKey="name"
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={30}
                                    outerRadius={55}
                                    paddingAngle={2}
                                  >
                                    {statusData.map((entry, i) => (
                                      <Cell key={i} fill={entry.color} />
                                    ))}
                                  </Pie>
                                  <Tooltip contentStyle={CHART_STYLE} />
                                </PieChart>
                              </ResponsiveContainer>
                            )}
                          </div>

                          {/* Percentile bars */}
                          <div className="space-y-2 flex flex-col justify-center">
                            {stats.latencyPercentiles ? (
                              <>
                                <PercentileBar
                                  label="p50"
                                  value={stats.latencyPercentiles.p50Ms}
                                  maxValue={stats.latencyPercentiles.maxMs}
                                  color="hsl(var(--primary))"
                                />
                                <PercentileBar
                                  label="p95"
                                  value={stats.latencyPercentiles.p95Ms}
                                  maxValue={stats.latencyPercentiles.maxMs}
                                  color="hsl(30, 75%, 50%)"
                                />
                                <PercentileBar
                                  label="p99"
                                  value={stats.latencyPercentiles.p99Ms}
                                  maxValue={stats.latencyPercentiles.maxMs}
                                  color="hsl(0, 70%, 55%)"
                                />
                              </>
                            ) : (
                              <p className="text-xs text-muted-foreground text-center">
                                No percentile data
                              </p>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </TabsContent>

                {/* ═══ Traces Tab ═══ */}
                <TabsContent value="traces" className="space-y-2 mt-0">
                  {traceGroups.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      No call traces in this period
                    </p>
                  ) : (
                    traceGroups.map(([traceId, traceLogs]) => (
                      <div key={traceId} className="space-y-1">
                        {traceLogs.length > 1 && (
                          <div className="flex items-center gap-2 text-[10px] text-muted-foreground px-1 pt-1">
                            <span className="font-mono truncate">trace: {traceId.slice(0, 12)}...</span>
                            <span>·</span>
                            <span>{traceLogs.length} calls</span>
                          </div>
                        )}
                        {traceLogs.map((log) => (
                          <CallChainItem
                            key={log.id}
                            log={log}
                            expanded={expandedLogs.has(log.id)}
                            onToggle={() => toggleLog(log.id)}
                          />
                        ))}
                      </div>
                    ))
                  )}
                </TabsContent>

                {/* ═══ Agents Tab ═══ */}
                <TabsContent value="agents" className="space-y-4 mt-0">
                  {/* Agent pairs */}
                  {stats.agentPairs.length > 0 && (
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm">Agent Connections</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-1.5">
                        {stats.agentPairs.map((pair, i) => (
                          <AgentPairCard key={i} pair={pair} />
                        ))}
                      </CardContent>
                    </Card>
                  )}

                  {/* Top callers + callees */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {stats.topCallerAgents.length > 0 && (
                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm">Top Callers</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2.5">
                          {stats.topCallerAgents.map((a) => (
                            <div key={a.agentId} className="space-y-1">
                              <div className="flex items-center justify-between text-sm">
                                <span className="font-medium truncate">{a.name}</span>
                                <span className="text-xs text-muted-foreground tabular-nums">
                                  {a.callCount} calls
                                </span>
                              </div>
                              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                                <div
                                  className="h-full rounded-full bg-primary/60 transition-all"
                                  style={{
                                    width: `${(a.callCount / (stats.topCallerAgents[0]?.callCount || 1)) * 100}%`,
                                  }}
                                />
                              </div>
                            </div>
                          ))}
                        </CardContent>
                      </Card>
                    )}
                    {stats.topCalleeAgents.length > 0 && (
                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm">Most Called</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2.5">
                          {stats.topCalleeAgents.map((a) => (
                            <div key={a.agentId} className="space-y-1">
                              <div className="flex items-center justify-between text-sm">
                                <span className="font-medium truncate">{a.name}</span>
                                <span className="text-xs text-muted-foreground tabular-nums">
                                  {a.callCount} calls
                                </span>
                              </div>
                              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                                <div
                                  className="h-full rounded-full bg-primary transition-all"
                                  style={{
                                    width: `${(a.callCount / (stats.topCalleeAgents[0]?.callCount || 1)) * 100}%`,
                                  }}
                                />
                              </div>
                            </div>
                          ))}
                        </CardContent>
                      </Card>
                    )}
                  </div>

                  {stats.topCallerAgents.length === 0 && stats.topCalleeAgents.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      No agent data available
                    </p>
                  )}
                </TabsContent>

                {/* ═══ Failures Tab ═══ */}
                <TabsContent value="failures" className="mt-0 space-y-1.5">
                  {stats.recentFailures.length === 0 ? (
                    <div className="flex flex-col items-center py-10">
                      <CheckCircle2 className="size-10 text-foreground/60 mb-3" />
                      <p className="text-sm font-semibold">All clear</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        No failures in this period
                      </p>
                    </div>
                  ) : (
                    stats.recentFailures.map((f) => (
                      <div
                        key={f.taskId}
                        className="rounded-lg border border-destructive/20 bg-muted/5 px-3 py-2.5"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5 text-sm">
                            <XCircle className="size-3.5 text-destructive shrink-0" />
                            <span className="font-medium truncate">{f.callerName}</span>
                            <ArrowRight className="size-3 text-muted-foreground shrink-0" />
                            <span className="font-medium truncate">{f.calleeName}</span>
                          </div>
                          <span className="text-[10px] text-muted-foreground shrink-0 ml-2">
                            {formatTimeAgo(f.createdAt)}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2">
                          {f.error}
                        </p>
                      </div>
                    ))
                  )}
                </TabsContent>

                {/* ═══ Alerts Tab ═══ */}
                <TabsContent value="alerts" className="mt-0">
                  <Card>
                    <CardContent className="pt-6">
                      <div className="space-y-4">
                        <div className="flex items-center gap-3 text-sm">
                          <AlertTriangle className="size-5 text-muted-foreground shrink-0" />
                          <div>
                            <p className="font-medium">Failure Rate Alert</p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              Notify when failure rate exceeds threshold
                            </p>
                          </div>
                          <div className="ml-auto">
                            {stats.successRate < 0.9 ? (
                              <Badge variant="destructive" className="text-xs">
                                Triggered — {Math.round((1 - stats.successRate) * 100)}% failure rate
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="text-xs">
                                OK — {Math.round((1 - stats.successRate) * 100)}% failure rate
                              </Badge>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-3 text-sm">
                          <Clock className="size-5 text-muted-foreground shrink-0" />
                          <div>
                            <p className="font-medium">Latency Alert</p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              Notify when p95 latency exceeds 5 seconds
                            </p>
                          </div>
                          <div className="ml-auto">
                            {stats.latencyPercentiles && stats.latencyPercentiles.p95Ms > 5000 ? (
                              <Badge variant="destructive" className="text-xs">
                                Triggered — p95: {formatDuration(stats.latencyPercentiles.p95Ms)}
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="text-xs">
                                OK — p95: {formatDuration(stats.latencyPercentiles?.p95Ms ?? 0)}
                              </Badge>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-3 text-sm">
                          <DollarSign className="size-5 text-muted-foreground shrink-0" />
                          <div>
                            <p className="font-medium">Cost Alert</p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              Notify when cost exceeds $1.00 per period
                            </p>
                          </div>
                          <div className="ml-auto">
                            {stats.estimatedTotalCost > 1 ? (
                              <Badge variant="destructive" className="text-xs">
                                Triggered — {formatCost(stats.estimatedTotalCost)}
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="text-xs">
                                OK — {formatCost(stats.estimatedTotalCost)}
                              </Badge>
                            )}
                          </div>
                        </div>

                        <p className="text-[10px] text-muted-foreground border-t border-border pt-3">
                          Alert thresholds are evaluated in real-time. Configurable thresholds coming in a future update.
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
