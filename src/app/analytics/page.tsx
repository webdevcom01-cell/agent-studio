"use client";

import React, { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import {
  ArrowLeft,
  MessageSquare,
  Clock,
  Search,
  BarChart3,
  Zap,
  DollarSign,
  AlertTriangle,
  TrendingUp,
  Activity,
  Cpu,
  Users,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────────────────────────

type Period = "24h" | "7d" | "30d" | "90d";

interface AnalyticsData {
  period: string;
  summary: {
    totalConversations: number;
    totalMessages: number;
    avgResponseTimeMs: number;
    kbSearchHitRate: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    totalCostUsd: number;
    errorRate: number;
  };
  timeSeries: { date: string; count: number }[];
  topAgents: {
    agentId: string;
    agentName: string;
    conversationCount: number;
    messageCount: number;
  }[];
  commonFirstMessages: { message: string; count: number }[];
  responsePercentiles: {
    date: string;
    avgMs: number;
    p50Ms: number;
    p95Ms: number;
    p99Ms: number;
  }[];
  kbSearchStats: {
    totalSearches: number;
    withResults: number;
    withoutResults: number;
  };
  modelUsage: {
    model: string;
    requestCount: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    totalCostUsd: number;
    avgDurationMs: number;
  }[];
  errorRates: {
    date: string;
    errorCount: number;
    totalCount: number;
    rate: number;
  }[];
  costTrend: {
    date: string;
    costUsd: number;
    totalTokens: number;
  }[];
  toolUsage: {
    toolName: string;
    callCount: number;
    avgDurationMs: number;
    successRate: number;
  }[];
  conversationFunnel: {
    started: number;
    sentMessage: number;
    multiTurn: number;
    completed: number;
  };
}

// ─── Utils ──────────────────────────────────────────────────────────────────

const fetcher = (url: string): Promise<{ success: boolean; data: AnalyticsData }> =>
  fetch(url).then((r) => r.json());

function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  if (dateStr.includes(" ")) {
    return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatCost(usd: number): string {
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  if (usd < 1) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(2)}`;
}

const PIE_COLORS = [
  "hsl(var(--foreground) / 0.7)",
  "hsl(var(--foreground) / 0.55)",
  "hsl(var(--foreground) / 0.42)",
  "hsl(var(--foreground) / 0.30)",
  "hsl(var(--muted-foreground) / 0.7)",
  "hsl(var(--muted-foreground) / 0.5)",
];

const CHART_STYLE = {
  backgroundColor: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "8px",
  fontSize: "12px",
};

// ─── Components ─────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  subValue,
  icon: Icon,
  trend,
  trendLabel,
}: {
  label: string;
  value: string;
  subValue?: string;
  icon: React.ComponentType<{ className?: string }>;
  trend?: "up" | "down" | "neutral";
  trendLabel?: string;
}): React.ReactElement {
  return (
    <Card className="relative overflow-hidden">
      <CardContent className="px-4 pt-4 pb-3">
        <div className="flex items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
            <Icon className="size-5 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider leading-none mb-1">
              {label}
            </p>
            <p className="text-xl font-bold tracking-tight leading-none">{value}</p>
          </div>
        </div>
        {(subValue || (trend && trendLabel)) && (
          <div className="mt-2.5 pt-2 border-t border-border/50 flex items-center gap-1 text-xs">
            {trend === "up" ? (
              <ArrowUpRight className="size-3 text-foreground/50" />
            ) : trend === "down" ? (
              <ArrowDownRight className="size-3 text-destructive" />
            ) : null}
            <span
              className={cn(
                "font-medium truncate",
                trend === "up" && "text-foreground/60",
                trend === "down" && "text-destructive",
                trend === "neutral" && "text-muted-foreground",
                !trend && "text-muted-foreground"
              )}
            >
              {trendLabel ?? subValue}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SkeletonCard(): React.ReactElement {
  return (
    <Card>
      <CardContent className="pt-5 pb-4">
        <div className="space-y-3">
          <div className="h-3 w-24 rounded bg-muted animate-pulse" />
          <div className="h-7 w-20 rounded bg-muted animate-pulse" />
          <div className="h-3 w-16 rounded bg-muted animate-pulse" />
        </div>
      </CardContent>
    </Card>
  );
}

function SkeletonChart(): React.ReactElement {
  return (
    <Card>
      <CardHeader>
        <div className="h-5 w-40 rounded bg-muted animate-pulse" />
      </CardHeader>
      <CardContent>
        <div className="h-64 rounded bg-muted animate-pulse" />
      </CardContent>
    </Card>
  );
}

function FunnelBar({
  label,
  count,
  maxCount,
}: {
  label: string;
  count: number;
  maxCount: number;
}): React.ReactElement {
  const pct = maxCount > 0 ? (count / maxCount) * 100 : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">
          {count.toLocaleString()}
          <span className="text-muted-foreground ml-1 text-xs">
            ({Math.round(pct)}%)
          </span>
        </span>
      </div>
      <div className="h-2.5 w-full rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full bg-foreground/40 transition-all duration-500 w-[var(--bar-w)]"
          style={{ "--bar-w": `${pct}%` } as React.CSSProperties}
        />
      </div>
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function AnalyticsPage(): React.ReactElement {
  const [period, setPeriod] = useState<Period>("30d");
  const { data, isLoading } = useSWR(`/api/analytics?period=${period}`, fetcher, {
    refreshInterval: period === "24h" ? 30000 : 0,
  });

  const analytics = data?.data;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex h-[52px] shrink-0 items-center justify-between gap-3 border-b border-border px-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon-sm" asChild>
            <Link href="/"><ArrowLeft className="size-3.5" /></Link>
          </Button>
          <span className="text-sm font-medium">Analytics</span>
          {period === "24h" && (
            <Badge variant="secondary" className="gap-1">
              <Activity className="size-3" />
              Live
            </Badge>
          )}
        </div>
        <div className="flex gap-0.5 rounded-lg border p-0.5 mr-2">
          {(["24h", "7d", "30d", "90d"] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={cn(
                "px-2.5 py-1 text-xs rounded-md transition-all font-medium",
                period === p
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              )}
            >
              {p}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-6">

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 mb-6 mt-2">
        {isLoading || !analytics ? (
          Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={i} />)
        ) : (
          <>
            <StatCard
              label="Conversations"
              value={analytics.summary.totalConversations.toLocaleString()}
              icon={MessageSquare}
            />
            <StatCard
              label="Messages"
              value={analytics.summary.totalMessages.toLocaleString()}
              icon={BarChart3}
            />
            <StatCard
              label="Avg Response"
              value={formatMs(analytics.summary.avgResponseTimeMs)}
              icon={Clock}
            />
            <StatCard
              label="KB Hit Rate"
              value={`${analytics.summary.kbSearchHitRate}%`}
              icon={Search}
            />
            <StatCard
              label="Input Tokens"
              value={formatTokens(analytics.summary.totalInputTokens)}
              icon={Zap}
            />
            <StatCard
              label="Output Tokens"
              value={formatTokens(analytics.summary.totalOutputTokens)}
              icon={TrendingUp}
            />
            <StatCard
              label="Total Cost"
              value={formatCost(analytics.summary.totalCostUsd)}
              icon={DollarSign}
            />
            <StatCard
              label="Error Rate"
              value={`${analytics.summary.errorRate}%`}
              icon={AlertTriangle}
              trend={
                analytics.summary.errorRate > 5
                  ? "down"
                  : analytics.summary.errorRate > 0
                    ? "neutral"
                    : "up"
              }
              trendLabel={
                analytics.summary.errorRate === 0
                  ? "No errors"
                  : analytics.summary.errorRate > 5
                    ? "High"
                    : "Low"
              }
            />
          </>
        )}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="costs">AI &amp; Costs</TabsTrigger>
          <TabsTrigger value="engagement">Engagement</TabsTrigger>
        </TabsList>

        {/* ─── Overview Tab ──────────────────────────────────────────── */}
        <TabsContent value="overview" className="space-y-6">
          {isLoading || !analytics ? (
            <>
              <SkeletonChart />
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <SkeletonChart />
                <SkeletonChart />
              </div>
            </>
          ) : (
            <>
              {/* Conversations trend */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    {period === "24h" ? "Hourly" : "Daily"} Conversations
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {analytics.timeSeries.length === 0 ? (
                    <div className="flex h-64 items-center justify-center text-muted-foreground text-sm">
                      No data for this period
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height={280}>
                      <AreaChart data={analytics.timeSeries}>
                        <defs>
                          <linearGradient id="convGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.2} />
                            <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                        <XAxis
                          dataKey="date"
                          tickFormatter={formatDate}
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
                        <Tooltip
                          labelFormatter={(l) => formatDate(String(l))}
                          contentStyle={CHART_STYLE}
                        />
                        <Area
                          type="monotone"
                          dataKey="count"
                          stroke="hsl(var(--primary))"
                          fill="url(#convGradient)"
                          strokeWidth={2}
                          name="Conversations"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              {/* Top Agents + Common Questions */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Top Agents</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {analytics.topAgents.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No agent data</p>
                    ) : (
                      <div className="space-y-3">
                        {analytics.topAgents
                          .filter((a) => a.conversationCount > 0)
                          .map((agent, i) => (
                            <div key={agent.agentId} className="flex items-center gap-3">
                              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                                {i + 1}
                              </span>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">{agent.agentName}</p>
                                <p className="text-xs text-muted-foreground">
                                  {agent.conversationCount} conv · {agent.messageCount} msgs
                                </p>
                              </div>
                              <div className="h-2 w-20 rounded-full bg-muted overflow-hidden">
                                <div
                                  className="h-full rounded-full bg-primary/60 w-[var(--agent-bar-w)]"
                                  style={{
                                    "--agent-bar-w": `${Math.round(
                                      (agent.conversationCount /
                                        Math.max(analytics.topAgents[0].conversationCount, 1)) *
                                        100
                                    )}%`,
                                  } as React.CSSProperties}
                                />
                              </div>
                            </div>
                          ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Common Questions</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {analytics.commonFirstMessages.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No message data</p>
                    ) : (
                      <div className="space-y-2">
                        {analytics.commonFirstMessages.map((item, i) => (
                          <div key={i} className="flex items-start gap-2 text-sm">
                            <span className="shrink-0 rounded-md bg-primary/10 px-1.5 py-0.5 text-xs font-semibold text-primary">
                              {item.count}
                            </span>
                            <span className="text-muted-foreground break-words leading-relaxed">
                              {item.message}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </>
          )}
        </TabsContent>

        {/* ─── Performance Tab ───────────────────────────────────────── */}
        <TabsContent value="performance" className="space-y-6">
          {isLoading || !analytics ? (
            <>
              <SkeletonChart />
              <SkeletonChart />
            </>
          ) : (
            <>
              {/* Response time percentiles */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">Response Time Percentiles</CardTitle>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <span className="size-2 rounded-full bg-primary" /> p50
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="size-2 rounded-full bg-muted-foreground/60" /> p95
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="size-2 rounded-full bg-destructive/60" /> p99
                      </span>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {analytics.responsePercentiles.length === 0 ? (
                    <div className="flex h-64 items-center justify-center text-muted-foreground text-sm">
                      No response time data
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height={300}>
                      <LineChart data={analytics.responsePercentiles}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                        <XAxis
                          dataKey="date"
                          tickFormatter={formatDate}
                          className="text-xs"
                          tick={{ fill: "hsl(var(--muted-foreground))" }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <YAxis
                          className="text-xs"
                          tick={{ fill: "hsl(var(--muted-foreground))" }}
                          tickFormatter={(v) => formatMs(Number(v))}
                          axisLine={false}
                          tickLine={false}
                        />
                        <Tooltip
                          labelFormatter={(l) => formatDate(String(l))}
                          formatter={(value, name) => [formatMs(Number(value)), String(name)]}
                          contentStyle={CHART_STYLE}
                        />
                        <Line type="monotone" dataKey="p50Ms" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} name="p50" />
                        <Line type="monotone" dataKey="p95Ms" stroke="hsl(var(--muted-foreground))" strokeWidth={2} dot={false} name="p95" strokeDasharray="4 2" />
                        <Line type="monotone" dataKey="p99Ms" stroke="hsl(var(--destructive))" strokeWidth={1.5} dot={false} name="p99" strokeDasharray="2 2" />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              {/* Error rate + Tool usage */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Error Rate</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {analytics.errorRates.length === 0 ? (
                      <div className="flex h-48 items-center justify-center text-muted-foreground text-sm">
                        No error data
                      </div>
                    ) : (
                      <ResponsiveContainer width="100%" height={220}>
                        <BarChart data={analytics.errorRates}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                          <XAxis dataKey="date" tickFormatter={formatDate} className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                          <YAxis className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))" }} unit="%" axisLine={false} tickLine={false} />
                          <Tooltip labelFormatter={(l) => formatDate(String(l))} contentStyle={CHART_STYLE} formatter={(v) => [`${Number(v)}%`, "Error Rate"]} />
                          <Bar dataKey="rate" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} name="Error Rate" />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Tool Usage</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {analytics.toolUsage.length === 0 ? (
                      <div className="flex h-48 items-center justify-center text-muted-foreground text-sm">
                        No tool call data
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {analytics.toolUsage.slice(0, 8).map((tool) => (
                          <div key={tool.toolName} className="flex items-center justify-between text-sm">
                            <div className="flex items-center gap-2 min-w-0">
                              <Cpu className="size-3.5 text-muted-foreground shrink-0" />
                              <span className="truncate font-medium">{tool.toolName}</span>
                            </div>
                            <div className="flex items-center gap-3 shrink-0">
                              <span className="text-xs text-muted-foreground">{tool.callCount} calls</span>
                              <span className="text-xs text-muted-foreground">{formatMs(tool.avgDurationMs)}</span>
                              <Badge
                                variant={tool.successRate >= 95 ? "secondary" : "destructive"}
                                className="text-xs"
                              >
                                {tool.successRate}%
                              </Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </>
          )}
        </TabsContent>

        {/* ─── AI & Costs Tab ────────────────────────────────────────── */}
        <TabsContent value="costs" className="space-y-6">
          {isLoading || !analytics ? (
            <>
              <SkeletonChart />
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <SkeletonChart />
                <SkeletonChart />
              </div>
            </>
          ) : (
            <>
              {/* Cost trend */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Daily Cost Trend</CardTitle>
                </CardHeader>
                <CardContent>
                  {analytics.costTrend.length === 0 ? (
                    <div className="flex h-64 items-center justify-center text-muted-foreground text-sm">
                      No cost data — costs are tracked when token counts are available
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height={280}>
                      <AreaChart data={analytics.costTrend}>
                        <defs>
                          <linearGradient id="costGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="hsl(var(--foreground))" stopOpacity={0.2} />
                            <stop offset="95%" stopColor="hsl(var(--foreground))" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                        <XAxis dataKey="date" tickFormatter={formatDate} className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                        <YAxis className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => formatCost(Number(v))} axisLine={false} tickLine={false} />
                        <Tooltip
                          labelFormatter={(l) => formatDate(String(l))}
                          formatter={(v, name) => [String(name) === "costUsd" ? formatCost(Number(v)) : formatTokens(Number(v)), String(name) === "costUsd" ? "Cost" : "Tokens"]}
                          contentStyle={CHART_STYLE}
                        />
                        <Area type="monotone" dataKey="costUsd" stroke="hsl(var(--foreground))" fill="url(#costGradient)" strokeWidth={2} name="costUsd" />
                      </AreaChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              {/* Model usage + Token distribution */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Model Usage</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {analytics.modelUsage.length === 0 ? (
                      <div className="flex h-48 items-center justify-center text-muted-foreground text-sm">
                        No model data — models are tracked with new events
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {analytics.modelUsage.map((model) => (
                          <div key={model.model} className="space-y-1">
                            <div className="flex items-center justify-between text-sm">
                              <span className="font-medium truncate">{model.model}</span>
                              <span className="text-xs text-muted-foreground shrink-0 ml-2">
                                {model.requestCount} req · {formatCost(model.totalCostUsd)} · {formatMs(model.avgDurationMs)}
                              </span>
                            </div>
                            <div className="flex gap-1">
                              <div className="h-1.5 rounded-full bg-primary/40 flex-[var(--flex-in)]" style={{ "--flex-in": model.totalInputTokens } as React.CSSProperties} title={`Input: ${formatTokens(model.totalInputTokens)}`} />
                              <div className="h-1.5 rounded-full bg-primary flex-[var(--flex-out)]" style={{ "--flex-out": model.totalOutputTokens } as React.CSSProperties} title={`Output: ${formatTokens(model.totalOutputTokens)}`} />
                            </div>
                          </div>
                        ))}
                        <div className="flex items-center gap-4 text-xs text-muted-foreground pt-1">
                          <span className="flex items-center gap-1">
                            <span className="size-2 rounded-full bg-primary/40" /> Input
                          </span>
                          <span className="flex items-center gap-1">
                            <span className="size-2 rounded-full bg-primary" /> Output
                          </span>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Cost by Model</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {analytics.modelUsage.length === 0 ? (
                      <div className="flex h-48 items-center justify-center text-muted-foreground text-sm">
                        No cost breakdown
                      </div>
                    ) : (
                      <ResponsiveContainer width="100%" height={220}>
                        <PieChart>
                          <Pie
                            data={analytics.modelUsage.filter((m) => m.totalCostUsd > 0)}
                            dataKey="totalCostUsd"
                            nameKey="model"
                            cx="50%"
                            cy="50%"
                            innerRadius={50}
                            outerRadius={90}
                            paddingAngle={2}
                          >
                            {analytics.modelUsage
                              .filter((m) => m.totalCostUsd > 0)
                              .map((_, i) => (
                                <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                              ))}
                          </Pie>
                          <Tooltip
                            contentStyle={CHART_STYLE}
                            formatter={(v) => [formatCost(Number(v)), "Cost"]}
                          />
                          <Legend
                            verticalAlign="bottom"
                            height={36}
                            formatter={(value) => (
                              <span className="text-xs">{String(value)}</span>
                            )}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    )}
                  </CardContent>
                </Card>
              </div>
            </>
          )}
        </TabsContent>

        {/* ─── Engagement Tab ────────────────────────────────────────── */}
        <TabsContent value="engagement" className="space-y-6">
          {isLoading || !analytics ? (
            <>
              <SkeletonChart />
              <SkeletonChart />
            </>
          ) : (
            <>
              {/* Conversation Funnel */}
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Users className="size-4 text-muted-foreground" />
                    <CardTitle className="text-base">Conversation Funnel</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4 max-w-lg">
                    <FunnelBar
                      label="Started conversation"
                      count={analytics.conversationFunnel.started}
                      maxCount={analytics.conversationFunnel.started}
                    />
                    <FunnelBar
                      label="Sent a message"
                      count={analytics.conversationFunnel.sentMessage}
                      maxCount={analytics.conversationFunnel.started}
                    />
                    <FunnelBar
                      label="Multi-turn (3+ messages)"
                      count={analytics.conversationFunnel.multiTurn}
                      maxCount={analytics.conversationFunnel.started}
                    />
                    <FunnelBar
                      label="Completed"
                      count={analytics.conversationFunnel.completed}
                      maxCount={analytics.conversationFunnel.started}
                    />
                  </div>
                </CardContent>
              </Card>

              {/* KB stats */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Knowledge Base Search</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {analytics.kbSearchStats.totalSearches === 0 ? (
                      <div className="flex h-48 items-center justify-center text-muted-foreground text-sm">
                        No KB searches recorded
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div className="grid grid-cols-3 gap-4">
                          <div className="text-center">
                            <p className="text-2xl font-bold">{analytics.kbSearchStats.totalSearches}</p>
                            <p className="text-xs text-muted-foreground">Total Searches</p>
                          </div>
                          <div className="text-center">
                            <p className="text-2xl font-bold text-foreground">{analytics.kbSearchStats.withResults}</p>
                            <p className="text-xs text-muted-foreground">With Results</p>
                          </div>
                          <div className="text-center">
                            <p className="text-2xl font-bold text-muted-foreground">{analytics.kbSearchStats.withoutResults}</p>
                            <p className="text-xs text-muted-foreground">No Results</p>
                          </div>
                        </div>
                        <div className="h-3 w-full rounded-full bg-muted overflow-hidden flex">
                          <div
                            className="h-full bg-foreground/60 transition-all w-[var(--kb-hit-w)]"
                            style={{
                              "--kb-hit-w": `${Math.round(
                                (analytics.kbSearchStats.withResults /
                                  analytics.kbSearchStats.totalSearches) *
                                  100
                              )}%`,
                            } as React.CSSProperties}
                          />
                          <div
                            className="h-full bg-muted-foreground/30 transition-all w-[var(--kb-miss-w)]"
                            style={{
                              "--kb-miss-w": `${Math.round(
                                (analytics.kbSearchStats.withoutResults /
                                  analytics.kbSearchStats.totalSearches) *
                                  100
                              )}%`,
                            } as React.CSSProperties}
                          />
                        </div>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <span className="size-2 rounded-full bg-foreground/60" /> Hit ({analytics.summary.kbSearchHitRate}%)
                          </span>
                          <span className="flex items-center gap-1">
                            <span className="size-2 rounded-full bg-muted-foreground/30" /> Miss ({100 - analytics.summary.kbSearchHitRate}%)
                          </span>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Session Summary</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between py-2 border-b border-border">
                        <span className="text-sm text-muted-foreground">Avg messages per conversation</span>
                        <span className="text-sm font-medium">
                          {analytics.summary.totalConversations > 0
                            ? (analytics.summary.totalMessages / analytics.summary.totalConversations).toFixed(1)
                            : "0"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between py-2 border-b border-border">
                        <span className="text-sm text-muted-foreground">Multi-turn rate</span>
                        <span className="text-sm font-medium">
                          {analytics.conversationFunnel.started > 0
                            ? `${Math.round((analytics.conversationFunnel.multiTurn / analytics.conversationFunnel.started) * 100)}%`
                            : "0%"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between py-2 border-b border-border">
                        <span className="text-sm text-muted-foreground">Completion rate</span>
                        <span className="text-sm font-medium">
                          {analytics.conversationFunnel.started > 0
                            ? `${Math.round((analytics.conversationFunnel.completed / analytics.conversationFunnel.started) * 100)}%`
                            : "0%"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between py-2">
                        <span className="text-sm text-muted-foreground">Total cost per conversation</span>
                        <span className="text-sm font-medium">
                          {analytics.summary.totalConversations > 0
                            ? formatCost(analytics.summary.totalCostUsd / analytics.summary.totalConversations)
                            : "$0"}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </>
          )}
        </TabsContent>
      </Tabs>
      </div>
    </div>
  );
}
