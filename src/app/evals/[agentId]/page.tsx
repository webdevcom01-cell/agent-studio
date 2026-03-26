"use client";

import { useState, useEffect, useCallback, use } from "react";
import Link from "next/link";
import {
  ArrowLeft, Plus, Trash2, FlaskConical, Settings2,
  BarChart3, Loader2, MoreVertical, Star, StarOff, Rocket, Sparkles, ShieldCheck,
  Clock, GitCompare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { EvalSuiteEditor } from "@/components/evals/eval-suite-editor";
import { EvalResultsView } from "@/components/evals/eval-results-view";
import { EvalCompareView } from "@/components/evals/eval-compare-view";
import { GenerateEvalDialog } from "@/components/evals/generate-eval-dialog";
import type { EvalRunDetail, RunHistoryItem } from "@/components/evals/eval-results-view";
import type { EvalTestCase } from "@/components/evals/eval-suite-editor";
import type { CompareResult } from "@/components/evals/eval-compare-view";
import { ALL_MODELS } from "@/lib/models";

// ─── Types ────────────────────────────────────────────────────────────────────

interface EvalSuite {
  id: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  runOnDeploy: boolean;
  scheduleEnabled: boolean;
  scheduleCron: string | null;
  testCaseCount: number;
  runCount: number;
  lastRun: {
    id: string;
    status: string;
    score: number | null;
    passedCases: number;
    failedCases: number;
    totalCases: number;
    createdAt: string;
  } | null;
  createdAt: string;
  updatedAt: string;
}

interface SuiteDetail {
  id: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  runOnDeploy: boolean;
  scheduleEnabled: boolean;
  scheduleCron: string | null;
  testCases: EvalTestCase[];
}

interface FlowVersion {
  id: string;
  label: string | null;
  status: string;
  createdAt: string;
}

// ─── Cron presets ─────────────────────────────────────────────────────────────

const CRON_PRESETS = [
  { label: "Daily at 3 AM", value: "0 3 * * *" },
  { label: "Every 6 hours", value: "0 */6 * * *" },
  { label: "Every 12 hours", value: "0 */12 * * *" },
  { label: "Weekly (Mon 8 AM)", value: "0 8 * * 1" },
  { label: "Custom", value: "custom" },
];

// ─── Create Suite Dialog ──────────────────────────────────────────────────────

function CreateSuiteDialog({
  open, onClose, onCreated, agentId,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (suite: EvalSuite) => void;
  agentId: string;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [runOnDeploy, setRunOnDeploy] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  async function handleCreate() {
    if (!name.trim()) return;
    setIsCreating(true);
    try {
      const res = await fetch(`/api/agents/${agentId}/evals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
          runOnDeploy,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      onCreated(json.data as EvalSuite);
      setName("");
      setDescription("");
      setRunOnDeploy(false);
      onClose();
      toast.success("Eval suite created");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create suite");
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="bg-zinc-900 border-zinc-700">
        <DialogHeader>
          <DialogTitle className="text-white">New Eval Suite</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label className="text-zinc-300">Suite Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Smoke Tests, Regression Suite"
              className="bg-zinc-800 border-zinc-600 text-white"
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-zinc-300">Description <span className="text-zinc-500">(optional)</span></Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this suite test?"
              rows={2}
              className="bg-zinc-800 border-zinc-600 text-white resize-none"
            />
          </div>
          {/* Run on deploy toggle */}
          <label className="flex items-center gap-3 cursor-pointer group">
            <div
              role="checkbox"
              aria-checked={runOnDeploy}
              tabIndex={0}
              onClick={() => setRunOnDeploy((v) => !v)}
              onKeyDown={(e) => (e.key === " " || e.key === "Enter") && setRunOnDeploy((v) => !v)}
              className={`relative w-9 h-5 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-violet-500 ${
                runOnDeploy ? "bg-violet-600" : "bg-zinc-700"
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                  runOnDeploy ? "translate-x-4" : "translate-x-0"
                }`}
              />
            </div>
            <div>
              <p className="text-sm text-zinc-300 font-medium">Run on deploy</p>
              <p className="text-xs text-zinc-500">Automatically run this suite when the agent flow is deployed</p>
            </div>
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="border-zinc-600 text-zinc-300">
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            disabled={!name.trim() || isCreating}
            className="bg-violet-600 hover:bg-violet-500 text-white"
          >
            {isCreating ? "Creating..." : "Create Suite"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Score badge ──────────────────────────────────────────────────────────────

function ScoreBadge({ score }: { score: number | null | undefined }) {
  if (score == null) return <span className="text-xs text-zinc-500">No runs</span>;
  const pct = Math.round(score * 100);
  const color = pct >= 80 ? "text-emerald-400" : pct >= 50 ? "text-yellow-400" : "text-red-400";
  return <span className={`text-sm font-mono font-semibold ${color}`}>{pct}%</span>;
}

// ─── Main Page ────────────────────────────────────────────────────────────────

interface PageProps {
  params: Promise<{ agentId: string }>;
}

export default function EvalsPage({ params }: PageProps) {
  const { agentId } = use(params);

  const [suites, setSuites] = useState<EvalSuite[]>([]);
  const [activeSuiteId, setActiveSuiteId] = useState<string | null>(null);
  const [suiteDetail, setSuiteDetail] = useState<SuiteDetail | null>(null);
  const [runHistory, setRunHistory] = useState<RunHistoryItem[]>([]);
  const [activeRun, setActiveRun] = useState<EvalRunDetail | null>(null);
  const [activeTab, setActiveTab] = useState<"cases" | "results">("cases");

  const [isLoadingSuites, setIsLoadingSuites] = useState(true);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showGenerateDialog, setShowGenerateDialog] = useState(false);

  // Schedule state
  const [showScheduleDialog, setShowScheduleDialog] = useState(false);
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduleCron, setScheduleCron] = useState("0 3 * * *");
  const [schedulePreset, setSchedulePreset] = useState("0 3 * * *");
  const [isSavingSchedule, setIsSavingSchedule] = useState(false);

  // Compare state
  const [showCompareDialog, setShowCompareDialog] = useState(false);
  const [compareType, setCompareType] = useState<"version" | "model">("version");
  const [compareA, setCompareA] = useState("");
  const [compareB, setCompareB] = useState("");
  const [flowVersions, setFlowVersions] = useState<FlowVersion[]>([]);
  const [isComparing, setIsComparing] = useState(false);
  const [compareResult, setCompareResult] = useState<CompareResult | null>(null);
  const [agentName, setAgentName] = useState<string>("");

  // Fetch agent name for breadcrumb
  useEffect(() => {
    fetch(`/api/agents/${agentId}`)
      .then((r) => r.json())
      .then((j) => { if (j.success) setAgentName(j.data.name ?? "Agent"); })
      .catch(() => {});
  }, [agentId]);

  // Fetch suites list
  const fetchSuites = useCallback(async () => {
    try {
      const res = await fetch(`/api/agents/${agentId}/evals`);
      const json = await res.json();
      if (json.success) {
        setSuites(json.data);
        // Auto-select first suite
        if (!activeSuiteId && json.data.length > 0) {
          setActiveSuiteId(json.data[0].id);
        }
      }
    } catch {
      toast.error("Failed to load eval suites");
    } finally {
      setIsLoadingSuites(false);
    }
  }, [agentId, activeSuiteId]);

  useEffect(() => { fetchSuites(); }, [fetchSuites]);

  // Fetch suite detail when active suite changes
  useEffect(() => {
    if (!activeSuiteId) { setSuiteDetail(null); return; }

    setIsLoadingDetail(true);
    fetch(`/api/agents/${agentId}/evals/${activeSuiteId}`)
      .then((r) => r.json())
      .then((j) => {
        if (j.success) setSuiteDetail(j.data);
      })
      .catch(() => toast.error("Failed to load suite detail"))
      .finally(() => setIsLoadingDetail(false));

    // Fetch run history
    fetch(`/api/agents/${agentId}/evals/${activeSuiteId}/run?limit=10`)
      .then((r) => r.json())
      .then((j) => {
        if (j.success) {
          setRunHistory(j.data.runs);
          // Load last completed run for results tab
          const lastCompleted = j.data.runs.find((r: RunHistoryItem) => r.status === "COMPLETED");
          if (lastCompleted) loadRunDetail(activeSuiteId, lastCompleted.id);
        }
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId, activeSuiteId]);

  async function loadRunDetail(suiteId: string, runId: string) {
    try {
      const res = await fetch(`/api/agents/${agentId}/evals/${suiteId}/run/${runId}`);
      const json = await res.json();
      if (json.success) setActiveRun(json.data);
    } catch {/* silent */}
  }

  // Run evals
  async function handleRunEvals() {
    if (!activeSuiteId) return;
    setIsRunning(true);
    try {
      const res = await fetch(`/api/agents/${agentId}/evals/${activeSuiteId}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ triggeredBy: "manual" }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);

      // Refresh suite list (updated lastRun), history and show results
      await fetchSuites();
      const histRes = await fetch(`/api/agents/${agentId}/evals/${activeSuiteId}/run?limit=10`);
      const histJson = await histRes.json();
      if (histJson.success) setRunHistory(histJson.data.runs);

      // Load the run we just finished
      await loadRunDetail(activeSuiteId, json.data.runId);
      setActiveTab("results");
      toast.success(`Eval completed — ${json.data.passedCases}/${json.data.totalCases} passed`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Eval run failed");
    } finally {
      setIsRunning(false);
    }
  }

  // Delete suite
  async function handleDeleteSuite(suiteId: string) {
    try {
      const res = await fetch(`/api/agents/${agentId}/evals/${suiteId}`, { method: "DELETE" });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setSuites((prev) => prev.filter((s) => s.id !== suiteId));
      if (activeSuiteId === suiteId) {
        const remaining = suites.filter((s) => s.id !== suiteId);
        setActiveSuiteId(remaining[0]?.id ?? null);
      }
      toast.success("Suite deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete suite");
    }
  }

  // Set default suite
  async function handleSetDefault(suiteId: string) {
    try {
      const res = await fetch(`/api/agents/${agentId}/evals/${suiteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isDefault: true }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setSuites((prev) => prev.map((s) => ({ ...s, isDefault: s.id === suiteId })));
      toast.success("Default suite updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update default suite");
    }
  }

  // Toggle runOnDeploy for a suite
  async function handleToggleRunOnDeploy(suiteId: string, current: boolean) {
    try {
      const res = await fetch(`/api/agents/${agentId}/evals/${suiteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runOnDeploy: !current }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setSuites((prev) =>
        prev.map((s) => (s.id === suiteId ? { ...s, runOnDeploy: !current } : s))
      );
      toast.success(!current ? "Suite will run on deploy" : "Auto-run on deploy disabled");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update suite");
    }
  }

  // Open schedule dialog — pre-fill from current suite
  function openScheduleDialog(suite: EvalSuite) {
    setScheduleEnabled(suite.scheduleEnabled ?? false);
    const cron = suite.scheduleCron ?? "0 3 * * *";
    setScheduleCron(cron);
    const preset = CRON_PRESETS.find((p) => p.value === cron && p.value !== "custom");
    setSchedulePreset(preset ? cron : "custom");
    setShowScheduleDialog(true);
  }

  async function handleSaveSchedule() {
    if (!activeSuiteId) return;
    setIsSavingSchedule(true);
    try {
      const res = await fetch(`/api/agents/${agentId}/evals/${activeSuiteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scheduleEnabled,
          scheduleCron: scheduleEnabled ? scheduleCron : null,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setSuites((prev) =>
        prev.map((s) =>
          s.id === activeSuiteId
            ? { ...s, scheduleEnabled, scheduleCron: scheduleEnabled ? scheduleCron : null }
            : s,
        ),
      );
      setShowScheduleDialog(false);
      toast.success(scheduleEnabled ? "Schedule saved" : "Schedule disabled");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save schedule");
    } finally {
      setIsSavingSchedule(false);
    }
  }

  // Fetch flow versions when compare dialog opens
  async function openCompareDialog() {
    setCompareResult(null);
    setCompareA("");
    setCompareB("");
    setCompareType("version");
    setShowCompareDialog(true);

    // Fetch flow versions
    try {
      const res = await fetch(`/api/agents/${agentId}/flow/versions`);
      const json = await res.json();
      if (json.success) setFlowVersions(json.data ?? []);
    } catch {
      toast.error("Failed to load flow versions");
    }
  }

  async function handleRunComparison() {
    if (!activeSuiteId || !compareA || !compareB) return;
    setIsComparing(true);
    try {
      const res = await fetch(
        `/api/agents/${agentId}/evals/${activeSuiteId}/compare`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: compareType, a: compareA, b: compareB }),
        },
      );
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setCompareResult(json.data as CompareResult);
      // Refresh run history to show the new compare runs
      const histRes = await fetch(`/api/agents/${agentId}/evals/${activeSuiteId}/run?limit=10`);
      const histJson = await histRes.json();
      if (histJson.success) setRunHistory(histJson.data.runs);
      toast.success("Comparison complete");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Comparison failed");
    } finally {
      setIsComparing(false);
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      {/* Top bar */}
      <div className="border-b border-zinc-800 bg-zinc-900/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-zinc-400 hover:text-white transition-colors">
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-zinc-500">{agentName || agentId}</span>
              <span className="text-zinc-600">/</span>
              <span className="text-white font-medium flex items-center gap-1.5">
                <FlaskConical className="w-4 h-4 text-violet-400" />
                Evals
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/evals/standards" title="Eval Standards">
              <Button size="sm" variant="ghost" className="text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 gap-1.5">
                <ShieldCheck className="w-4 h-4" />
                <span className="hidden sm:inline">Standards</span>
              </Button>
            </Link>
            <Link href={`/builder/${agentId}`}>
              <Button size="sm" variant="outline" className="border-zinc-700 text-zinc-400 hover:bg-zinc-800">
                <Settings2 className="w-4 h-4 mr-1.5" /> Flow Builder
              </Button>
            </Link>
            <Link href={`/chat/${agentId}`}>
              <Button size="sm" variant="outline" className="border-zinc-700 text-zinc-400 hover:bg-zinc-800">
                Chat
              </Button>
            </Link>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6 flex gap-6">

        {/* ── Left sidebar: suite list ── */}
        <div className="w-60 shrink-0 space-y-2">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-zinc-300">Eval Suites</h2>
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant="ghost"
                title="Generate with AI"
                className="h-7 w-7 p-0 text-violet-400 hover:text-violet-300 hover:bg-zinc-800"
                onClick={() => setShowGenerateDialog(true)}
              >
                <Sparkles className="w-4 h-4" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                title="Create manually"
                className="h-7 w-7 p-0 text-zinc-500 hover:text-white hover:bg-zinc-800"
                onClick={() => setShowCreateDialog(true)}
              >
                <Plus className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {isLoadingSuites ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-zinc-600" />
            </div>
          ) : suites.length === 0 ? (
            <div className="text-center py-8 space-y-2">
              <p className="text-zinc-500 text-xs">No suites yet</p>
              <Button
                size="sm"
                className="mt-2 bg-violet-600 hover:bg-violet-700 text-white text-xs w-full"
                onClick={() => setShowGenerateDialog(true)}
              >
                <Sparkles className="w-3.5 h-3.5 mr-1" /> Generate with AI
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="border-zinc-700 text-zinc-400 hover:bg-zinc-800 text-xs w-full"
                onClick={() => setShowCreateDialog(true)}
              >
                <Plus className="w-3.5 h-3.5 mr-1" /> Create Manually
              </Button>
            </div>
          ) : (
            suites.map((suite) => (
              <div
                key={suite.id}
                onClick={() => setActiveSuiteId(suite.id)}
                className={`group relative rounded-lg px-3 py-2.5 cursor-pointer transition-colors border ${
                  activeSuiteId === suite.id
                    ? "bg-violet-600/20 border-violet-500/40 text-white"
                    : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      {suite.isDefault && <Star className="w-3 h-3 text-yellow-400 shrink-0" />}
                      {suite.runOnDeploy && (
                        <Rocket className="w-3 h-3 text-violet-400 shrink-0" aria-label="Runs on deploy" />
                      )}
                      {suite.scheduleEnabled && (
                        <Clock className="w-3 h-3 text-amber-400 shrink-0" aria-label="Scheduled" />
                      )}
                      <p className="text-sm font-medium truncate">{suite.name}</p>
                    </div>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      {suite.testCaseCount} case{suite.testCaseCount !== 1 ? "s" : ""}
                      {" · "}
                      <ScoreBadge score={suite.lastRun?.score} />
                    </p>
                  </div>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-white hover:bg-zinc-700"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <MoreVertical className="w-3.5 h-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="bg-zinc-800 border-zinc-700">
                      {!suite.isDefault && (
                        <DropdownMenuItem
                          className="text-zinc-300 hover:bg-zinc-700 cursor-pointer text-xs gap-2"
                          onClick={(e) => { e.stopPropagation(); handleSetDefault(suite.id); }}
                        >
                          <Star className="w-3.5 h-3.5 text-yellow-400" /> Set as Default
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem
                        className="text-zinc-300 hover:bg-zinc-700 cursor-pointer text-xs gap-2"
                        onClick={(e) => { e.stopPropagation(); handleToggleRunOnDeploy(suite.id, suite.runOnDeploy); }}
                      >
                        <Rocket className="w-3.5 h-3.5 text-violet-400" />
                        {suite.runOnDeploy ? "Disable auto-run on deploy" : "Run on deploy"}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-zinc-300 hover:bg-zinc-700 cursor-pointer text-xs gap-2"
                        onClick={(e) => { e.stopPropagation(); setActiveSuiteId(suite.id); openScheduleDialog(suite); }}
                      >
                        <Clock className="w-3.5 h-3.5 text-amber-400" />
                        {suite.scheduleEnabled ? "Edit schedule" : "Schedule runs"}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-red-400 hover:bg-zinc-700 cursor-pointer text-xs gap-2"
                        onClick={(e) => { e.stopPropagation(); handleDeleteSuite(suite.id); }}
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Delete Suite
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            ))
          )}
        </div>

        {/* ── Main content ── */}
        <div className="flex-1 min-w-0">
          {!activeSuiteId || !suiteDetail ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <FlaskConical className="w-12 h-12 text-zinc-700 mb-4" />
              <p className="text-zinc-400 font-medium">
                {suites.length === 0 ? "No eval suites yet" : "Select a suite to get started"}
              </p>
              <p className="text-zinc-600 text-sm mt-1">
                {suites.length === 0
                  ? "Create an eval suite to start testing your agent"
                  : "Click a suite in the left sidebar"}
              </p>
              {suites.length === 0 && (
                <Button
                  className="mt-4 bg-violet-600 hover:bg-violet-500 text-white"
                  onClick={() => setShowCreateDialog(true)}
                >
                  <Plus className="w-4 h-4 mr-2" /> Create Eval Suite
                </Button>
              )}
            </div>
          ) : isLoadingDetail ? (
            <div className="flex items-center justify-center py-24">
              <Loader2 className="w-6 h-6 animate-spin text-zinc-600" />
            </div>
          ) : (
            <div className="space-y-4">
              {/* Suite header */}
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h1 className="text-lg font-semibold text-white">{suiteDetail.name}</h1>
                    {suiteDetail.isDefault && (
                      <span className="text-xs px-2 py-0.5 bg-yellow-500/15 text-yellow-400 border border-yellow-500/30 rounded-full">
                        Default
                      </span>
                    )}
                    {suiteDetail.runOnDeploy && (
                      <span className="flex items-center gap-1 text-xs px-2 py-0.5 bg-violet-500/15 text-violet-400 border border-violet-500/30 rounded-full">
                        <Rocket className="w-3 h-3" /> Auto-run on deploy
                      </span>
                    )}
                    {suiteDetail.scheduleEnabled && suiteDetail.scheduleCron && (
                      <span className="flex items-center gap-1 text-xs px-2 py-0.5 bg-amber-500/15 text-amber-400 border border-amber-500/30 rounded-full">
                        <Clock className="w-3 h-3" /> {suiteDetail.scheduleCron}
                      </span>
                    )}
                  </div>
                  {suiteDetail.description && (
                    <p className="text-sm text-zinc-500 mt-0.5">{suiteDetail.description}</p>
                  )}
                </div>
                {/* Compare button */}
                <Button
                  size="sm"
                  variant="outline"
                  className="border-zinc-700 text-zinc-400 hover:bg-zinc-800 shrink-0"
                  onClick={openCompareDialog}
                  title="Head-to-head A/B comparison"
                >
                  <GitCompare className="w-3.5 h-3.5 mr-1.5" />
                  Compare
                </Button>
              </div>

              {/* Tabs: Cases / Results */}
              <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "cases" | "results")}>
                <TabsList className="bg-zinc-800 border border-zinc-700">
                  <TabsTrigger value="cases" className="data-[state=active]:bg-zinc-700 data-[state=active]:text-white text-zinc-400">
                    <FlaskConical className="w-3.5 h-3.5 mr-1.5" />
                    Test Cases
                    {suiteDetail.testCases.length > 0 && (
                      <span className="ml-1.5 text-xs bg-zinc-600 text-zinc-300 px-1.5 py-0.5 rounded-full">
                        {suiteDetail.testCases.length}
                      </span>
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="results" className="data-[state=active]:bg-zinc-700 data-[state=active]:text-white text-zinc-400">
                    <BarChart3 className="w-3.5 h-3.5 mr-1.5" />
                    Results
                    {runHistory.length > 0 && (
                      <span className="ml-1.5 text-xs bg-zinc-600 text-zinc-300 px-1.5 py-0.5 rounded-full">
                        {runHistory.length}
                      </span>
                    )}
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="cases" className="mt-4">
                  <EvalSuiteEditor
                    agentId={agentId}
                    suiteId={activeSuiteId}
                    initialCases={suiteDetail.testCases}
                    onRunEvals={handleRunEvals}
                    isRunning={isRunning}
                  />
                </TabsContent>

                <TabsContent value="results" className="mt-4">
                  {activeRun ? (
                    <EvalResultsView
                      run={activeRun}
                      history={runHistory}
                      onSelectRun={(runId) => loadRunDetail(activeSuiteId, runId)}
                      agentId={agentId}
                      suiteId={activeSuiteId}
                    />
                  ) : (
                    <div className="text-center py-16">
                      <BarChart3 className="w-10 h-10 text-zinc-700 mx-auto mb-3" />
                      <p className="text-zinc-500 text-sm">No runs yet</p>
                      <p className="text-zinc-600 text-xs mt-1">Run your eval suite to see results here</p>
                      <Button
                        size="sm"
                        className="mt-4 bg-violet-600 hover:bg-violet-500 text-white"
                        onClick={() => { setActiveTab("cases"); }}
                      >
                        Go to Test Cases
                      </Button>
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </div>
          )}
        </div>
      </div>

      {/* Create suite dialog (manual) */}
      <CreateSuiteDialog
        open={showCreateDialog}
        onClose={() => setShowCreateDialog(false)}
        onCreated={(suite) => {
          setSuites((prev) => [suite, ...prev]);
          setActiveSuiteId(suite.id);
        }}
        agentId={agentId}
      />

      {/* Generate suite dialog (AI) */}
      <GenerateEvalDialog
        agentId={agentId}
        open={showGenerateDialog}
        onClose={() => setShowGenerateDialog(false)}
        onGenerated={(suiteId) => {
          // Reload suites and auto-select the new one
          fetchSuites().then(() => setActiveSuiteId(suiteId));
        }}
      />

      {/* ── Schedule dialog ── */}
      <Dialog open={showScheduleDialog} onOpenChange={(v) => !v && setShowScheduleDialog(false)}>
        <DialogContent className="bg-zinc-900 border-zinc-700 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-400" />
              Schedule Eval Runs
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Enable toggle */}
            <label className="flex items-center gap-3 cursor-pointer">
              <div
                role="checkbox"
                aria-checked={scheduleEnabled}
                tabIndex={0}
                onClick={() => setScheduleEnabled((v) => !v)}
                onKeyDown={(e) => (e.key === " " || e.key === "Enter") && setScheduleEnabled((v) => !v)}
                className={`relative w-9 h-5 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-amber-500 ${scheduleEnabled ? "bg-amber-600" : "bg-zinc-700"}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${scheduleEnabled ? "translate-x-4" : "translate-x-0"}`} />
              </div>
              <div>
                <p className="text-sm text-zinc-300 font-medium">Enable scheduled runs</p>
                <p className="text-xs text-zinc-500">Automatically run this suite on a recurring schedule</p>
              </div>
            </label>

            {/* Cron preset + input */}
            {scheduleEnabled && (
              <div className="space-y-3">
                <div>
                  <Label className="text-zinc-300 text-xs mb-2 block">Frequency</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {CRON_PRESETS.map((p) => (
                      <button
                        key={p.value}
                        type="button"
                        onClick={() => {
                          setSchedulePreset(p.value);
                          if (p.value !== "custom") setScheduleCron(p.value);
                        }}
                        className={`text-xs px-3 py-2 rounded border text-left transition-colors ${
                          schedulePreset === p.value
                            ? "border-amber-500/60 bg-amber-500/10 text-amber-300"
                            : "border-zinc-700 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200"
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-zinc-300 text-xs">Cron expression (UTC)</Label>
                  <Input
                    value={scheduleCron}
                    onChange={(e) => { setScheduleCron(e.target.value); setSchedulePreset("custom"); }}
                    placeholder="0 3 * * *"
                    className="bg-zinc-800 border-zinc-600 text-white font-mono text-sm"
                  />
                  <p className="text-xs text-zinc-600">
                    Format: minute hour day month weekday · e.g. <code className="text-amber-400/70">0 3 * * *</code> = daily 3 AM UTC
                  </p>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowScheduleDialog(false)} className="border-zinc-600 text-zinc-300">
              Cancel
            </Button>
            <Button
              onClick={handleSaveSchedule}
              disabled={isSavingSchedule}
              className="bg-amber-600 hover:bg-amber-500 text-white"
            >
              {isSavingSchedule ? "Saving..." : "Save Schedule"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Compare dialog ── */}
      <Dialog open={showCompareDialog} onOpenChange={(v) => !v && setShowCompareDialog(false)}>
        <DialogContent className="bg-zinc-900 border-zinc-700 max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <GitCompare className="w-4 h-4 text-blue-400" />
              Head-to-Head Comparison
            </DialogTitle>
          </DialogHeader>

          {!compareResult ? (
            <div className="space-y-5 py-2">
              {/* Compare type toggle */}
              <div className="flex gap-2">
                {(["version", "model"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => { setCompareType(t); setCompareA(""); setCompareB(""); }}
                    className={`text-sm px-4 py-1.5 rounded-full border transition-colors capitalize ${
                      compareType === t
                        ? "border-blue-500/60 bg-blue-500/15 text-blue-300"
                        : "border-zinc-700 text-zinc-400 hover:border-zinc-600"
                    }`}
                  >
                    Compare {t === "version" ? "versions" : "models"}
                  </button>
                ))}
              </div>

              {compareType === "version" ? (
                <div className="grid grid-cols-2 gap-4">
                  {(["a", "b"] as const).map((side) => (
                    <div key={side} className="space-y-1.5">
                      <Label className="text-zinc-300 text-xs">Version {side.toUpperCase()}</Label>
                      <select
                        value={side === "a" ? compareA : compareB}
                        onChange={(e) => side === "a" ? setCompareA(e.target.value) : setCompareB(e.target.value)}
                        className="w-full bg-zinc-800 border border-zinc-600 text-zinc-200 rounded-md px-3 py-2 text-sm"
                      >
                        <option value="">Select version...</option>
                        {flowVersions.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.label ?? v.id.slice(0, 8)} — {v.status} — {new Date(v.createdAt).toLocaleDateString()}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  {(["a", "b"] as const).map((side) => (
                    <div key={side} className="space-y-1.5">
                      <Label className="text-zinc-300 text-xs">Model {side.toUpperCase()}</Label>
                      <select
                        value={side === "a" ? compareA : compareB}
                        onChange={(e) => side === "a" ? setCompareA(e.target.value) : setCompareB(e.target.value)}
                        className="w-full bg-zinc-800 border border-zinc-600 text-zinc-200 rounded-md px-3 py-2 text-sm"
                      >
                        <option value="">Select model...</option>
                        {ALL_MODELS.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name} ({m.provider})
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              )}

              <p className="text-xs text-zinc-600">
                Both {compareType === "version" ? "versions" : "models"} will be run against the same test cases sequentially. This may take a few minutes.
              </p>

              <DialogFooter>
                <Button variant="outline" onClick={() => setShowCompareDialog(false)} className="border-zinc-600 text-zinc-300">
                  Cancel
                </Button>
                <Button
                  onClick={handleRunComparison}
                  disabled={isComparing || !compareA || !compareB || compareA === compareB}
                  className="bg-blue-600 hover:bg-blue-500 text-white"
                >
                  {isComparing ? (
                    <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Running...</>
                  ) : (
                    <><GitCompare className="w-3.5 h-3.5 mr-1.5" /> Run Comparison</>
                  )}
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="py-2 space-y-4">
              <EvalCompareView result={compareResult} />
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setCompareResult(null)}
                  className="border-zinc-600 text-zinc-300"
                >
                  Run Another
                </Button>
                <Button onClick={() => setShowCompareDialog(false)} className="bg-zinc-700 hover:bg-zinc-600 text-white">
                  Close
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
