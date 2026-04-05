"use client";

import React from "react";
import useSWR from "swr";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Users,
  Bot,
  Activity,
  AlertTriangle,
  MessageSquare,
  Clock,
  TrendingUp,
  Layers,
} from "lucide-react";

interface AdminStats {
  overview: {
    totalUsers: number;
    activeUsers: number;
    totalAgents: number;
    totalConversations: number;
    recentConversations: number;
  };
  webhooks: {
    executions30d: number;
    failed30d: number;
    errorRate: number;
  };
  queue: {
    waiting: number;
    delayed: number;
  };
  topUsers: Array<{
    id: string;
    name: string;
    email: string;
    agentCount: number;
    joinedAt: string;
  }>;
}

interface QueueStats {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}

interface JobInfo {
  id: string;
  name: string;
  state: string;
  progress: number;
  attemptsMade: number;
  createdAt: string;
  failedReason?: string;
}

interface JobsData {
  stats: QueueStats;
  recentJobs: JobInfo[];
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function AdminDashboardPage(): React.ReactElement {
  const { data: statsRes, isLoading: statsLoading } = useSWR<{
    success: boolean;
    data?: AdminStats;
  }>("/api/admin/stats", fetcher, { refreshInterval: 30_000 });

  const { data: jobsRes, isLoading: jobsLoading } = useSWR<{
    success: boolean;
    data?: JobsData;
  }>("/api/admin/jobs", fetcher, { refreshInterval: 10_000 });

  const stats = statsRes?.data;
  const jobs = jobsRes?.data;

  return (
    <div className="flex h-full flex-col overflow-hidden"><div className="flex-1 overflow-y-auto px-4 py-8"><div className="mx-auto max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-base font-semibold">Admin Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Visibility only — no enforcement. Auto-refreshes every 30s.
          </p>
        </div>
        <Link
          href="/"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          ← Back to agents
        </Link>
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="mb-6">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="jobs">Job Queue</TabsTrigger>
          <TabsTrigger value="users">Top Users</TabsTrigger>
        </TabsList>

        {/* ── Overview ─────────────────────────────────────────────── */}
        <TabsContent value="overview">
          {statsLoading && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-24 rounded-xl" />
              ))}
            </div>
          )}

          {stats && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <MetricCard
                  icon={<Users className="size-4" />}
                  label="Total Users"
                  value={stats.overview.totalUsers}
                  color="text-muted-foreground"
                />
                <MetricCard
                  icon={<Users className="size-4" />}
                  label="Active Users (24h)"
                  value={stats.overview.activeUsers}
                  color="text-muted-foreground"
                />
                <MetricCard
                  icon={<Bot className="size-4" />}
                  label="Total Agents"
                  value={stats.overview.totalAgents}
                  color="text-muted-foreground"
                />
                <MetricCard
                  icon={<MessageSquare className="size-4" />}
                  label="Total Conversations"
                  value={stats.overview.totalConversations}
                  color="text-muted-foreground"
                />
                <MetricCard
                  icon={<TrendingUp className="size-4" />}
                  label="Conversations (30d)"
                  value={stats.overview.recentConversations}
                  color="text-muted-foreground"
                />
                <MetricCard
                  icon={<Activity className="size-4" />}
                  label="Webhook Executions (30d)"
                  value={stats.webhooks.executions30d}
                  color="text-muted-foreground"
                />
                <MetricCard
                  icon={<AlertTriangle className="size-4" />}
                  label="Webhook Error Rate"
                  value={`${stats.webhooks.errorRate.toFixed(1)}%`}
                  color={
                    stats.webhooks.errorRate > 10
                      ? "text-destructive"
                      : "text-muted-foreground"
                  }
                />
                <MetricCard
                  icon={<Layers className="size-4" />}
                  label="Queue Depth"
                  value={stats.queue.waiting + stats.queue.delayed}
                  sub={`${stats.queue.waiting} waiting · ${stats.queue.delayed} delayed`}
                  color="text-muted-foreground"
                />
              </div>
            </>
          )}
        </TabsContent>

        {/* ── Job Queue ─────────────────────────────────────────────── */}
        <TabsContent value="jobs">
          {jobsLoading && <Skeleton className="h-64 rounded-xl" />}

          {jobs && (
            <>
              <div className="grid grid-cols-5 gap-3 mb-6">
                <QueueCard label="Waiting" value={jobs.stats.waiting} color="text-muted-foreground" />
                <QueueCard label="Active" value={jobs.stats.active} color="text-muted-foreground" />
                <QueueCard label="Completed" value={jobs.stats.completed} color="text-muted-foreground" />
                <QueueCard label="Failed" value={jobs.stats.failed} color="text-destructive" />
                <QueueCard label="Delayed" value={jobs.stats.delayed} color="text-muted-foreground" />
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Recent Jobs
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left">
                        <th className="px-4 py-2 text-xs text-muted-foreground font-medium">ID</th>
                        <th className="px-4 py-2 text-xs text-muted-foreground font-medium">Type</th>
                        <th className="px-4 py-2 text-xs text-muted-foreground font-medium">State</th>
                        <th className="px-4 py-2 text-xs text-muted-foreground font-medium">Progress</th>
                        <th className="px-4 py-2 text-xs text-muted-foreground font-medium">Attempts</th>
                        <th className="px-4 py-2 text-xs text-muted-foreground font-medium">Created</th>
                      </tr>
                    </thead>
                    <tbody>
                      {jobs.recentJobs.length === 0 && (
                        <tr>
                          <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground text-sm">
                            No jobs in queue
                          </td>
                        </tr>
                      )}
                      {jobs.recentJobs.map((job) => (
                        <tr key={job.id} className="border-b last:border-0 hover:bg-muted/20">
                          <td className="px-4 py-2 font-mono text-xs text-muted-foreground truncate max-w-24">
                            {job.id}
                          </td>
                          <td className="px-4 py-2">
                            <Badge variant="outline" className="text-xs font-normal">
                              {job.name}
                            </Badge>
                          </td>
                          <td className="px-4 py-2">
                            <span className={`text-xs font-medium ${stateColor(job.state)}`}>
                              {job.state}
                            </span>
                          </td>
                          <td className="px-4 py-2">
                            <div className="flex items-center gap-2">
                              <div className="h-1.5 w-14 rounded-full bg-muted">
                                <div
                                  className="h-full rounded-full bg-primary transition-all w-[var(--job-progress)]"
                                  style={{ "--job-progress": `${job.progress}%` } as React.CSSProperties}
                                />
                              </div>
                              <span className="text-xs text-muted-foreground w-7">
                                {job.progress}%
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-2 text-xs text-center">{job.attemptsMade}</td>
                          <td className="px-4 py-2 text-xs text-muted-foreground">
                            {new Date(job.createdAt).toLocaleTimeString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* ── Top Users ─────────────────────────────────────────────── */}
        <TabsContent value="users">
          {statsLoading && <Skeleton className="h-64 rounded-xl" />}

          {stats && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Top Users by Agent Count
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="px-4 py-2 text-xs text-muted-foreground font-medium">#</th>
                      <th className="px-4 py-2 text-xs text-muted-foreground font-medium">Name</th>
                      <th className="px-4 py-2 text-xs text-muted-foreground font-medium">Email</th>
                      <th className="px-4 py-2 text-xs text-muted-foreground font-medium">Agents</th>
                      <th className="px-4 py-2 text-xs text-muted-foreground font-medium">
                        <Clock className="size-3 inline mr-1" />
                        Joined
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.topUsers.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground text-sm">
                          No users with agents yet
                        </td>
                      </tr>
                    )}
                    {stats.topUsers.map((user, i) => (
                      <tr key={user.id} className="border-b last:border-0 hover:bg-muted/20">
                        <td className="px-4 py-2 text-xs text-muted-foreground">{i + 1}</td>
                        <td className="px-4 py-2 font-medium text-sm">{user.name}</td>
                        <td className="px-4 py-2 text-xs text-muted-foreground">{user.email}</td>
                        <td className="px-4 py-2">
                          <Badge variant="secondary">{user.agentCount}</Badge>
                        </td>
                        <td className="px-4 py-2 text-xs text-muted-foreground">
                          {new Date(user.joinedAt).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div></div></div>
  );
}

function MetricCard({
  icon,
  label,
  value,
  color,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  color: string;
  sub?: string;
}): React.ReactElement {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className={`mt-0.5 ${color}`}>{icon}</div>
          <div className="min-w-0">
            <p className={`text-xl font-bold leading-tight ${color}`}>{value}</p>
            <p className="text-xs text-muted-foreground leading-tight mt-0.5">{label}</p>
            {sub && <p className="text-xs text-muted-foreground/70 mt-1">{sub}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function QueueCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}): React.ReactElement {
  return (
    <Card>
      <CardContent className="p-4 text-center">
        <p className={`text-2xl font-bold ${color}`}>{value}</p>
        <p className="text-xs text-muted-foreground mt-1">{label}</p>
      </CardContent>
    </Card>
  );
}

function stateColor(state: string): string {
  switch (state) {
    case "failed": return "text-destructive";
    case "completed": return "text-foreground/60";
    default: return "text-muted-foreground";
  }
}
