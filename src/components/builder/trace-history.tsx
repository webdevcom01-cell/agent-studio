"use client";

import { useCallback, useEffect, useState } from "react";
import {
  History,
  CheckCircle2,
  XCircle,
  Loader2,
  Clock,
  Play,
  Trash2,
  X,
  ChevronRight,
} from "lucide-react";
import type { FlowTraceSummary } from "@/lib/types/flow-trace";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TraceHistoryProps {
  agentId: string;
  /** Currently loaded trace ID (highlighted in the list) */
  activeTraceId?: string;
  onReplay: (traceId: string, testInput: string) => void;
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDuration(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatRelativeTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const diff = Date.now() - d.getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return d.toLocaleDateString();
}

function StatusIcon({ status }: { status: string }) {
  if (status === "COMPLETED")
    return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />;
  if (status === "FAILED")
    return <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />;
  return <Loader2 className="w-3.5 h-3.5 text-violet-400 animate-spin shrink-0" />;
}

// ---------------------------------------------------------------------------
// TraceHistoryPanel
// ---------------------------------------------------------------------------

export function TraceHistoryPanel({
  agentId,
  activeTraceId,
  onReplay,
  onClose,
}: TraceHistoryProps) {
  const [traces, setTraces] = useState<FlowTraceSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchTraces = useCallback(async () => {
    try {
      const res = await fetch(`/api/agents/${agentId}/traces`);
      if (!res.ok) return;
      const json = await res.json();
      if (json.success) {
        setTraces(json.data as FlowTraceSummary[]);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    void fetchTraces();
  }, [fetchTraces]);

  const handleDelete = useCallback(
    async (traceId: string, e: React.MouseEvent) => {
      e.stopPropagation();
      setDeletingId(traceId);
      try {
        await fetch(`/api/agents/${agentId}/traces/${traceId}`, {
          method: "DELETE",
        });
        setTraces((prev) => prev.filter((t) => t.id !== traceId));
      } catch {
        // ignore
      } finally {
        setDeletingId(null);
      }
    },
    [agentId]
  );

  const handleReplay = useCallback(
    (trace: FlowTraceSummary, e: React.MouseEvent) => {
      e.stopPropagation();
      if (trace.testInput) {
        onReplay(trace.id, trace.testInput);
      }
    },
    [onReplay]
  );

  return (
    <div className="flex flex-col h-full bg-zinc-900 border-r border-zinc-800 w-72 shrink-0">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <History className="w-4 h-4 text-violet-400" />
          <span className="text-sm font-medium text-zinc-200">Trace History</span>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 transition-colors"
          aria-label="Close trace history"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-8 text-zinc-500">
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
            <span className="text-sm">Loading…</span>
          </div>
        ) : traces.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
            <History className="w-8 h-8 text-zinc-600 mb-2" />
            <p className="text-sm text-zinc-500">No traces yet.</p>
            <p className="text-xs text-zinc-600 mt-1">
              Run a debug session to see history here.
            </p>
          </div>
        ) : (
          <ul className="py-1">
            {traces.map((trace) => (
              <TraceRow
                key={trace.id}
                trace={trace}
                isActive={trace.id === activeTraceId}
                isDeleting={deletingId === trace.id}
                onReplay={handleReplay}
                onDelete={handleDelete}
              />
            ))}
          </ul>
        )}
      </div>

      {/* Footer */}
      {traces.length > 0 && (
        <div className="px-3 py-2 border-t border-zinc-800 text-xs text-zinc-600">
          {traces.length} trace{traces.length !== 1 ? "s" : ""} · last 20 kept
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// TraceRow
// ---------------------------------------------------------------------------

interface TraceRowProps {
  trace: FlowTraceSummary;
  isActive: boolean;
  isDeleting: boolean;
  onReplay: (trace: FlowTraceSummary, e: React.MouseEvent) => void;
  onDelete: (traceId: string, e: React.MouseEvent) => void;
}

function TraceRow({
  trace,
  isActive,
  isDeleting,
  onReplay,
  onDelete,
}: TraceRowProps) {
  const [hovered, setHovered] = useState(false);

  const truncatedInput = trace.testInput
    ? trace.testInput.length > 48
      ? trace.testInput.slice(0, 48) + "…"
      : trace.testInput
    : "(no input)";

  return (
    <li
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`
        relative group px-3 py-2.5 border-b border-zinc-800/60 cursor-default
        transition-colors
        ${isActive
          ? "bg-violet-950/40 border-l-2 border-l-violet-500"
          : "hover:bg-zinc-800/50"
        }
      `}
    >
      {/* Top row: status + time */}
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <StatusIcon status={trace.status} />
          <span
            className={`text-xs font-medium ${
              trace.status === "COMPLETED"
                ? "text-emerald-400"
                : trace.status === "FAILED"
                ? "text-red-400"
                : "text-violet-400"
            }`}
          >
            {trace.status === "COMPLETED"
              ? "Completed"
              : trace.status === "FAILED"
              ? "Failed"
              : "Running"}
          </span>
        </div>
        <span className="text-xs text-zinc-600 shrink-0 ml-2">
          {formatRelativeTime(trace.createdAt)}
        </span>
      </div>

      {/* Input preview */}
      <p className="text-xs text-zinc-400 truncate mb-1.5">{truncatedInput}</p>

      {/* Stats row */}
      <div className="flex items-center gap-3 text-xs text-zinc-600">
        <span className="flex items-center gap-1">
          <Clock className="w-3 h-3" />
          {formatDuration(trace.totalDurationMs)}
        </span>
        {trace.nodesExecuted != null && (
          <span className="flex items-center gap-1">
            <ChevronRight className="w-3 h-3" />
            {trace.nodesExecuted} node{trace.nodesExecuted !== 1 ? "s" : ""}
          </span>
        )}
        {trace.nodesFailed != null && trace.nodesFailed > 0 && (
          <span className="text-red-500">
            {trace.nodesFailed} failed
          </span>
        )}
      </div>

      {/* Action buttons — visible on hover */}
      {hovered && (
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {trace.testInput && (
            <button
              onClick={(e) => onReplay(trace, e)}
              className="p-1 rounded bg-zinc-700 hover:bg-violet-700 text-zinc-300 hover:text-white transition-colors"
              title="Replay this trace"
            >
              <Play className="w-3 h-3" />
            </button>
          )}
          <button
            onClick={(e) => onDelete(trace.id, e)}
            disabled={isDeleting}
            className="p-1 rounded bg-zinc-700 hover:bg-red-700 text-zinc-300 hover:text-white transition-colors disabled:opacity-50"
            title="Delete trace"
          >
            {isDeleting ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Trash2 className="w-3 h-3" />
            )}
          </button>
        </div>
      )}

      {/* Active indicator chevron */}
      {isActive && (
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-6 bg-violet-500 rounded-r" />
      )}
    </li>
  );
}
