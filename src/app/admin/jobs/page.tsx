"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RefreshCcw } from "lucide-react";

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

export default function JobMonitorPage(): React.ReactElement {
  const [stats, setStats] = useState<QueueStats | null>(null);
  const [recentJobs, setRecentJobs] = useState<JobInfo[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/jobs");
      if (res.ok) {
        const data = (await res.json()) as {
          success: boolean;
          data?: { stats: QueueStats; recentJobs: JobInfo[] };
        };
        if (data.success && data.data) {
          setStats(data.data.stats);
          setRecentJobs(data.data.recentJobs);
        }
      }
    } catch {
      // Silently fail — dashboard is informational
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  return (
    <div className="container mx-auto max-w-5xl py-8 px-4">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Job Queue Monitor</h1>
        <Button
          variant="outline"
          size="sm"
          onClick={fetchData}
          disabled={loading}
        >
          <RefreshCcw className={`mr-2 size-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {stats && (
        <div className="grid grid-cols-5 gap-3 mb-6">
          <StatCard label="Waiting" value={stats.waiting} color="text-yellow-400" />
          <StatCard label="Active" value={stats.active} color="text-blue-400" />
          <StatCard label="Completed" value={stats.completed} color="text-green-400" />
          <StatCard label="Failed" value={stats.failed} color="text-red-400" />
          <StatCard label="Delayed" value={stats.delayed} color="text-orange-400" />
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="p-3">Job ID</th>
                <th className="p-3">Type</th>
                <th className="p-3">State</th>
                <th className="p-3">Progress</th>
                <th className="p-3">Attempts</th>
                <th className="p-3">Created</th>
              </tr>
            </thead>
            <tbody>
              {recentJobs.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-muted-foreground">
                    No jobs found
                  </td>
                </tr>
              )}
              {recentJobs.map((job) => (
                <tr key={job.id} className="border-b hover:bg-muted/30">
                  <td className="p-3 font-mono text-xs">{job.id}</td>
                  <td className="p-3">{job.name}</td>
                  <td className="p-3">
                    <span className={`text-xs font-medium ${stateColor(job.state)}`}>
                      {job.state}
                    </span>
                  </td>
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-16 rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${job.progress}%` }}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground">{job.progress}%</span>
                    </div>
                  </td>
                  <td className="p-3 text-xs">{job.attemptsMade}</td>
                  <td className="p-3 text-xs text-muted-foreground">
                    {new Date(job.createdAt).toLocaleTimeString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }): React.ReactElement {
  return (
    <Card>
      <CardContent className="p-4 text-center">
        <p className={`text-2xl font-bold ${color}`}>{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </CardContent>
    </Card>
  );
}

function stateColor(state: string): string {
  switch (state) {
    case "active": return "text-blue-400";
    case "completed": return "text-green-400";
    case "failed": return "text-red-400";
    case "waiting": return "text-yellow-400";
    case "delayed": return "text-orange-400";
    default: return "text-muted-foreground";
  }
}
