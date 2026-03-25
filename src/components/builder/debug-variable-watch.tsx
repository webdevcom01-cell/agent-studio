"use client";

import { useState, useCallback } from "react";
import {
  Variable,
  X,
  Pencil,
  Check,
  RotateCcw,
  ChevronDown,
  ChevronRight,
  Plus,
  Minus,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { VariableDiff, VariableDiffEntry } from "./use-debug-session";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DebugVariableWatchProps {
  /** Live variables from the engine (debug_node_start snapshot) */
  currentVariables: Record<string, unknown>;
  /** Diff from the previous node */
  variableDiff: VariableDiff;
  /** User edits pending commit */
  pendingEdits: Record<string, unknown>;
  /** Whether the flow is paused (enables edit mode) */
  isPaused: boolean;
  /** Callback to update a pending edit */
  onEditVariable: (key: string, value: unknown) => void;
  /** Discard all pending edits */
  onResetEdits: () => void;
  /** Close the panel */
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getChangeIcon(change: VariableDiffEntry["change"]) {
  if (change === "new") return <Plus className="w-2.5 h-2.5 text-emerald-400 shrink-0" />;
  if (change === "modified") return <RefreshCw className="w-2.5 h-2.5 text-yellow-400 shrink-0" />;
  return <Minus className="w-2.5 h-2.5 text-red-400 shrink-0" />;
}

function getChangeBg(change: VariableDiffEntry["change"]) {
  if (change === "new") return "bg-emerald-950/30 border-l-2 border-l-emerald-600";
  if (change === "modified") return "bg-yellow-950/30 border-l-2 border-l-yellow-500";
  return "bg-red-950/20 border-l-2 border-l-red-700 opacity-60";
}

function tryParseJson(str: string): { value: unknown; ok: boolean } {
  try {
    return { value: JSON.parse(str), ok: true };
  } catch {
    // If it doesn't parse as JSON, treat it as a plain string
    return { value: str, ok: true };
  }
}

function formatValue(v: unknown): string {
  if (v === null) return "null";
  if (v === undefined) return "undefined";
  if (typeof v === "string") return v;
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

// ---------------------------------------------------------------------------
// VariableRow
// ---------------------------------------------------------------------------

interface VariableRowProps {
  varKey: string;
  value: unknown;
  diffEntry?: VariableDiffEntry;
  pendingValue?: unknown;
  hasPendingEdit: boolean;
  isPaused: boolean;
  onEdit: (key: string, value: unknown) => void;
}

function VariableRow({
  varKey,
  value,
  diffEntry,
  pendingValue,
  hasPendingEdit,
  isPaused,
  onEdit,
}: VariableRowProps) {
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState("");
  const [expanded, setExpanded] = useState(false);

  const displayValue = hasPendingEdit ? pendingValue : value;
  const formatted = formatValue(displayValue);
  const isMultiline = formatted.includes("\n") || formatted.length > 60;
  const isComplex = typeof displayValue === "object" && displayValue !== null;

  const startEdit = useCallback(() => {
    setEditText(formatValue(displayValue));
    setEditing(true);
  }, [displayValue]);

  const commitEdit = useCallback(() => {
    const { value: parsed } = tryParseJson(editText);
    onEdit(varKey, parsed);
    setEditing(false);
  }, [editText, varKey, onEdit]);

  const cancelEdit = useCallback(() => {
    setEditing(false);
  }, []);

  return (
    <div
      className={cn(
        "px-3 py-1.5 border-b border-zinc-800/60 text-xs",
        diffEntry ? getChangeBg(diffEntry.change) : "hover:bg-zinc-800/30",
        hasPendingEdit && "bg-violet-950/30 border-l-2 border-l-violet-500"
      )}
    >
      {/* Key row */}
      <div className="flex items-center gap-1.5 min-w-0">
        {/* Expand toggle for complex values */}
        {isComplex ? (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="text-zinc-500 hover:text-zinc-300 shrink-0"
          >
            {expanded ? (
              <ChevronDown className="w-3 h-3" />
            ) : (
              <ChevronRight className="w-3 h-3" />
            )}
          </button>
        ) : (
          <span className="w-3 shrink-0" />
        )}

        {/* Diff badge */}
        {diffEntry && getChangeIcon(diffEntry.change)}

        {/* Key name */}
        <span className="font-mono text-violet-300 shrink-0 truncate max-w-[120px]" title={varKey}>
          {varKey}
        </span>

        <span className="text-zinc-600 shrink-0">:</span>

        {/* Value — edit or display */}
        {editing ? (
          <div className="flex items-center gap-1 flex-1 min-w-0">
            <input
              autoFocus
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); commitEdit(); }
                if (e.key === "Escape") cancelEdit();
              }}
              className="flex-1 min-w-0 bg-zinc-800 border border-violet-500 rounded px-1.5 py-0.5 text-xs font-mono text-zinc-200 focus:outline-none"
            />
            <button onClick={commitEdit} className="p-0.5 text-emerald-400 hover:text-emerald-300">
              <Check className="w-3 h-3" />
            </button>
            <button onClick={cancelEdit} className="p-0.5 text-zinc-500 hover:text-zinc-300">
              <X className="w-3 h-3" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1 flex-1 min-w-0">
            {!isMultiline && !isComplex && (
              <span className="font-mono text-emerald-300 truncate flex-1" title={formatted}>
                {formatted}
              </span>
            )}
            {isMultiline && !isComplex && (
              <span className="font-mono text-emerald-300 truncate flex-1 opacity-70">
                {formatted.slice(0, 40)}…
              </span>
            )}
            {isComplex && (
              <span className="font-mono text-zinc-500 truncate flex-1">
                {Array.isArray(displayValue)
                  ? `[${(displayValue as unknown[]).length} items]`
                  : `{${Object.keys(displayValue as Record<string, unknown>).length} keys}`}
              </span>
            )}

            {/* Edit button — only when paused */}
            {isPaused && !editing && (
              <button
                onClick={startEdit}
                className="p-0.5 text-zinc-600 hover:text-violet-400 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                title="Edit value"
              >
                <Pencil className="w-3 h-3" />
              </button>
            )}

            {/* Pending edit indicator */}
            {hasPendingEdit && (
              <span className="text-[9px] text-violet-400 shrink-0 font-medium">edited</span>
            )}
          </div>
        )}
      </div>

      {/* Expanded JSON view */}
      {expanded && isComplex && (
        <pre className="mt-1 ml-4 text-[10px] text-zinc-400 bg-zinc-900/60 rounded p-1.5 max-h-32 overflow-auto font-mono">
          {formatValue(displayValue)}
        </pre>
      )}

      {/* Multiline string expanded view */}
      {expanded && !isComplex && isMultiline && (
        <pre className="mt-1 ml-4 text-[10px] text-zinc-400 bg-zinc-900/60 rounded p-1.5 max-h-32 overflow-auto font-mono whitespace-pre-wrap">
          {formatted}
        </pre>
      )}

      {/* Diff: show previous value when modified */}
      {diffEntry?.change === "modified" && diffEntry.previousValue !== undefined && (
        <div className="mt-0.5 ml-4 font-mono text-[10px] text-zinc-600 line-through truncate">
          {formatValue(diffEntry.previousValue)}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// DebugVariableWatchPanel
// ---------------------------------------------------------------------------

export function DebugVariableWatchPanel({
  currentVariables,
  variableDiff,
  pendingEdits,
  isPaused,
  onEditVariable,
  onResetEdits,
  onClose,
}: DebugVariableWatchProps) {
  const [search, setSearch] = useState("");

  const diffMap = new Map<string, VariableDiffEntry>(
    variableDiff.map((d) => [d.key, d])
  );

  const allKeys = [
    // Show deleted keys first (from diff, not in currentVariables)
    ...variableDiff
      .filter((d) => d.change === "deleted")
      .map((d) => d.key),
    // Then all current variable keys
    ...Object.keys(currentVariables),
  ];

  const filteredKeys = search.trim()
    ? allKeys.filter((k) => k.toLowerCase().includes(search.toLowerCase()))
    : allKeys;

  const pendingCount = Object.keys(pendingEdits).length;
  const hasAnyVars = allKeys.length > 0;

  return (
    <div className="flex flex-col h-full bg-zinc-900 border-l border-zinc-800 w-72 shrink-0">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-zinc-800 shrink-0">
        <div className="flex items-center gap-2">
          <Variable className="w-4 h-4 text-violet-400" />
          <span className="text-sm font-medium text-zinc-200">Variables</span>
          {hasAnyVars && (
            <span className="text-[10px] text-zinc-500 bg-zinc-800 rounded-full px-1.5 py-0.5">
              {allKeys.length}
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 transition-colors"
          aria-label="Close variable watch"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Paused banner */}
      {isPaused && (
        <div className="px-3 py-1.5 bg-orange-950/40 border-b border-orange-800/40 shrink-0">
          <p className="text-[11px] text-orange-300">
            Edit values below — changes apply when you Continue or Step.
          </p>
        </div>
      )}

      {/* Search */}
      {hasAnyVars && (
        <div className="px-3 py-2 border-b border-zinc-800 shrink-0">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter variables…"
            className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-300 placeholder:text-zinc-600 focus:outline-none focus:border-violet-500"
          />
        </div>
      )}

      {/* Variable list */}
      <div className="flex-1 overflow-y-auto">
        {!hasAnyVars ? (
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
            <Variable className="w-8 h-8 text-zinc-700 mb-2" />
            <p className="text-sm text-zinc-500">No variables yet.</p>
            <p className="text-xs text-zinc-600 mt-1">
              Variables appear here as the flow executes.
            </p>
          </div>
        ) : filteredKeys.length === 0 ? (
          <div className="px-3 py-6 text-center text-xs text-zinc-600">
            No variables match "{search}"
          </div>
        ) : (
          <div className="group">
            {filteredKeys.map((key) => {
              const isDeleted = diffMap.get(key)?.change === "deleted";
              const value = isDeleted ? undefined : currentVariables[key];
              return (
                <VariableRow
                  key={key}
                  varKey={key}
                  value={value}
                  diffEntry={diffMap.get(key)}
                  pendingValue={pendingEdits[key]}
                  hasPendingEdit={key in pendingEdits}
                  isPaused={isPaused}
                  onEdit={onEditVariable}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* Footer — pending edits control */}
      {pendingCount > 0 && (
        <div className="px-3 py-2 border-t border-zinc-800 bg-violet-950/20 shrink-0">
          <div className="flex items-center justify-between">
            <span className="text-xs text-violet-300">
              {pendingCount} edit{pendingCount !== 1 ? "s" : ""} pending
            </span>
            <button
              onClick={onResetEdits}
              className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
              title="Discard all edits"
            >
              <RotateCcw className="w-3 h-3" />
              Reset
            </button>
          </div>
          <p className="text-[10px] text-zinc-600 mt-0.5">
            Will be applied when you click Continue or Step.
          </p>
        </div>
      )}

      {/* Legend */}
      {variableDiff.length > 0 && (
        <div className="px-3 py-1.5 border-t border-zinc-800 shrink-0 flex items-center gap-3">
          <span className="flex items-center gap-1 text-[10px] text-zinc-600">
            <Plus className="w-2.5 h-2.5 text-emerald-400" /> new
          </span>
          <span className="flex items-center gap-1 text-[10px] text-zinc-600">
            <RefreshCw className="w-2.5 h-2.5 text-yellow-400" /> changed
          </span>
          <span className="flex items-center gap-1 text-[10px] text-zinc-600">
            <Minus className="w-2.5 h-2.5 text-red-400" /> deleted
          </span>
        </div>
      )}
    </div>
  );
}
