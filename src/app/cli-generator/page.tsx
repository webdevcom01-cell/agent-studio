"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import useSWR from "swr";
import {
  ArrowLeft,
  Plus,
  Terminal,
  Trash2,
  RefreshCw,
  Loader2,
  Download,
  RotateCcw,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  GenerationWizard,
  type GenerationWizardResult,
} from "@/components/cli-generator/generation-wizard";
import { PhaseMonitor } from "@/components/cli-generator/phase-monitor";
import { CLIPreview } from "@/components/cli-generator/cli-preview";
import { FileViewer } from "@/components/cli-generator/file-viewer";
import { MCPTestPanel } from "@/components/cli-generator/mcp-test-panel";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { PhaseResult } from "@/lib/cli-generator/types";
import { cn } from "@/lib/utils";

interface Generation {
  id: string;
  applicationName: string;
  target: string;
  status: string;
  currentPhase: number;
  createdAt: string;
  updatedAt: string;
  errorMessage: string | null;
}

interface GenerationDetail {
  id: string;
  applicationName: string;
  status: string;
  currentPhase: number;
  phases: PhaseResult[];
  cliConfig: Record<string, unknown> | null;
  generatedFiles: Record<string, string> | null;
  errorMessage: string | null;
}

const TERMINAL_STATUSES = new Set(["COMPLETED", "FAILED"]);
const POLLING_INTERVAL_MS = 2000;
/** Generations not updated within this window are flagged as stuck. */
const STUCK_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes — matches server constant

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function isInProgress(status: string): boolean {
  return !TERMINAL_STATUSES.has(status);
}

function isStuck(gen: Generation): boolean {
  if (TERMINAL_STATUSES.has(gen.status)) return false;
  return Date.now() - new Date(gen.updatedAt).getTime() > STUCK_THRESHOLD_MS;
}

function isResumable(gen: Generation): boolean {
  return gen.status === "FAILED" || isStuck(gen);
}

export default function CLIGeneratorPage(): React.JSX.Element {
  const [generations, setGenerations] = useState<Generation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showWizard, setShowWizard] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isResumingId, setIsResumingId] = useState<string | null>(null);
  /** Tracks generation IDs that have already been auto-resumed this session. */
  const autoResumedRef = useRef<Set<string>>(new Set());
  /** Tracks generation IDs that have already triggered a stuck toast this session. */
  const notifiedStuckRef = useRef<Set<string>>(new Set());

  const {
    data: detailResponse,
    isLoading: isLoadingDetail,
    mutate: mutateDetail,
  } = useSWR<{ success: boolean; data: GenerationDetail }>(
    selectedId ? `/api/cli-generator/${selectedId}` : null,
    fetcher,
    {
      refreshInterval: (latestData) => {
        const status = latestData?.data?.status;
        if (status && isInProgress(status)) return POLLING_INTERVAL_MS;
        return 0;
      },
    },
  );

  const detail = detailResponse?.success ? detailResponse.data : null;

  const fetchGenerations = useCallback(async (): Promise<void> => {
    try {
      const res = await fetch("/api/cli-generator");
      const json = await res.json();
      if (json.success) setGenerations(json.data);
    } catch {
      toast.error("Failed to load generations");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGenerations();
  }, [fetchGenerations]);

  useEffect(() => {
    if (!detail) return;
    setGenerations((prev) =>
      prev.map((g) =>
        g.id === detail.id
          ? { ...g, status: detail.status, currentPhase: detail.currentPhase }
          : g,
      ),
    );
  }, [detail]);

  // F2: Proactive stuck notification — fires a warning toast the first time a
  // generation transitions into a stuck state, regardless of whether it is selected.
  // Fires at most once per generation per page session (guarded by notifiedStuckRef).
  useEffect(() => {
    for (const gen of generations) {
      if (!isStuck(gen)) continue;
      if (notifiedStuckRef.current.has(gen.id)) continue;
      notifiedStuckRef.current.add(gen.id);
      toast.warning(
        `Generation "${gen.applicationName}" appears stuck — click it to auto-resume.`,
        { duration: 8000 },
      );
    }
  }, [generations]);

  // F1: Auto-resume stuck generations when they are selected.
  // Fires at most once per generation per page session (guarded by autoResumedRef).
  useEffect(() => {
    if (!selectedId || isResumingId !== null) return;
    const gen = generations.find((g) => g.id === selectedId);
    if (!gen || !isStuck(gen)) return;
    if (autoResumedRef.current.has(selectedId)) return;
    autoResumedRef.current.add(selectedId);
    void handleResume(selectedId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, generations, isResumingId]);

  function handleSelect(id: string): void {
    setSelectedId(id);
  }

  /**
   * Creates the generation record then drives each phase by calling /advance
   * sequentially. Each /advance call is an independent serverless function
   * invocation — giving each phase its own 300s budget (2026 industry standard).
   */
  async function handleCreate(data: GenerationWizardResult): Promise<void> {
    setIsCreating(true);
    try {
      const res = await fetch("/api/cli-generator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!json.success) {
        toast.error(json.error ?? "Failed to start generation");
        return;
      }

      const generationId: string = json.data.id;
      setShowWizard(false);
      toast.success("Generation started");
      await fetchGenerations();
      setSelectedId(generationId);

      // Drive the pipeline: call /advance for each phase until done or error.
      // Config is passed in each request body since it's not stored in the DB.
      let done = false;
      while (!done) {
        const advanceRes = await fetch(
          `/api/cli-generator/${generationId}/advance`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ config: data }),
          },
        );
        const advanceJson = await advanceRes.json();

        if (!advanceJson.success) {
          // Phase failed — SWR polling will pick up the FAILED status
          break;
        }

        done = advanceJson.data?.done === true;

        // Trigger SWR revalidation so UI updates after each phase
        await mutateDetail();
      }

      await fetchGenerations();
    } catch {
      toast.error("Failed to start generation");
    } finally {
      setIsCreating(false);
    }
  }

  async function handleDelete(): Promise<void> {
    if (!confirmDeleteId) return;
    setIsDeleting(true);
    try {
      await fetch(`/api/cli-generator/${confirmDeleteId}`, {
        method: "DELETE",
      });
      setGenerations((prev) =>
        prev.filter((g) => g.id !== confirmDeleteId),
      );
      if (selectedId === confirmDeleteId) {
        setSelectedId(null);
      }
      toast.success("Generation deleted");
      setConfirmDeleteId(null);
    } catch {
      toast.error("Failed to delete generation");
    } finally {
      setIsDeleting(false);
    }
  }

  async function handleRefresh(): Promise<void> {
    if (selectedId) {
      await mutateDetail();
    }
    await fetchGenerations();
  }

  /**
   * Resumes a FAILED or stuck generation.
   *
   * Calls POST /resume to reset failed/running phases back to "pending",
   * then re-drives the pipeline by looping over /advance until done.
   * Works like handleCreate but picks up from the last failed phase instead
   * of starting from scratch — completed phase outputs remain intact in the DB.
   */
  async function handleResume(generationId: string): Promise<void> {
    setIsResumingId(generationId);
    try {
      const resumeRes = await fetch(
        `/api/cli-generator/${generationId}/resume`,
        { method: "POST" },
      );
      const resumeJson = await resumeRes.json();

      if (!resumeJson.success) {
        toast.error(resumeJson.error ?? "Failed to resume generation");
        return;
      }

      if (resumeJson.data?.done) {
        // Edge case: all phases were already complete — nothing left to run
        await Promise.all([mutateDetail(), fetchGenerations()]);
        return;
      }

      setSelectedId(generationId);
      toast.success("Resuming generation…");

      // Drive the pipeline forward from the reset phase
      let done = false;
      while (!done) {
        const advanceRes = await fetch(
          `/api/cli-generator/${generationId}/advance`,
          { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) },
        );
        const advanceJson = await advanceRes.json();

        if (!advanceJson.success) {
          break;
        }

        done = advanceJson.data?.done === true;
        await mutateDetail();
      }

      await fetchGenerations();
    } catch {
      toast.error("Failed to resume generation");
    } finally {
      setIsResumingId(null);
    }
  }

  const isCompleted = detail?.status === "COMPLETED";
  const isRunning = detail !== null && detail !== undefined && isInProgress(detail.status);
  // Show FileViewer when running (for live preview F2) or when completed with files
  const hasFiles = isCompleted && detail.generatedFiles && Object.keys(detail.generatedFiles).length > 0;
  const showFileViewer = selectedId && (hasFiles || isRunning);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex h-[52px] shrink-0 items-center justify-between gap-4 border-b border-border px-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon-sm" asChild>
              <Link href="/">
                <ArrowLeft className="size-4" />
              </Link>
            </Button>
            <div className="flex items-center gap-2">
              <Terminal className="size-4 text-muted-foreground" />
              <span className="text-sm font-medium">CLI Generator</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={handleRefresh}
              title="Refresh"
            >
              <RefreshCw className="size-4" />
            </Button>
            <Button
              size="sm"
              onClick={() => setShowWizard(true)}
              className="gap-1.5 h-7 px-3 text-xs font-medium"
            >
              <Plus className="size-3" />
              New Generation
            </Button>
          </div>
      </div>

      <main className="flex-1 overflow-y-auto px-6 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Generation List */}
          <div className="lg:col-span-1">
            <h2 className="text-sm font-medium mb-3 text-muted-foreground">
              Generations
            </h2>
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              </div>
            ) : generations.length === 0 ? (
              <div className="flex flex-col items-center py-12 text-center">
                <Terminal className="size-8 text-muted-foreground mb-3" />
                <p className="text-sm text-muted-foreground mb-4">
                  No CLI generations yet
                </p>
                <Button
                  size="sm"
                  onClick={() => setShowWizard(true)}
                  className="gap-1.5"
                >
                  <Plus className="size-3" />
                  Create your first
                </Button>
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                {generations.map((gen) => {
                  const stuck = isStuck(gen);
                  const resumable = isResumable(gen);
                  const resuming = isResumingId === gen.id;
                  return (
                    <button
                      key={gen.id}
                      type="button"
                      onClick={() => handleSelect(gen.id)}
                      className={cn(
                        "group flex items-center justify-between rounded-lg border p-3 text-left transition-all hover:border-foreground/20",
                        selectedId === gen.id
                          ? "border-primary bg-primary/5"
                          : "border-border bg-card",
                        stuck && "border-muted-foreground/30",
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          {stuck && (
                            <AlertTriangle className="size-3 shrink-0 text-muted-foreground" aria-label="Stuck — click Resume to continue" />
                          )}
                          <span className="text-sm font-medium truncate">
                            {gen.applicationName}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <StatusBadge status={gen.status} />
                          <span className="text-[10px] text-muted-foreground">
                            {gen.target === "typescript" ? "⬡ TS" : "🐍 Py"}
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            {new Date(gen.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {resumable && (
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            disabled={resuming}
                            onClick={(e) => {
                              e.stopPropagation();
                              void handleResume(gen.id);
                            }}
                            title={stuck ? "Resume stuck generation" : "Retry failed generation"}
                            className={cn(
                              "opacity-0 group-hover:opacity-100",
                              gen.status === "FAILED"
                                ? "text-destructive hover:text-destructive/80"
                                : "text-muted-foreground hover:text-foreground",
                            )}
                          >
                            {resuming ? (
                              <Loader2 className="size-3 animate-spin" />
                            ) : (
                              <RotateCcw className="size-3" />
                            )}
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            setConfirmDeleteId(gen.id);
                          }}
                          className="opacity-0 group-hover:opacity-100"
                        >
                          <Trash2 className="size-3" />
                        </Button>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Detail Panel */}
          <div className="lg:col-span-2">
            {!selectedId ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <Terminal className="size-10 text-muted-foreground/40 mb-3" />
                <p className="text-sm text-muted-foreground">
                  Select a generation to view progress
                </p>
              </div>
            ) : isLoadingDetail && !detail ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              </div>
            ) : detail ? (
              <div className="flex flex-col gap-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-medium">
                      {detail.applicationName}
                    </h2>
                    {detail.errorMessage && (
                      <p className="text-xs text-destructive mt-1">
                        {detail.errorMessage}
                      </p>
                    )}
                  </div>
                  <Button
                    size="sm"
                    className="gap-1.5 shrink-0"
                    disabled={!isCompleted}
                    onClick={() => {
                      if (selectedId) {
                        window.open(
                          `/api/cli-generator/${selectedId}/download`,
                          "_blank",
                        );
                      }
                    }}
                  >
                    <Download className="size-3.5" />
                    Download CLI Bridge
                  </Button>
                </div>

                <PhaseMonitor
                  phases={detail.phases ?? []}
                  currentPhase={detail.currentPhase}
                  status={detail.status}
                />

                {showFileViewer && selectedId && (
                  <FileViewer generationId={selectedId} isRunning={isRunning} />
                )}

                {isCompleted && detail.cliConfig && (
                  <CLIPreview
                    cliConfig={
                      detail.cliConfig as unknown as Parameters<typeof CLIPreview>[0]["cliConfig"]
                    }
                  />
                )}

                {isCompleted && selectedId && (
                  <div className="rounded-lg border border-border bg-card p-4">
                    <h3 className="text-sm font-medium mb-3">Bridge Validation &amp; Config</h3>
                    <MCPTestPanel generationId={selectedId} />
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>
      </main>

      <GenerationWizard
        open={showWizard}
        onOpenChange={setShowWizard}
        onSubmit={handleCreate}
        isSubmitting={isCreating}
      />

      <ConfirmDialog
        open={confirmDeleteId !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmDeleteId(null);
        }}
        title="Delete Generation"
        description="Are you sure? This will permanently remove this CLI generation and stop any in-progress pipeline."
        onConfirm={handleDelete}
        isLoading={isDeleting}
      />
    </div>
  );
}

function StatusBadge({ status }: { status: string }): React.JSX.Element {
  const colorMap: Record<string, string> = {
    PENDING: "text-muted-foreground/60",
    ANALYZING: "text-muted-foreground",
    DESIGNING: "text-muted-foreground",
    IMPLEMENTING: "text-muted-foreground",
    TESTING: "text-muted-foreground",
    DOCUMENTING: "text-muted-foreground",
    PUBLISHING: "text-muted-foreground",
    COMPLETED: "text-foreground/60",
    FAILED: "text-destructive",
  };

  return (
    <span
      className={cn(
        "text-[10px] font-medium px-1.5 py-0.5 rounded-full",
        colorMap[status] ?? colorMap.PENDING,
      )}
    >
      {status}
    </span>
  );
}
