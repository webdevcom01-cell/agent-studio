"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RefreshCcw, Users, Bot, Activity, AlertTriangle } from "lucide-react";

interface AdminStats {
  activeUsers: number;
  totalAgents: number;
  pipelineExecutions: number;
  errorRate: number;
  queueDepth: number;
  totalConversations: number;
}

export default function AdminDashboardPage(): React.ReactElement {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/stats");
      if (res.ok) {
        const data = (await res.json()) as { success: boolean; data?: AdminStats };
        if (data.success && data.data) {
          setStats(data.data);
        }
      }
    } catch {
      // Dashboard is informational
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 30_000);
    return () => clearInterval(interval);
  }, [fetchStats]);

  return (
    <div className="container mx-auto max-w-5xl py-8 px-4">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Admin Dashboard</h1>
        <Button variant="outline" size="sm" onClick={fetchStats} disabled={loading}>
          <RefreshCcw className={`mr-2 size-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {stats && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          <MetricCard
            icon={<Users className="size-5" />}
            label="Active Users"
            value={stats.activeUsers}
            color="text-blue-400"
          />
          <MetricCard
            icon={<Bot className="size-5" />}
            label="Total Agents"
            value={stats.totalAgents}
            color="text-green-400"
          />
          <MetricCard
            icon={<Activity className="size-5" />}
            label="Pipeline Executions"
            value={stats.pipelineExecutions}
            color="text-purple-400"
          />
          <MetricCard
            icon={<AlertTriangle className="size-5" />}
            label="Error Rate"
            value={`${stats.errorRate.toFixed(1)}%`}
            color={stats.errorRate > 5 ? "text-red-400" : "text-green-400"}
          />
          <MetricCard
            icon={<Activity className="size-5" />}
            label="Queue Depth"
            value={stats.queueDepth}
            color="text-yellow-400"
          />
          <MetricCard
            icon={<Activity className="size-5" />}
            label="Conversations"
            value={stats.totalConversations}
            color="text-cyan-400"
          />
        </div>
      )}

      {!stats && !loading && (
        <Card>
          <CardContent className="p-12 text-center text-muted-foreground">
            Failed to load stats. Check API connection.
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function MetricCard({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  color: string;
}): React.ReactElement {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center gap-3">
          <div className={color}>{icon}</div>
          <div>
            <p className={`text-2xl font-bold ${color}`}>{value}</p>
            <p className="text-xs text-muted-foreground">{label}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
