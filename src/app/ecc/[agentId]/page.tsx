"use client";

import { use, useState, useCallback } from "react";
import Link from "next/link";
import useSWR from "swr";
import {
  ArrowLeft,
  Brain,
  TrendingUp,
  Award,
  Zap,
  AlertCircle,
  CheckCircle2,
  Clock,
  BarChart2,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface LifecycleStats {
  total: number;
  byConfidenceBucket: Record<string, number>;
  promotionReady: number;
  promoted: number;
  decaying: number;
  averageConfidence: number;
  averageFrequency: number;
}

interface InstinctSummary {
  id: string;
  name: string;
  description: string;
  confidence: number;
  frequency: number;
  agentId: string;
  promotedToSkillId: string | null;
}

interface PromotionCandidate {
  instinct: InstinctSummary;
  skillSlug: string;
}

interface Instinct {
  id: string;
  name: string;
  description: string;
  confidence: number;
  frequency: number;
  promotedToSkillId: string | null;
  createdAt: string;
  updatedAt: string;
}

interface InstinctsData {
  eccEnabled: boolean;
  stats: LifecycleStats;
  promotionCandidates: PromotionCandidate[];
  instincts: Instinct[];
}

interface InstinctsResponse {
  success: boolean;
  data: InstinctsData;
}

// ─── Fetcher ─────────────────────────────────────────────────────────────────

async function fetcher<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Network error");
  return res.json() as Promise<T>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function confidenceColor(c: number): string {
  if (c >= 0.85) return "text-emerald-400";
  if (c >= 0.6) return "text-yellow-400";
  return "text-zinc-400";
}

function confidenceBg(c: number): string {
  if (c >= 0.85) return "bg-emerald-400";
  if (c >= 0.6) return "bg-yellow-400";
  return "bg-zinc-500";
}

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function EccPage({
  params,
}: {
  params: Promise<{ agentId: string }>;
}): React.JSX.Element {
  const { agentId } = use(params);
  const [isTogglingEcc, setIsTogglingEcc] = useState(false);

  const { data, error, isLoading, mutate } = useSWR<InstinctsResponse>(
    `/api/agents/${agentId}/instincts`,
    fetcher,
  );

  const instinctsData = data?.data;

  const handleToggleEcc = useCallback(async () => {
    if (!instinctsData) return;
    const newValue = !instinctsData.eccEnabled;
    setIsTogglingEcc(true);
    try {
      const res = await fetch(`/api/agents/${agentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eccEnabled: newValue }),
      });
      const json = (await res.json()) as { success: boolean; error?: string };
      if (!json.success) throw new Error(json.error ?? "Update failed");
      toast.success(
        newValue ? "ECC Learning enabled" : "ECC Learning disabled",
      );
      await mutate();
    } catch {
      toast.error("Failed to update ECC setting");
    } finally {
      setIsTogglingEcc(false);
    }
  }, [agentId, instinctsData, mutate]);

  return (
    <div className="flex h-full flex-col overflow-auto bg-background">
      {/* Header */}
      <div className="flex items-center gap-4 border-b border-border px-6 py-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/">
            <ArrowLeft className="size-4" />
          </Link>
        </Button>
        <div className="flex items-center gap-2">
          <Brain className="size-5 text-primary" />
          <h1 className="text-lg font-semibold">ECC Learning Dashboard</h1>
        </div>
        <Badge variant="outline" className="ml-auto text-xs text-muted-foreground">
          Agent: {agentId.slice(0, 8)}…
        </Badge>
      </div>

      <div className="flex-1 space-y-6 p-6">
        {/* ECC Toggle Card */}
        <div className="rounded-lg border border-border bg-card p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <Zap className="size-4 text-primary" />
                Emergent Capability Capture (ECC)
              </h2>
              <p className="text-sm text-muted-foreground">
                When enabled, the agent automatically extracts behavioral
                patterns from successful executions and surfaces them as
                learnable instincts. High-confidence instincts can be promoted
                to reusable Skills after human review.
              </p>
            </div>
            <div className="shrink-0">
              {isLoading ? (
                <Skeleton className="h-9 w-24 rounded-md" />
              ) : (
                <Button
                  variant={instinctsData?.eccEnabled ? "default" : "outline"}
                  size="sm"
                  onClick={handleToggleEcc}
                  disabled={isTogglingEcc || isLoading}
                  className={cn(
                    "min-w-[100px] transition-colors",
                    instinctsData?.eccEnabled &&
                      "bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600",
                  )}
                >
                  {isTogglingEcc ? (
                    <Loader2 className="mr-2 size-3.5 animate-spin" />
                  ) : instinctsData?.eccEnabled ? (
                    <CheckCircle2 className="mr-2 size-3.5" />
                  ) : (
                    <AlertCircle className="mr-2 size-3.5" />
                  )}
                  {instinctsData?.eccEnabled ? "Enabled" : "Disabled"}
                </Button>
              )}
            </div>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            <AlertCircle className="size-4 shrink-0" />
            Failed to load instinct data.
          </div>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            {
              icon: Brain,
              label: "Total Instincts",
              value: isLoading ? null : (instinctsData?.stats.total ?? 0),
              color: "text-blue-400",
            },
            {
              icon: TrendingUp,
              label: "Avg Confidence",
              value: isLoading
                ? null
                : pct(instinctsData?.stats.averageConfidence ?? 0),
              color: "text-yellow-400",
            },
            {
              icon: Award,
              label: "Ready to Promote",
              value: isLoading
                ? null
                : (instinctsData?.stats.promotionReady ?? 0),
              color: "text-emerald-400",
            },
            {
              icon: CheckCircle2,
              label: "Promoted to Skills",
              value: isLoading ? null : (instinctsData?.stats.promoted ?? 0),
              color: "text-primary",
            },
          ].map((stat) => (
            <div
              key={stat.label}
              className="rounded-lg border border-border bg-card p-4"
            >
              <stat.icon className={cn("mb-2 size-5", stat.color)} />
              {stat.value === null ? (
                <Skeleton className="mb-1 h-7 w-12" />
              ) : (
                <p className="text-2xl font-semibold tabular-nums">
                  {stat.value}
                </p>
              )}
              <p className="text-xs text-muted-foreground">{stat.label}</p>
            </div>
          ))}
        </div>

        {/* Confidence Buckets */}
        {!isLoading && instinctsData && instinctsData.stats.total > 0 && (
          <div className="rounded-lg border border-border bg-card p-5">
            <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold">
              <BarChart2 className="size-4 text-muted-foreground" />
              Confidence Distribution
            </h3>
            <div className="space-y-2">
              {Object.entries(instinctsData.stats.byConfidenceBucket).map(
                ([bucket, count]) => {
                  const total = instinctsData.stats.total;
                  const width = total > 0 ? (count / total) * 100 : 0;
                  return (
                    <div key={bucket} className="flex items-center gap-3">
                      <span className="w-20 text-right text-xs tabular-nums text-muted-foreground">
                        {bucket}
                      </span>
                      <div className="flex-1 overflow-hidden rounded-full bg-muted/40">
                        <div
                          className="h-2 rounded-full bg-primary transition-all"
                          style={{ width: `${width}%` }}
                        />
                      </div>
                      <span className="w-6 text-right text-xs tabular-nums text-muted-foreground">
                        {count}
                      </span>
                    </div>
                  );
                },
              )}
            </div>
          </div>
        )}

        {/* Promotion Candidates */}
        {!isLoading &&
          instinctsData &&
          instinctsData.promotionCandidates.length > 0 && (
            <div className="rounded-lg border border-emerald-800/40 bg-emerald-950/20 p-5">
              <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold text-emerald-400">
                <Award className="size-4" />
                Promotion Candidates
              </h3>
              <p className="mb-4 text-xs text-muted-foreground">
                These instincts meet the threshold (confidence ≥ 85%,
                frequency ≥ 10) and are awaiting human approval before
                becoming Skills.
              </p>
              <div className="space-y-2">
                {instinctsData.promotionCandidates.map(({ instinct }) => (
                  <div
                    key={instinct.id}
                    className="flex items-center gap-3 rounded-md border border-emerald-800/30 bg-emerald-950/30 px-3 py-2"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-sm font-medium">
                        {instinct.name}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {instinct.description}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <span className="text-xs tabular-nums text-muted-foreground">
                        ×{instinct.frequency}
                      </span>
                      <Badge
                        variant="outline"
                        className="border-emerald-700 bg-emerald-900/40 text-emerald-300 tabular-nums"
                      >
                        {pct(instinct.confidence)}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

        {/* All Instincts */}
        <div className="rounded-lg border border-border bg-card">
          <div className="border-b border-border px-5 py-4">
            <h3 className="text-sm font-semibold">All Instincts</h3>
            <p className="text-xs text-muted-foreground">
              Behavioral patterns extracted from agent executions
            </p>
          </div>

          {isLoading ? (
            <div className="space-y-px">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="px-5 py-3">
                  <Skeleton className="mb-1.5 h-4 w-48" />
                  <Skeleton className="h-3 w-full" />
                </div>
              ))}
            </div>
          ) : instinctsData?.instincts.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-5 py-12 text-center">
              <Brain className="size-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">
                No instincts yet.
              </p>
              <p className="text-xs text-muted-foreground">
                {instinctsData.eccEnabled
                  ? "Run the agent a few times and instincts will appear here automatically."
                  : "Enable ECC Learning above to start extracting behavioral patterns."}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {instinctsData?.instincts.map((inst) => (
                <div key={inst.id} className="flex items-center gap-4 px-5 py-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium">
                        {inst.name}
                      </p>
                      {inst.promotedToSkillId && (
                        <Badge
                          variant="outline"
                          className="shrink-0 border-primary/30 text-primary text-[10px]"
                        >
                          Skill
                        </Badge>
                      )}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {inst.description}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-4">
                    {/* Frequency */}
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="size-3" />
                      <span className="tabular-nums">×{inst.frequency}</span>
                    </div>

                    {/* Confidence bar */}
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted/40">
                        <div
                          className={cn(
                            "h-full rounded-full transition-all",
                            confidenceBg(inst.confidence),
                          )}
                          style={{ width: pct(inst.confidence) }}
                        />
                      </div>
                      <span
                        className={cn(
                          "w-9 text-right text-xs tabular-nums",
                          confidenceColor(inst.confidence),
                        )}
                      >
                        {pct(inst.confidence)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
