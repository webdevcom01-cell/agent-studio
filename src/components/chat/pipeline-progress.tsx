"use client";

import useSWR from "swr";
import { CheckCircle2, XCircle, Loader2, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

interface AgentCallEntry {
  id: string;
  calleeAgent: { id: string; name: string } | null;
  status: "SUBMITTED" | "WORKING" | "COMPLETED" | "FAILED" | "INPUT_REQUIRED";
  durationMs: number | null;
  createdAt: string;
  errorMessage: string | null;
}

interface PipelineProgressProps {
  agentId: string;
  conversationId: string | null;
  isLoading: boolean;
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function StatusIcon({ status }: { status: AgentCallEntry["status"] }) {
  switch (status) {
    case "COMPLETED":
      return <CheckCircle2 className="size-3.5 text-emerald-500 shrink-0" />;
    case "FAILED":
      return <XCircle className="size-3.5 text-red-500 shrink-0" />;
    case "WORKING":
      return <Loader2 className="size-3.5 text-blue-400 shrink-0 animate-spin" />;
    default:
      return <Clock className="size-3.5 text-zinc-500 shrink-0" />;
  }
}

export function PipelineProgress({
  agentId,
  conversationId,
  isLoading,
}: PipelineProgressProps) {
  const shouldPoll = isLoading && !!conversationId;

  const { data } = useSWR<{ success: boolean; data: AgentCallEntry[] }>(
    shouldPoll
      ? `/api/agent-calls?agentId=${agentId}&conversationId=${conversationId}&limit=30`
      : null,
    fetcher,
    {
      refreshInterval: shouldPoll ? 3000 : 0,
      revalidateOnFocus: false,
    }
  );

  const calls = data?.success ? data.data : [];

  // Only show panel when there are sub-agent calls
  if (calls.length === 0) return null;

  const completed = calls.filter((c) => c.status === "COMPLETED").length;
  const failed = calls.filter((c) => c.status === "FAILED").length;
  const total = calls.length;
  const allDone = !isLoading || (completed + failed === total && total > 0);

  return (
    <div
      className={cn(
        "mx-auto max-w-2xl mb-2 rounded-lg border text-xs overflow-hidden",
        allDone ? "border-border/50" : "border-blue-500/30"
      )}
    >
      {/* Header bar */}
      <div
        className={cn(
          "flex items-center justify-between px-3 py-1.5",
          allDone ? "bg-muted/40" : "bg-blue-500/10"
        )}
      >
        <span className="font-medium text-muted-foreground">
          Pipeline
          {!allDone && (
            <Loader2 className="inline ml-1.5 size-3 animate-spin text-blue-400" />
          )}
        </span>
        <span className="text-muted-foreground tabular-nums">
          {completed}/{total} completed
          {failed > 0 && (
            <span className="ml-1.5 text-red-400">{failed} failed</span>
          )}
        </span>
      </div>

      {/* Agent rows */}
      <div className="divide-y divide-border/30">
        {calls
          .slice()
          .reverse()
          .map((call) => (
            <div
              key={call.id}
              className="flex items-center gap-2 px-3 py-1.5 bg-background/40"
            >
              <StatusIcon status={call.status} />
              <span
                className={cn(
                  "flex-1 truncate",
                  call.status === "FAILED"
                    ? "text-red-400"
                    : "text-foreground/80"
                )}
              >
                {call.calleeAgent?.name ?? "Unknown Agent"}
              </span>
              {call.durationMs !== null && (
                <span className="tabular-nums text-muted-foreground shrink-0">
                  {formatDuration(call.durationMs)}
                </span>
              )}
              {call.status === "WORKING" && call.durationMs === null && (
                <span className="tabular-nums text-blue-400/70 shrink-0">
                  {formatDuration(Date.now() - new Date(call.createdAt).getTime())}
                </span>
              )}
            </div>
          ))}
      </div>
    </div>
  );
}
