"use client";

import { useState } from "react";
import {
  Plus, Trash2, ChevronDown, ChevronUp, Play,
  CheckCircle2, XCircle, Clock, AlertCircle, GripVertical,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface EvalAssertion {
  type: string;
  value?: string;
  threshold?: number;
  rubric?: string;
}

export interface EvalTestCase {
  id: string;
  label: string;
  input: string;
  assertions: EvalAssertion[];
  tags: string[];
  order: number;
  results?: Array<{
    id: string;
    status: string;
    score: number | null;
    latencyMs: number | null;
    createdAt: string;
  }>;
}

interface EvalSuiteEditorProps {
  agentId: string;
  suiteId: string;
  initialCases: EvalTestCase[];
  onRunEvals: () => void;
  isRunning: boolean;
}

// ─── Assertion type config ────────────────────────────────────────────────────

const ASSERTION_TYPES = [
  { value: "contains",           label: "Contains",            layer: 1, hasValue: true,     hasThreshold: false, hasRubric: false },
  { value: "not_contains",       label: "Not Contains",        layer: 1, hasValue: true,     hasThreshold: false, hasRubric: false },
  { value: "exact_match",        label: "Exact Match",         layer: 1, hasValue: true,     hasThreshold: false, hasRubric: false },
  { value: "icontains",          label: "Contains (case-ins.)",layer: 1, hasValue: true,     hasThreshold: false, hasRubric: false },
  { value: "starts_with",        label: "Starts With",         layer: 1, hasValue: true,     hasThreshold: false, hasRubric: false },
  { value: "regex",              label: "Regex Match",         layer: 1, hasValue: true,     hasThreshold: false, hasRubric: false },
  { value: "json_valid",         label: "JSON Valid",          layer: 1, hasValue: false,    hasThreshold: false, hasRubric: false },
  { value: "latency",            label: "Latency (ms)",        layer: 1, hasValue: false,    hasThreshold: true,  hasRubric: false },
  { value: "semantic_similarity",label: "Semantic Similarity", layer: 2, hasValue: true,     hasThreshold: true,  hasRubric: false },
  { value: "llm_rubric",         label: "LLM Rubric",          layer: 3, hasValue: false,    hasThreshold: true,  hasRubric: true  },
  { value: "kb_faithfulness",    label: "KB Faithfulness",     layer: 3, hasValue: false,    hasThreshold: true,  hasRubric: false },
  { value: "relevance",          label: "Relevance",           layer: 3, hasValue: false,    hasThreshold: true,  hasRubric: false },
];

const LAYER_COLORS: Record<number, string> = {
  1: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  2: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  3: "bg-purple-500/15 text-purple-400 border-purple-500/30",
};

const LAYER_LABELS: Record<number, string> = {
  1: "Deterministic",
  2: "Semantic",
  3: "LLM Judge",
};

function AssertionBadge({ type }: { type: string }) {
  const cfg = ASSERTION_TYPES.find((a) => a.value === type);
  const layer = cfg?.layer ?? 1;
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${LAYER_COLORS[layer]}`}>
      {cfg?.label ?? type}
    </span>
  );
}

// ─── Add/Edit Test Case Dialog ────────────────────────────────────────────────

interface TestCaseDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (data: { label: string; input: string; assertions: EvalAssertion[]; tags: string[] }) => void;
  initial?: EvalTestCase | null;
  isSaving: boolean;
}

function emptyAssertion(): EvalAssertion {
  return { type: "contains", value: "" };
}

function TestCaseDialog({ open, onClose, onSave, initial, isSaving }: TestCaseDialogProps) {
  const [label, setLabel] = useState(initial?.label ?? "");
  const [input, setInput] = useState(initial?.input ?? "");
  const [assertions, setAssertions] = useState<EvalAssertion[]>(
    initial?.assertions?.length ? initial.assertions : [emptyAssertion()],
  );
  const [tags, setTags] = useState(initial?.tags?.join(", ") ?? "");

  function updateAssertion(idx: number, patch: Partial<EvalAssertion>) {
    setAssertions((prev) =>
      prev.map((a, i) => (i === idx ? { ...a, ...patch } : a)),
    );
  }

  function handleTypeChange(idx: number, type: string) {
    const cfg = ASSERTION_TYPES.find((a) => a.value === type);
    const next: EvalAssertion = { type };
    if (cfg?.hasValue) next.value = "";
    if (cfg?.hasThreshold) next.threshold = type === "latency" ? 2000 : 0.8;
    if (cfg?.hasRubric) next.rubric = "";
    setAssertions((prev) => prev.map((a, i) => (i === idx ? next : a)));
  }

  function handleSave() {
    const parsedTags = tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    onSave({ label: label.trim(), input: input.trim(), assertions, tags: parsedTags });
  }

  const isValid = label.trim().length > 0 && input.trim().length > 0 && assertions.length > 0;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-zinc-900 border-zinc-700">
        <DialogHeader>
          <DialogTitle className="text-white">
            {initial ? "Edit Test Case" : "Add Test Case"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Label */}
          <div className="space-y-1.5">
            <Label className="text-zinc-300">Test Name</Label>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Greets user by name"
              className="bg-zinc-800 border-zinc-600 text-white"
            />
          </div>

          {/* Input message */}
          <div className="space-y-1.5">
            <Label className="text-zinc-300">User Message</Label>
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="The message to send to the agent..."
              rows={3}
              className="bg-zinc-800 border-zinc-600 text-white resize-none"
            />
          </div>

          {/* Assertions */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-zinc-300">Assertions</Label>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs border-zinc-600 text-zinc-300 hover:bg-zinc-700"
                onClick={() => setAssertions((prev) => [...prev, emptyAssertion()])}
              >
                <Plus className="w-3 h-3 mr-1" /> Add
              </Button>
            </div>

            <div className="space-y-2">
              {assertions.map((assertion, idx) => {
                const cfg = ASSERTION_TYPES.find((a) => a.value === assertion.type);
                return (
                  <div key={idx} className="flex gap-2 items-start p-3 bg-zinc-800 rounded-lg border border-zinc-700">
                    {/* Type selector */}
                    <div className="w-44 shrink-0">
                      <select
                        value={assertion.type}
                        onChange={(e) => handleTypeChange(idx, e.target.value)}
                        className="w-full h-8 text-xs rounded-md bg-zinc-700 border border-zinc-600 text-white px-2"
                      >
                        {[1, 2, 3].map((layer) => (
                          <optgroup key={layer} label={`Layer ${layer} — ${LAYER_LABELS[layer]}`}>
                            {ASSERTION_TYPES.filter((a) => a.layer === layer).map((a) => (
                              <option key={a.value} value={a.value}>{a.label}</option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                    </div>

                    {/* Value */}
                    {cfg?.hasValue && (
                      <Input
                        value={assertion.value ?? ""}
                        onChange={(e) => updateAssertion(idx, { value: e.target.value })}
                        placeholder={assertion.type === "regex" ? "pattern" : "expected text"}
                        className="h-8 text-xs bg-zinc-700 border-zinc-600 text-white"
                      />
                    )}

                    {/* Rubric */}
                    {cfg?.hasRubric && (
                      <Textarea
                        value={assertion.rubric ?? ""}
                        onChange={(e) => updateAssertion(idx, { rubric: e.target.value })}
                        placeholder="Evaluation criteria..."
                        rows={2}
                        className="text-xs bg-zinc-700 border-zinc-600 text-white resize-none"
                      />
                    )}

                    {/* Threshold */}
                    {cfg?.hasThreshold && (
                      <Input
                        type="number"
                        value={assertion.threshold ?? (assertion.type === "latency" ? 2000 : 0.8)}
                        onChange={(e) => updateAssertion(idx, { threshold: Number(e.target.value) })}
                        step={assertion.type === "latency" ? 100 : 0.1}
                        min={0}
                        max={assertion.type === "latency" ? 60000 : 1}
                        className="w-20 h-8 text-xs bg-zinc-700 border-zinc-600 text-white"
                      />
                    )}

                    {/* Delete */}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 p-0 shrink-0 text-zinc-500 hover:text-red-400 hover:bg-transparent"
                      onClick={() => setAssertions((prev) => prev.filter((_, i) => i !== idx))}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Tags */}
          <div className="space-y-1.5">
            <Label className="text-zinc-300 text-sm">Tags <span className="text-zinc-500">(optional, comma-separated)</span></Label>
            <Input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="greeting, rag, edge-case"
              className="bg-zinc-800 border-zinc-600 text-white"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="border-zinc-600 text-zinc-300">
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={!isValid || isSaving}
            className="bg-violet-600 hover:bg-violet-500 text-white"
          >
            {isSaving ? "Saving..." : initial ? "Save Changes" : "Add Test Case"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Result status icon ───────────────────────────────────────────────────────

function StatusIcon({ status }: { status?: string }) {
  if (status === "PASSED") return <CheckCircle2 className="w-4 h-4 text-emerald-400" />;
  if (status === "FAILED") return <XCircle className="w-4 h-4 text-red-400" />;
  if (status === "ERROR")  return <AlertCircle className="w-4 h-4 text-yellow-400" />;
  return <Clock className="w-4 h-4 text-zinc-500" />;
}

// ─── Main component ───────────────────────────────────────────────────────────

export function EvalSuiteEditor({
  agentId, suiteId, initialCases, onRunEvals, isRunning,
}: EvalSuiteEditorProps) {
  const [cases, setCases] = useState<EvalTestCase[]>(initialCases);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingCase, setEditingCase] = useState<EvalTestCase | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  async function handleAddCase(data: { label: string; input: string; assertions: EvalAssertion[]; tags: string[] }) {
    setIsSaving(true);
    try {
      const res = await fetch(`/api/agents/${agentId}/evals/${suiteId}/cases`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setCases((prev) => [...prev, json.data]);
      setShowAddDialog(false);
      toast.success("Test case added");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add test case");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDeleteCase(id: string) {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/agents/${agentId}/evals/${suiteId}/cases`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setCases((prev) => prev.filter((c) => c.id !== id));
      toast.success("Test case removed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete test case");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-zinc-400">
          {cases.length} test case{cases.length !== 1 ? "s" : ""}
          {cases.length > 0 && " · click a row to expand assertion details"}
        </p>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowAddDialog(true)}
            className="border-zinc-600 text-zinc-300 hover:bg-zinc-700"
          >
            <Plus className="w-4 h-4 mr-1.5" /> Add Test Case
          </Button>
          <Button
            size="sm"
            onClick={onRunEvals}
            disabled={cases.length === 0 || isRunning}
            className="bg-violet-600 hover:bg-violet-500 text-white"
          >
            {isRunning ? (
              <><span className="animate-spin mr-1.5">⟳</span> Running...</>
            ) : (
              <><Play className="w-3.5 h-3.5 mr-1.5" /> Run Evals</>
            )}
          </Button>
        </div>
      </div>

      {/* Empty state */}
      {cases.length === 0 && (
        <div className="text-center py-12 border border-dashed border-zinc-700 rounded-lg">
          <p className="text-zinc-500 text-sm">No test cases yet</p>
          <p className="text-zinc-600 text-xs mt-1">Add test cases to start evaluating your agent</p>
          <Button
            size="sm"
            variant="outline"
            className="mt-4 border-zinc-600 text-zinc-400 hover:bg-zinc-700"
            onClick={() => setShowAddDialog(true)}
          >
            <Plus className="w-4 h-4 mr-1.5" /> Add First Test Case
          </Button>
        </div>
      )}

      {/* Test case list */}
      <div className="space-y-2">
        {cases.map((tc) => {
          const lastResult = tc.results?.[0];
          const isExpanded = expandedId === tc.id;

          return (
            <div
              key={tc.id}
              className="border border-zinc-700 rounded-lg overflow-hidden bg-zinc-900"
            >
              {/* Row */}
              <div
                className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-zinc-800/50 transition-colors"
                onClick={() => setExpandedId(isExpanded ? null : tc.id)}
              >
                <GripVertical className="w-4 h-4 text-zinc-600 shrink-0" />
                <StatusIcon status={lastResult?.status} />

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-zinc-200 truncate">{tc.label}</p>
                  <p className="text-xs text-zinc-500 truncate">{tc.input}</p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {/* Tags */}
                  {tc.tags.map((tag) => (
                    <span key={tag} className="text-xs px-1.5 py-0.5 bg-zinc-800 text-zinc-400 rounded border border-zinc-700">
                      {tag}
                    </span>
                  ))}

                  {/* Last score */}
                  {lastResult?.score != null && (
                    <span className={`text-xs font-mono font-semibold ${
                      lastResult.score >= 0.8 ? "text-emerald-400" :
                      lastResult.score >= 0.5 ? "text-yellow-400" : "text-red-400"
                    }`}>
                      {(lastResult.score * 100).toFixed(0)}%
                    </span>
                  )}

                  {/* Assertion count */}
                  <span className="text-xs text-zinc-500">{tc.assertions.length} assertion{tc.assertions.length !== 1 ? "s" : ""}</span>

                  {/* Expand toggle */}
                  {isExpanded
                    ? <ChevronUp className="w-4 h-4 text-zinc-500" />
                    : <ChevronDown className="w-4 h-4 text-zinc-500" />
                  }

                  {/* Delete */}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0 text-zinc-600 hover:text-red-400 hover:bg-transparent"
                    disabled={deletingId === tc.id}
                    onClick={(e) => { e.stopPropagation(); handleDeleteCase(tc.id); }}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>

              {/* Expanded assertion details */}
              {isExpanded && (
                <div className="border-t border-zinc-700 px-4 py-3 bg-zinc-800/30 space-y-2">
                  <p className="text-xs font-medium text-zinc-400 mb-2">Assertions</p>
                  {tc.assertions.map((a, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-xs">
                      <AssertionBadge type={a.type} />
                      {a.value && <span className="text-zinc-300 font-mono bg-zinc-800 px-2 py-0.5 rounded">&quot;{a.value}&quot;</span>}
                      {a.threshold != null && <span className="text-zinc-400">threshold: <span className="text-zinc-200">{a.threshold}</span></span>}
                      {a.rubric && <span className="text-zinc-400 italic truncate max-w-xs">{a.rubric}</span>}
                    </div>
                  ))}
                  {lastResult && (
                    <p className="text-xs text-zinc-500 pt-1">
                      Last run: {new Date(lastResult.createdAt).toLocaleString()}
                      {lastResult.latencyMs != null && ` · ${lastResult.latencyMs}ms`}
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Add/Edit dialog */}
      <TestCaseDialog
        open={showAddDialog || editingCase !== null}
        onClose={() => { setShowAddDialog(false); setEditingCase(null); }}
        onSave={handleAddCase}
        initial={editingCase}
        isSaving={isSaving}
      />
    </div>
  );
}
