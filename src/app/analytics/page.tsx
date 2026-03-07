"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { ArrowLeft, MessageSquare, Clock, Search, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

type Period = "7d" | "30d" | "90d";

interface AnalyticsData {
  summary: {
    totalConversations: number;
    totalMessages: number;
    avgResponseTimeMs: number;
    kbSearchHitRate: number;
  };
  dailyConversations: { date: string; count: number }[];
  topAgents: {
    agentId: string;
    agentName: string;
    conversationCount: number;
    messageCount: number;
  }[];
  commonFirstMessages: { message: string; count: number }[];
  avgResponseTimeByDay: { date: string; avgMs: number }[];
  kbSearchStats: {
    totalSearches: number;
    withResults: number;
    withoutResults: number;
  };
}

const fetcher = (url: string): Promise<{ success: boolean; data: AnalyticsData }> =>
  fetch(url).then((r) => r.json());

function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function StatCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
}): React.ReactElement {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10">
            <Icon className="size-5 text-primary" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="text-2xl font-bold">{value}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function SkeletonCard(): React.ReactElement {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-lg bg-muted animate-pulse" />
          <div className="space-y-2">
            <div className="h-3 w-20 rounded bg-muted animate-pulse" />
            <div className="h-6 w-16 rounded bg-muted animate-pulse" />
          </div>
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

export default function AnalyticsPage(): React.ReactElement {
  const [period, setPeriod] = useState<Period>("30d");
  const { data, isLoading } = useSWR(
    `/api/analytics?period=${period}`,
    fetcher
  );

  const analytics = data?.data;

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon-sm" asChild>
            <Link href="/">
              <ArrowLeft className="size-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Analytics</h1>
            <p className="text-muted-foreground text-sm mt-0.5">
              Agent usage and performance metrics
            </p>
          </div>
        </div>
        <div className="flex gap-1 rounded-lg border p-1">
          {(["7d", "30d", "90d"] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={cn(
                "px-3 py-1 text-sm rounded-md transition-colors",
                period === p
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        {isLoading || !analytics ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : (
          <>
            <StatCard
              label="Total Conversations"
              value={analytics.summary.totalConversations.toLocaleString()}
              icon={MessageSquare}
            />
            <StatCard
              label="Total Messages"
              value={analytics.summary.totalMessages.toLocaleString()}
              icon={BarChart3}
            />
            <StatCard
              label="Avg Response Time"
              value={formatMs(analytics.summary.avgResponseTimeMs)}
              icon={Clock}
            />
            <StatCard
              label="KB Search Hit Rate"
              value={`${analytics.summary.kbSearchHitRate}%`}
              icon={Search}
            />
          </>
        )}
      </div>

      {/* Daily conversations chart */}
      {isLoading || !analytics ? (
        <SkeletonChart />
      ) : (
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="text-base">Daily Conversations</CardTitle>
          </CardHeader>
          <CardContent>
            {analytics.dailyConversations.length === 0 ? (
              <div className="flex h-64 items-center justify-center text-muted-foreground text-sm">
                No conversation data for this period
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={264}>
                <AreaChart data={analytics.dailyConversations}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={formatDate}
                    className="text-xs"
                    tick={{ fill: "hsl(var(--muted-foreground))" }}
                  />
                  <YAxis
                    className="text-xs"
                    tick={{ fill: "hsl(var(--muted-foreground))" }}
                    allowDecimals={false}
                  />
                  <Tooltip
                    labelFormatter={(label: ReactNode) => formatDate(String(label))}
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="count"
                    stroke="hsl(var(--primary))"
                    fill="hsl(var(--primary))"
                    fillOpacity={0.1}
                    name="Conversations"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      )}

      {/* Two column: Top Agents + Common Questions */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2 mb-8">
        {isLoading || !analytics ? (
          <>
            <SkeletonChart />
            <SkeletonChart />
          </>
        ) : (
          <>
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
                        <div
                          key={agent.agentId}
                          className="flex items-center gap-3"
                        >
                          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
                            {i + 1}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">
                              {agent.agentName}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {agent.conversationCount} conversations, {agent.messageCount} messages
                            </p>
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
                      <div
                        key={i}
                        className="flex items-start gap-2 text-sm"
                      >
                        <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-xs font-medium">
                          {item.count}
                        </span>
                        <span className="text-muted-foreground break-words">
                          {item.message}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Response time chart */}
      {isLoading || !analytics ? (
        <SkeletonChart />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Average Response Time</CardTitle>
          </CardHeader>
          <CardContent>
            {analytics.avgResponseTimeByDay.length === 0 ? (
              <div className="flex h-64 items-center justify-center text-muted-foreground text-sm">
                No response time data for this period
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={264}>
                <LineChart data={analytics.avgResponseTimeByDay}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={formatDate}
                    className="text-xs"
                    tick={{ fill: "hsl(var(--muted-foreground))" }}
                  />
                  <YAxis
                    className="text-xs"
                    tick={{ fill: "hsl(var(--muted-foreground))" }}
                    tickFormatter={(v: number) => formatMs(v)}
                  />
                  <Tooltip
                    labelFormatter={(label: ReactNode) => formatDate(String(label))}
                    formatter={(value: ReactNode) => [formatMs(Number(value)), "Avg Response"]}
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="avgMs"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    dot={false}
                    name="Avg Response"
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
