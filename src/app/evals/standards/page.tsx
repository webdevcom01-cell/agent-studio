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
    bg: "bg-zinc-800/60",
    border: "border-zinc-700/50",
    text: "text-zinc-300",
    badge: "bg-zinc-700 text-zinc-300",
    label: "L1",
    name: "Deterministic",
  },
  2: {
    bg: "bg-blue-950/40",
    border: "border-blue-800/40",
    text: "text-blue-300",
    badge: "bg-blue-900/60 text-blue-300",
    label: "L2",
    name: "Semantic",
  },
  3: {
    bg: "bg-violet-950/40",
    border: "border-violet-800/40",
    text: "text-violet-300",
    badge: "bg-violet-900/60 text-violet-300",
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
  if (score >= 0.85) return "text-emerald-400";
  if (score >= 0.75) return "text-amber-400";
  return "text-orange-400";
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
            <span className="flex items-center gap-0.5 text-[10px] text-zinc-400 font-medium uppercase tracking-wide">
              <CheckCircle2 className="size-3 text-emerald-500/80" />
              required
            </span>
          ) : (
            <span className="flex items-center gap-0.5 text-[10px] text-zinc-600 uppercase tracking-wide">
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
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5 space-y-4 flex flex-col">
      {/* Header */}
      <div>
        <div className="flex items-center justify-between gap-2 mb-1">
          <h3 className="text-sm font-semibold text-white">{standard.displayName}</h3>
          <span className="text-[10px] font-mono text-zinc-600 shrink-0 select-none">
            {standard.category}
          </span>
        </div>
        <p className="text-xs text-zinc-500 leading-relaxed">{standard.description}</p>
      </div>

      {/* Stats row */}
      <div className="flex items-center gap-5 text-xs">
        <div>
          <span className="text-zinc-500">Pass </span>
          <span className={`font-semibold ${passingScoreColor(merged.passingScore)}`}>
            {Math.round(merged.passingScore * 100)}%
          </span>
        </div>
        <div>
          <span className="text-zinc-500">Min </span>
          <span className="font-medium text-zinc-200">{merged.minTestCases}</span>
          <span className="text-zinc-600"> cases</span>
        </div>
        <div>
          <span className="text-zinc-500">{requiredCount}</span>
          <span className="text-zinc-600"> req</span>
          {optionalCount > 0 && (
            <>
              <span className="text-zinc-700 mx-1">·</span>
              <span className="text-zinc-600">{optionalCount} opt</span>
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
        className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
      >
        <BookOpen className="size-3 shrink-0" />
        <span>{standard.suggestedTestLabels.length} suggested test labels</span>
        <ChevronDown
          className={`size-3 transition-transform duration-200 ${showLabels ? "rotate-180" : ""}`}
        />
      </button>

      {showLabels && (
        <ul className="space-y-1.5 border-t border-zinc-800 pt-3">
          {standard.suggestedTestLabels.map((label, i) => (
            <li key={i} className="flex items-start gap-2 text-xs text-zinc-500">
              <span className="text-zinc-700 mt-px shrink-0">·</span>
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
    <div className="min-h-screen bg-zinc-950 text-white">
      {/* Top bar */}
      <div className="border-b border-zinc-800 bg-zinc-900/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center gap-3">
          <Link href="/" className="text-zinc-400 hover:text-white transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="flex items-center gap-2 text-sm">
            <ShieldCheck className="w-4 h-4 text-violet-400" />
            <span className="font-medium">Eval Standards</span>
          </div>
          <span className="text-xs text-zinc-600 ml-auto">
            {categories.length} categories · 2026 industry standards
          </span>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 py-10 space-y-12">

        {/* Intro */}
        <div className="max-w-2xl">
          <h1 className="text-2xl font-light tracking-tight mb-2">Eval Standards</h1>
          <p className="text-sm text-zinc-400 leading-relaxed">
            Platform-wide quality gates for AI agents, organized by category. Based on
            RAGAS, DeepEval, Braintrust, and Anthropic engineering guidelines (2026).
            Global assertions apply unconditionally to every agent; category standards
            layer on domain-specific thresholds on top.
          </p>
        </div>

        {/* Layer legend */}
        <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
          <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-widest mb-4">
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
                    <p className="text-sm font-medium text-zinc-200">{cfg.name}</p>
                    <p className="text-xs text-zinc-500 mt-0.5">
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
            <h2 className="text-sm font-semibold text-white">Global Assertions</h2>
            <span className="text-xs text-zinc-500">
              Applied to every agent unconditionally — universal quality gates
            </span>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 space-y-2">
            {GLOBAL_EVAL_ASSERTIONS.map((g, i) => (
              <AssertionRow key={i} template={g} />
            ))}
          </div>
        </section>

        {/* Category standards grid */}
        <section>
          <div className="flex items-baseline gap-3 mb-5">
            <h2 className="text-sm font-semibold text-white">Category Standards</h2>
            <span className="text-xs text-zinc-500">
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
        <p className="text-xs text-zinc-700 pb-6">
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
