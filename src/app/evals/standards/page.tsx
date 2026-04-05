"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft, ShieldCheck, BookOpen, ChevronDown,
  CheckCircle2, Circle,
} from "lucide-react";
import {
  GLOBAL_EVAL_ASSERTIONS,
  CATEGORY_EVAL_STANDARDS,
  getCategoryStandard,
  type AssertionTemplate,
  type EvalCategoryStandard,
} from "@/lib/evals/standards";

// ─── Layer config ──────────────────────────────────────────────────────────────

const LAYER_CONFIG = {
  1: {
    bg: "bg-muted/30",
    border: "border-border/50",
    text: "text-muted-foreground",
    badge: "border border-border bg-background text-muted-foreground/60",
    label: "L1",
    name: "Deterministic",
  },
  2: {
    bg: "bg-muted/20",
    border: "border-border/40",
    text: "text-muted-foreground",
    badge: "border border-border bg-background text-muted-foreground/60",
    label: "L2",
    name: "Semantic",
  },
  3: {
    bg: "bg-muted/10",
    border: "border-border/30",
    text: "text-muted-foreground",
    badge: "border border-border bg-background text-muted-foreground/60",
    label: "L3",
    name: "LLM-Judge",
  },
} as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatThreshold(assertion: AssertionTemplate["assertion"]): string {
  const a = assertion as Record<string, unknown>;
  if (typeof a["threshold"] !== "number") return "";
  if (assertion.type === "latency") {
    return `< ${((a["threshold"] as number) / 1000).toFixed(0)}s`;
  }
  return `≥ ${(a["threshold"] as number).toFixed(2)}`;
}

function getDisplayValue(assertion: AssertionTemplate["assertion"]): string | null {
  const a = assertion as Record<string, unknown>;
  if (typeof a["value"] === "string") {
    const v = a["value"] as string;
    return `"${v.length > 32 ? v.slice(0, 32) + "…" : v}"`;
  }
  if (typeof a["rubric"] === "string") {
    const r = a["rubric"] as string;
    return `"${r.slice(0, 55)}${r.length > 55 ? "…" : ""}"`;
  }
  return null;
}

function passingScoreColor(score: number): string {
  if (score >= 0.85) return "text-foreground/60";
  if (score >= 0.75) return "text-muted-foreground";
  return "text-destructive/70";
}

// ─── AssertionRow ─────────────────────────────────────────────────────────────

function AssertionRow({ template }: { template: AssertionTemplate }) {
  const layer = LAYER_CONFIG[template.layer];
  const threshold = formatThreshold(template.assertion);
  const displayValue = getDisplayValue(template.assertion);

  return (
    <div
      className={`rounded-md border px-3 py-2 ${layer.bg} ${layer.border} ${
        template.required ? "" : "opacity-55"
      }`}
    >
      <div className="flex items-center gap-2 flex-wrap">
        {/* Layer badge */}
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${layer.badge}`}>
          {layer.label}
        </span>

        {/* Type */}
        <span className={`text-xs font-mono font-medium ${layer.text}`}>
          {template.assertion.type}
        </span>

        {/* Threshold */}
        {threshold && (
          <span className={`text-xs ${layer.text} opacity-70`}>{threshold}</span>
        )}

        {/* Value / rubric preview */}
        {displayValue && (
          <span
            className={`text-xs ${layer.text} opacity-50 truncate max-w-[220px]`}
            title={displayValue}
          >
            {displayValue}
          </span>
        )}

        {/* Required pill */}
        <div className="ml-auto flex items-center gap-1">
          {template.required ? (
            <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground font-medium uppercase tracking-wide">
              <CheckCircle2 className="size-3 text-muted-foreground" />
              required
            </span>
          ) : (
            <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground/40 uppercase tracking-wide">
              <Circle className="size-3" />
              optional
            </span>
          )}
        </div>
      </div>

      {/* Rationale */}
      <p className={`mt-1 text-[11px] leading-snug ${layer.text} opacity-50`}>
        {template.rationale.length > 110
          ? template.rationale.slice(0, 110) + "…"
          : template.rationale}
      </p>
    </div>
  );
}

// ─── CategoryCard ─────────────────────────────────────────────────────────────

function CategoryCard({ standard }: { standard: EvalCategoryStandard }) {
  const [showLabels, setShowLabels] = useState(false);
  const merged = getCategoryStandard(standard.category);

  const requiredCount = merged.assertions.filter((a) => a.required).length;
  const optionalCount = merged.assertions.length - requiredCount;

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4">
      {/* Header */}
      <div>
        <div className="flex items-center justify-between gap-2 mb-1">
          <h3 className="text-sm font-semibold text-foreground">{standard.displayName}</h3>
          <span className="text-[10px] font-mono text-muted-foreground/40 shrink-0 select-none">
            {standard.category}
          </span>
        </div>
        <p className="text-xs text-muted-foreground/60 leading-relaxed">{standard.description}</p>
      </div>

      {/* Stats row */}
      <div className="flex items-center gap-5 text-xs">
        <div>
          <span className="text-muted-foreground/60">Pass </span>
          <span className={`font-semibold ${passingScoreColor(merged.passingScore)}`}>
            {Math.round(merged.passingScore * 100)}%
          </span>
        </div>
        <div>
          <span className="text-muted-foreground/60">Min </span>
          <span className="font-medium text-foreground/90">{merged.minTestCases}</span>
          <span className="text-muted-foreground/40"> cases</span>
        </div>
        <div>
          <span className="text-muted-foreground/60">{requiredCount}</span>
          <span className="text-muted-foreground/40"> req</span>
          {optionalCount > 0 && (
            <>
              <span className="text-foreground/20 mx-1">·</span>
              <span className="text-muted-foreground/40">{optionalCount} opt</span>
            </>
          )}
        </div>
      </div>

      {/* Assertions */}
      <div className="space-y-1.5 flex-1">
        {merged.assertions.map((a, i) => (
          <AssertionRow key={i} template={a} />
        ))}
      </div>

      {/* Suggested labels toggle */}
      <button
        type="button"
        onClick={() => setShowLabels((v) => !v)}
        className="flex items-center gap-1.5 text-xs text-muted-foreground/60 hover:text-foreground transition-colors"
      >
        <BookOpen className="size-3 shrink-0" />
        <span>{standard.suggestedTestLabels.length} suggested test labels</span>
        <ChevronDown
          className={`size-3 transition-transform duration-200 ${showLabels ? "rotate-180" : ""}`}
        />
      </button>

      {showLabels && (
        <ul className="space-y-1.5 border-t border-border pt-3">
          {standard.suggestedTestLabels.map((label, i) => (
            <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground/60">
              <span className="text-foreground/20 mt-px shrink-0">·</span>
              {label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function EvalStandardsPage() {
  const categories = Object.values(CATEGORY_EVAL_STANDARDS);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex h-[52px] shrink-0 items-center gap-3 border-b border-border px-3">
          <Link href="/" className="text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="size-4" />
          </Link>
          <div className="flex items-center gap-2 text-sm">
            <ShieldCheck className="size-4 text-muted-foreground" />
            <span className="font-medium">Eval Standards</span>
          </div>
          <span className="text-xs text-muted-foreground/40 ml-auto">
            {categories.length} categories · 2026 industry standards
          </span>
      </div>

      <main className="flex-1 overflow-y-auto px-6 py-8 space-y-10">

        {/* Intro */}
        <div className="max-w-2xl">
          <h1 className="mb-2 text-base font-medium tracking-tight">Eval Standards</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Platform-wide quality gates for AI agents, organized by category. Based on
            RAGAS, DeepEval, Braintrust, and Anthropic engineering guidelines (2026).
            Global assertions apply unconditionally to every agent; category standards
            layer on domain-specific thresholds on top.
          </p>
        </div>

        {/* Layer legend */}
        <section className="rounded-lg border border-border bg-card/60 p-5">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-4">
            Evaluation layers
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {([1, 2, 3] as const).map((l) => {
              const cfg = LAYER_CONFIG[l];
              return (
                <div key={l} className="flex items-start gap-3">
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded mt-0.5 shrink-0 ${cfg.badge}`}>
                    {cfg.label}
                  </span>
                  <div>
                    <p className="text-sm font-medium text-foreground/90">{cfg.name}</p>
                    <p className="text-xs text-muted-foreground/60 mt-0.5">
                      {l === 1 && "Free, instant — contains, regex, json_valid, latency. Zero AI cost."}
                      {l === 2 && "Embedding cosine similarity. ~$0.001/eval. Requires OpenAI API key."}
                      {l === 3 && "LLM-as-Judge: rubric, faithfulness, relevance. ~$0.01/eval (DeepSeek)."}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Global assertions */}
        <section>
          <div className="flex items-baseline gap-3 mb-4">
            <h2 className="text-sm font-semibold text-foreground">Global Assertions</h2>
            <span className="text-xs text-muted-foreground/60">
              Applied to every agent unconditionally — universal quality gates
            </span>
          </div>
          <div className="rounded-lg border border-border bg-card/60 p-5 space-y-2">
            {GLOBAL_EVAL_ASSERTIONS.map((g, i) => (
              <AssertionRow key={i} template={g} />
            ))}
          </div>
        </section>

        {/* Category standards grid */}
        <section>
          <div className="flex items-baseline gap-3 mb-5">
            <h2 className="text-sm font-semibold text-foreground">Category Standards</h2>
            <span className="text-xs text-muted-foreground/60">
              Merged with global assertions — {categories.length} categories
            </span>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {categories.map((cat) => (
              <CategoryCard key={cat.category} standard={cat} />
            ))}
          </div>
        </section>

        {/* Footer note */}
        <p className="text-xs text-foreground/20 pb-6">
          Standards are version-controlled TypeScript constants in{" "}
          <code className="font-mono">src/lib/evals/standards.ts</code>.
          Thresholds are calibrated using the 10th-percentile-of-human-approvals approach.
          API: <code className="font-mono">GET /api/evals/standards</code> ·{" "}
          <code className="font-mono">GET /api/evals/standards/[category]</code>
        </p>
      </main>
    </div>
  );
}
