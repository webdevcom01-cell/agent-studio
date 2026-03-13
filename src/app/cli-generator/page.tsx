"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Plus,
  Terminal,
  Trash2,
  RefreshCw,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  GenerationWizard,
  type GenerationWizardResult,
} from "@/components/cli-generator/generation-wizard";
import { PhaseMonitor } from "@/components/cli-generator/phase-monitor";
import { CLIPreview } from "@/components/cli-generator/cli-preview";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { PhaseResult } from "@/lib/cli-generator/types";
import { cn } from "@/lib/utils";

interface Generation {
  id: string;
  applicationName: string;
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
  errorMessage: string | null;
}

export default function CLIGeneratorPage(): React.JSX.Element {
  const [generations, setGenerations] = useState<Generation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showWizard, setShowWizard] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<GenerationDetail | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

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

  async function fetchDetail(id: string): Promise<void> {
    setIsLoadingDetail(true);
    try {
      const res = await fetch(`/api/cli-generator/${id}`);
      const json = await res.json();
      if (json.success) {
        setDetail(json.data);
      }
    } catch {
      toast.error("Failed to load generation details");
    } finally {
      setIsLoadingDetail(false);
    }
  }

  function handleSelect(id: string): void {
    setSelectedId(id);
    fetchDetail(id);
  }

  async function handleCreate(data: GenerationWizardResult): Promise<void> {
    setIsCreating(true);
    try {
      const res = await fetch("/api/cli-generator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (json.success) {
        setShowWizard(false);
        toast.success("Generation started");
        fetchGenerations();
        handleSelect(json.data.id);
      } else {
        toast.error(json.error ?? "Failed to start generation");
      }
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
        setDetail(null);
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
      await fetchDetail(selectedId);
    }
    await fetchGenerations();
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/90 backdrop-blur-sm">
        <div className="mx-auto max-w-6xl px-6 h-14 flex items-center justify-between gap-4">
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
      </header>

      {/* Content */}
      <main className="mx-auto max-w-6xl px-6 py-6">
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
                {generations.map((gen) => (
                  <button
                    key={gen.id}
                    type="button"
                    onClick={() => handleSelect(gen.id)}
                    className={cn(
                      "group flex items-center justify-between rounded-lg border p-3 text-left transition-all hover:border-foreground/20",
                      selectedId === gen.id
                        ? "border-primary bg-primary/5"
                        : "border-border bg-card",
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">
                        {gen.applicationName}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <StatusBadge status={gen.status} />
                        <span className="text-[10px] text-muted-foreground">
                          {new Date(gen.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={(e) => {
                        e.stopPropagation();
                        setConfirmDeleteId(gen.id);
                      }}
                      className="opacity-0 group-hover:opacity-100 shrink-0"
                    >
                      <Trash2 className="size-3" />
                    </Button>
                  </button>
                ))}
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
            ) : isLoadingDetail ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              </div>
            ) : detail ? (
              <div className="flex flex-col gap-6">
                <div>
                  <h2 className="text-lg font-medium">
                    {detail.applicationName}
                  </h2>
                  {detail.errorMessage && (
                    <p className="text-xs text-red-500 mt-1">
                      {detail.errorMessage}
                    </p>
                  )}
                </div>

                <PhaseMonitor
                  phases={detail.phases ?? []}
                  currentPhase={detail.currentPhase}
                  status={detail.status}
                />

                {detail.status === "COMPLETED" && detail.cliConfig && (
                  <CLIPreview
                    cliConfig={
                      detail.cliConfig as unknown as Parameters<typeof CLIPreview>[0]["cliConfig"]
                    }
                  />
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
    PENDING: "bg-gray-500/10 text-gray-500",
    ANALYZING: "bg-blue-500/10 text-blue-500",
    DESIGNING: "bg-purple-500/10 text-purple-500",
    IMPLEMENTING: "bg-orange-500/10 text-orange-500",
    TESTING: "bg-yellow-500/10 text-yellow-500",
    DOCUMENTING: "bg-cyan-500/10 text-cyan-500",
    PUBLISHING: "bg-emerald-500/10 text-emerald-500",
    COMPLETED: "bg-green-500/10 text-green-500",
    FAILED: "bg-red-500/10 text-red-500",
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
