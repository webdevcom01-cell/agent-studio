"use client";

/**
 * GenerateEvalDialog
 *
 * Modal dialog that triggers AI eval suite generation for an agent.
 * Shows options (targetCount, runOnDeploy), a progress indicator during
 * generation, and navigates to the new suite on success.
 *
 * Usage:
 *   <GenerateEvalDialog
 *     agentId="abc123"
 *     open={open}
 *     onClose={() => setOpen(false)}
 *     onGenerated={(suiteId) => { reload(); selectSuite(suiteId); }}
 *   />
 */

import { useState } from "react";
import { Sparkles, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

// ─── Types ────────────────────────────────────────────────────────────────────

interface GeneratedSuiteResult {
  suiteId: string;
  suiteName: string;
  suiteDescription: string;
  testCaseCount: number;
  modelUsed: string;
}

interface GenerateEvalDialogProps {
  agentId: string;
  open: boolean;
  onClose: () => void;
  /** Called with the new suite ID once generation and persistence succeed */
  onGenerated: (suiteId: string) => void;
}

// ─── Count selector ───────────────────────────────────────────────────────────

function CountOption({
  value,
  selected,
  label,
  hint,
  onClick,
}: {
  value: number;
  selected: boolean;
  label: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 rounded-lg border px-3 py-2.5 text-center transition-all ${
        selected
          ? "border-violet-500 bg-violet-500/10 text-violet-300"
          : "border-zinc-700 bg-zinc-800/50 text-zinc-400 hover:border-zinc-500 hover:text-zinc-300"
      }`}
    >
      <div className="text-lg font-bold">{value}</div>
      <div className="text-xs font-medium">{label}</div>
      <div className="text-[10px] text-zinc-500 mt-0.5">{hint}</div>
    </button>
  );
}

// ─── Main dialog ──────────────────────────────────────────────────────────────

export function GenerateEvalDialog({
  agentId,
  open,
  onClose,
  onGenerated,
}: GenerateEvalDialogProps) {
  const [targetCount, setTargetCount] = useState(5);
  const [runOnDeploy, setRunOnDeploy] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [result, setResult] = useState<GeneratedSuiteResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleClose() {
    if (isGenerating) return;
    setResult(null);
    setError(null);
    onClose();
  }

  async function handleGenerate() {
    setIsGenerating(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch(`/api/agents/${agentId}/evals/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetCount, runOnDeploy }),
      });

      const json = (await res.json()) as {
        success: boolean;
        data?: GeneratedSuiteResult;
        error?: string;
      };

      if (!json.success || !json.data) {
        throw new Error(json.error ?? "Generation failed");
      }

      setResult(json.data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unexpected error";
      setError(msg);
      toast.error(`Generation failed: ${msg}`);
    } finally {
      setIsGenerating(false);
    }
  }

  function handleOpenSuite() {
    if (!result) return;
    onGenerated(result.suiteId);
    handleClose();
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="bg-zinc-900 border-zinc-700 max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <Sparkles className="w-4 h-4 text-violet-400" />
            Generate Eval Suite with AI
          </DialogTitle>
        </DialogHeader>

        {/* ── Success state ─────────────────────────────────────────────── */}
        {result ? (
          <div className="py-2 space-y-4">
            <div className="flex items-start gap-3 p-3 rounded-lg bg-green-500/10 border border-green-500/30">
              <CheckCircle2 className="w-5 h-5 text-green-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-green-300">Suite generated successfully</p>
                <p className="text-xs text-zinc-400 mt-1">
                  <span className="text-white">{result.suiteName}</span>
                  {" · "}
                  <span className="text-violet-300">{result.testCaseCount} test cases</span>
                  {" · "}
                  <span className="text-zinc-500">via {result.modelUsed}</span>
                </p>
                <p className="text-xs text-zinc-500 mt-1 italic">{result.suiteDescription}</p>
              </div>
            </div>

            <p className="text-xs text-zinc-400">
              Review and refine the generated test cases before running your first eval.
              Assertions have been set based on{" "}
              <span className="text-zinc-300">2026 industry standards</span> for this agent category.
            </p>
          </div>
        ) : (
          /* ── Config state ───────────────────────────────────────────────── */
          <div className="py-2 space-y-5">
            {/* Context note */}
            <p className="text-xs text-zinc-400 leading-relaxed">
              AI will analyze this agent&apos;s system prompt, category, and knowledge base to generate
              realistic test cases with multi-layer assertions aligned to{" "}
              <span className="text-zinc-300">2026 eval standards</span>.
            </p>

            {/* Test case count */}
            <div className="space-y-2">
              <Label className="text-zinc-300 text-sm">Number of test cases</Label>
              <div className="flex gap-2">
                {(
                  [
                    { value: 3, label: "Smoke", hint: "Quick check" },
                    { value: 5, label: "Standard", hint: "Balanced" },
                    { value: 8, label: "Thorough", hint: "Good coverage" },
                    { value: 10, label: "Full", hint: "Max coverage" },
                  ] as const
                ).map((opt) => (
                  <CountOption
                    key={opt.value}
                    value={opt.value}
                    label={opt.label}
                    hint={opt.hint}
                    selected={targetCount === opt.value}
                    onClick={() => setTargetCount(opt.value)}
                  />
                ))}
              </div>
            </div>

            {/* Run on deploy toggle */}
            <label className="flex items-center justify-between gap-3 cursor-pointer group">
              <div>
                <p className="text-sm text-zinc-300">Run on every deploy</p>
                <p className="text-xs text-zinc-500">Auto-test after each flow update</p>
              </div>
              <div
                role="checkbox"
                aria-checked={runOnDeploy}
                tabIndex={0}
                onClick={() => setRunOnDeploy((v) => !v)}
                onKeyDown={(e) =>
                  (e.key === " " || e.key === "Enter") && setRunOnDeploy((v) => !v)
                }
                className={`relative w-10 h-5.5 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-violet-500 ${
                  runOnDeploy ? "bg-violet-600" : "bg-zinc-700"
                }`}
                style={{ minWidth: "2.5rem", height: "1.375rem" }}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                    runOnDeploy ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </div>
            </label>

            {/* Error */}
            {error && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30">
                <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
                <p className="text-xs text-red-300">{error}</p>
              </div>
            )}

            {/* Generation progress hint */}
            {isGenerating && (
              <div className="flex items-center gap-2 text-xs text-zinc-400">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-violet-400" />
                Generating {targetCount} test cases with assertions… (~15–30s)
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button
            variant="ghost"
            onClick={handleClose}
            disabled={isGenerating}
            className="text-zinc-400 hover:text-white"
          >
            {result ? "Close" : "Cancel"}
          </Button>

          {result ? (
            <Button
              onClick={handleOpenSuite}
              className="bg-violet-600 hover:bg-violet-700 text-white"
            >
              Open Suite
            </Button>
          ) : (
            <Button
              onClick={handleGenerate}
              disabled={isGenerating}
              className="bg-violet-600 hover:bg-violet-700 text-white disabled:opacity-60"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin mr-2" />
                  Generating…
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5 mr-2" />
                  Generate Suite
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
