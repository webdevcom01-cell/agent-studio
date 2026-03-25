"use client";

import { useRef, useEffect } from "react";
import {
  Bug,
  Play,
  Square,
  Trash2,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Clock,
  Pause,
  StepForward,
  CircleDot,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { DebugSessionState } from "./use-debug-session";

// ---------------------------------------------------------------------------
// DebugToggleButton — goes inside the main toolbar
// ---------------------------------------------------------------------------
interface DebugToggleButtonProps {
  isDebugMode: boolean;
  onToggle: () => void;
}

export function DebugToggleButton({ isDebugMode, onToggle }: DebugToggleButtonProps) {
  return (
    <Button
      size="sm"
      variant={isDebugMode ? "default" : "outline"}
      onClick={onToggle}
      className={cn(
        "gap-1.5",
        isDebugMode && "bg-violet-600 hover:bg-violet-700 border-violet-600 text-white"
      )}
      title="Toggle Debug Mode"
      aria-label="Toggle Debug Mode"
      aria-pressed={isDebugMode}
    >
      <Bug className="size-4" />
      Debug
    </Button>
  );
}

// ---------------------------------------------------------------------------
// DebugStatusBar — summary strip shown at very bottom of the toolbar row
// ---------------------------------------------------------------------------
function DebugStatusBar({ state }: { state: DebugSessionState }) {
  const { flowSummary, isRunning, isPaused } = state;

  if (isPaused) {
    return (
      <span className="flex items-center gap-1.5 text-xs text-orange-400 ml-auto shrink-0 animate-pulse">
        <Pause className="size-3" />
        Paused at breakpoint
      </span>
    );
  }

  if (isRunning) {
    return (
      <span className="flex items-center gap-1.5 text-xs text-violet-400 ml-auto shrink-0">
        <Loader2 className="size-3 animate-spin" />
        Running…
      </span>
    );
  }

  if (!flowSummary) return null;

  const failed = flowSummary.nodesFailed > 0;
  return (
    <span
      className={cn(
        "flex items-center gap-1.5 text-xs ml-auto shrink-0",
        failed ? "text-red-400" : "text-emerald-400"
      )}
    >
      {failed ? (
        <AlertCircle className="size-3" />
      ) : (
        <CheckCircle2 className="size-3" />
      )}
      {flowSummary.nodesExecuted} nodes
      {failed && <span className="text-red-400">· {flowSummary.nodesFailed} failed</span>}
      <span className="text-muted-foreground">
        <Clock className="size-3 inline mr-0.5" />
        {(flowSummary.totalDurationMs / 1000).toFixed(2)}s
      </span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// DebugToolbar — the full bar rendered below the main toolbar when active
// ---------------------------------------------------------------------------
interface DebugToolbarProps {
  state: DebugSessionState;
  onSetTestInput: (value: string) => void;
  onRun: () => void;
  onStop: () => void;
  onClear: () => void;
  onContinue: () => void;
  onStep: () => void;
}

export function DebugToolbar({
  state,
  onSetTestInput,
  onRun,
  onStop,
  onClear,
  onContinue,
  onStep,
}: DebugToolbarProps) {
  const { isRunning, isPaused, testInput, nodeStates, flowSummary, breakpoints } = state;
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-focus the input when debug mode becomes active
  useEffect(() => {
    const timer = setTimeout(() => inputRef.current?.focus(), 100);
    return () => clearTimeout(timer);
  }, []);

  const hasResults = nodeStates.size > 0 || flowSummary !== null;
  const canRun = testInput.trim().length > 0 && !isRunning;

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Ctrl+Enter / Cmd+Enter to run
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      if (canRun) onRun();
    }
  }

  return (
    <div className="border-b bg-violet-950/20 border-violet-900/40 px-4 py-2.5">
      <div className="flex items-start gap-2">
        {/* Test input */}
        <div className="flex-1 relative">
          <textarea
            ref={inputRef}
            value={testInput}
            onChange={(e) => onSetTestInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Enter test message… (Ctrl+Enter to run)"
            rows={2}
            disabled={isRunning}
            className={cn(
              "w-full rounded-md border bg-background/60 px-3 py-2 text-sm resize-none",
              "placeholder:text-muted-foreground/60",
              "focus:outline-none focus:ring-1 focus:ring-violet-500 focus:border-violet-500",
              "border-violet-800/50",
              "disabled:opacity-60 disabled:cursor-not-allowed",
              "font-mono"
            )}
          />
        </div>

        {/* Action buttons */}
        <div className="flex flex-col gap-1.5 pt-0.5 shrink-0">
          {isPaused ? (
            /* ── Paused at breakpoint ── */
            <>
              <Button
                size="sm"
                onClick={onContinue}
                className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 h-8"
                title="Continue (resume until next breakpoint)"
              >
                <Play className="size-3.5" />
                Continue
              </Button>
              <Button
                size="sm"
                onClick={onStep}
                variant="outline"
                className="gap-1.5 h-8 border-orange-700/60 text-orange-300 hover:bg-orange-900/30"
                title="Step Over (execute one node, then pause)"
              >
                <StepForward className="size-3.5" />
                Step
              </Button>
              <Button
                size="sm"
                onClick={onStop}
                variant="destructive"
                className="gap-1.5 h-8"
                title="Stop execution"
              >
                <Square className="size-3.5" />
                Stop
              </Button>
            </>
          ) : !isRunning ? (
            /* ── Idle ── */
            <>
              <Button
                size="sm"
                onClick={onRun}
                disabled={!canRun}
                className="bg-violet-600 hover:bg-violet-700 text-white gap-1.5 h-8"
                title="Run (Ctrl+Enter)"
              >
                <Play className="size-3.5" />
                Run
              </Button>
              {hasResults && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={onClear}
                  className="gap-1.5 h-8 text-muted-foreground hover:text-foreground"
                  title="Clear results"
                >
                  <Trash2 className="size-3.5" />
                  Clear
                </Button>
              )}
            </>
          ) : (
            /* ── Running ── */
            <Button
              size="sm"
              onClick={onStop}
              variant="destructive"
              className="gap-1.5 h-8"
              title="Stop execution"
            >
              <Square className="size-3.5" />
              Stop
            </Button>
          )}
        </div>
      </div>

      {/* Status line */}
      <div className="flex items-center mt-1.5 min-h-[16px]">
        <span className="text-xs text-violet-400/70 mr-2 flex items-center gap-1">
          {breakpoints.size > 0 ? (
            <>
              <CircleDot className="size-3 text-red-400" />
              {breakpoints.size} breakpoint{breakpoints.size !== 1 ? "s" : ""} set · right-click node to toggle
            </>
          ) : (
            "Debug mode · right-click a node to set a breakpoint"
          )}
        </span>
        <DebugStatusBar state={state} />
      </div>
    </div>
  );
}
