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
          ? "border-foreground bg-foreground/10 text-foreground"
          : "border-border bg-muted/20 text-muted-foreground hover:border-border hover:text-foreground/80"
      }`}
    >
      <div className="text-lg font-bold">{value}</div>
      <div className="text-xs font-medium">{label}</div>
      <div className="text-[10px] text-muted-foreground mt-0.5">{hint}</div>
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
      <DialogContent className="bg-card border-border max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <Sparkles className="size-4 text-muted-foreground" />
            Generate Eval Suite with AI
          </DialogTitle>
        </DialogHeader>

        {/* ── Success state ─────────────────────────────────────────────── */}
        {result ? (
          <div className="py-2 space-y-4">
            <div className="flex items-start gap-3 p-3 rounded-lg bg-foreground/5 border border-border">
              <CheckCircle2 className="size-5 text-foreground/60 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-foreground/80">Suite generated successfully</p>
                <p className="text-xs text-muted-foreground mt-1">
                  <span className="text-foreground">{result.suiteName}</span>
                  {" · "}
                  <span className="text-foreground/80">{result.testCaseCount} test cases</span>
                  {" · "}
                  <span className="text-muted-foreground">via {result.modelUsed}</span>
                </p>
                <p className="text-xs text-muted-foreground mt-1 italic">{result.suiteDescription}</p>
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              Review and refine the generated test cases before running your first eval.
              Assertions have been set based on{" "}
              <span className="text-foreground/80">2026 industry standards</span> for this agent category.
            </p>
          </div>
        ) : (
          /* ── Config state ───────────────────────────────────────────────── */
          <div className="py-2 space-y-5">
            {/* Context note */}
            <p className="text-xs text-muted-foreground leading-relaxed">
              AI will analyze this agent&apos;s system prompt, category, and knowledge base to generate
              realistic test cases with multi-layer assertions aligned to{" "}
              <span className="text-foreground/80">2026 eval standards</span>.
            </p>

            {/* Test case count */}
            <div className="space-y-2">
              <Label className="text-foreground/80 text-sm">Number of test cases</Label>
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
                <p className="text-sm text-foreground/80">Run on every deploy</p>
                <p className="text-xs text-muted-foreground">Auto-test after each flow update</p>
              </div>
              <div
                role="checkbox"
                aria-checked={runOnDeploy}
                tabIndex={0}
                onClick={() => setRunOnDeploy((v) => !v)}
                onKeyDown={(e) =>
                  (e.key === " " || e.key === "Enter") && setRunOnDeploy((v) => !v)
                }
                className={`relative w-10 h-5.5 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-ring ${
                  runOnDeploy ? "bg-foreground" : "bg-muted"
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
              <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/10 border border-destructive/30">
                <AlertCircle className="size-4 text-destructive mt-0.5 shrink-0" />
                <p className="text-xs text-destructive">{error}</p>
              </div>
            )}

            {/* Generation progress hint */}
            {isGenerating && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
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
            className="text-muted-foreground hover:text-foreground"
          >
            {result ? "Close" : "Cancel"}
          </Button>

          {result ? (
            <Button
              onClick={handleOpenSuite}
              className="bg-foreground hover:bg-foreground/90 text-background"
            >
              Open Suite
            </Button>
          ) : (
            <Button
              onClick={handleGenerate}
              disabled={isGenerating}
              className="bg-foreground hover:bg-foreground/90 text-background disabled:opacity-60"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="size-3.5 animate-spin mr-2" />
                  Generating…
                </>
              ) : (
                <>
                  <Sparkles className="size-3.5 mr-2" />
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
