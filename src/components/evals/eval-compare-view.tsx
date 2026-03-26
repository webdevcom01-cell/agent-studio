"use client";

import { CheckCircle2, XCircle, Minus, Trophy, Clock, TrendingUp, TrendingDown } from "lucide-react";
import type { CompareResult } from "@/app/api/agents/[agentId]/evals/[suiteId]/compare/route";

// ─── Re-export the type for consumers ─────────────────────────────────────────
export type { CompareResult };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function scorePct(score: number): string {
  return `${(score * 100).toFixed(0)}%`;
}

function scoreColor(score: number): string {
  if (score >= 0.8) return "text-emerald-400";
  if (score >= 0.5) return "text-yellow-400";
  return "text-red-400";
}

function diffBadge(diff: number, unit = ""): React.ReactNode {
  if (Math.abs(diff) < 0.001 && unit === "") return (
    <span className="text-xs text-zinc-500">=</span>
  );
  const positive = diff > 0;
  const Icon = positive ? TrendingUp : TrendingDown;
  const color = positive ? "text-emerald-400" : "text-red-400";
  const label = unit === "ms"
    ? `${Math.abs(diff)}ms`
    : `${(Math.abs(diff) * 100).toFixed(1)}%`;
  return (
    <span className={`flex items-center gap-0.5 text-xs font-mono ${color}`}>
      <Icon className="w-3 h-3" />
      {label}
    </span>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface EvalCompareViewProps {
  result: CompareResult;
}

export function EvalCompareView({ result }: EvalCompareViewProps) {
  const { runA, runB, labelA, labelB, delta } = result;

  const winnerLabel = delta.winner === "a" ? labelA : delta.winner === "b" ? labelB : null;
  const scoreA = runA.score;
  const scoreB = runB.score;

  return (
    <div className="space-y-4">

      {/* ── Summary bar ── */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-zinc-300">Comparison Summary</h3>
          {winnerLabel ? (
            <div className="flex items-center gap-1.5 text-amber-400 text-xs font-medium">
              <Trophy className="w-3.5 h-3.5" />
              {winnerLabel} wins
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-zinc-400 text-xs">
              <Minus className="w-3.5 h-3.5" />
              Tie
            </div>
          )}
        </div>

        {/* Score comparison */}
        <div className="grid grid-cols-3 gap-3 mb-3">
          {/* Version A */}
          <div className={`bg-zinc-800 rounded-md p-3 text-center ${delta.winner === "a" ? "ring-1 ring-emerald-500/50" : ""}`}>
            <p className="text-xs text-zinc-500 truncate mb-1">{labelA}</p>
            <p className={`text-2xl font-mono font-bold ${scoreColor(scoreA)}`}>
              {scorePct(scoreA)}
            </p>
            <p className="text-xs text-zinc-600 mt-1">
              {runA.passedCases}/{runA.totalCases} passed
            </p>
          </div>

          {/* Delta */}
          <div className="flex flex-col items-center justify-center gap-1">
            <span className="text-xs text-zinc-600">vs</span>
            {diffBadge(delta.scoreDiff)}
            <div className="flex items-center gap-1 text-xs text-zinc-600 mt-1">
              <Clock className="w-3 h-3" />
              {diffBadge(delta.latencyDiffMs, "ms")}
            </div>
          </div>

          {/* Version B */}
          <div className={`bg-zinc-800 rounded-md p-3 text-center ${delta.winner === "b" ? "ring-1 ring-emerald-500/50" : ""}`}>
            <p className="text-xs text-zinc-500 truncate mb-1">{labelB}</p>
            <p className={`text-2xl font-mono font-bold ${scoreColor(scoreB)}`}>
              {scorePct(scoreB)}
            </p>
            <p className="text-xs text-zinc-600 mt-1">
              {runB.passedCases}/{runB.totalCases} passed
            </p>
          </div>
        </div>

        {/* Win/Loss/Tie counts */}
        <div className="flex items-center justify-center gap-4 text-xs">
          <span className="text-emerald-400 font-medium">
            A wins: {delta.aWins}
          </span>
          <span className="text-zinc-600">|</span>
          <span className="text-zinc-400">Ties: {delta.ties}</span>
          <span className="text-zinc-600">|</span>
          <span className="text-blue-400 font-medium">
            B wins: {delta.bWins}
          </span>
        </div>
      </div>

      {/* ── Per-case table ── */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
        <div className="grid grid-cols-[1fr_1fr_80px_1fr_1fr] gap-0 text-xs font-medium text-zinc-500 bg-zinc-800/50 px-3 py-2 border-b border-zinc-800">
          <span>{labelA} output</span>
          <span className="text-center">Score A</span>
          <span className="text-center">Winner</span>
          <span className="text-center">Score B</span>
          <span>{labelB} output</span>
        </div>

        <div className="divide-y divide-zinc-800">
          {runA.results.map((caseA, idx) => {
            const caseB = runB.results[idx];
            const scoreA = caseA.score;
            const scoreB = caseB?.score ?? 0;
            const winner =
              scoreA > scoreB ? "a" : scoreB > scoreA ? "b" : "tie";

            return (
              <div key={caseA.testCaseId} className="px-3 py-2.5">
                {/* Test case label */}
                <div className="col-span-full mb-2">
                  <span className="text-xs font-medium text-zinc-400">
                    {idx + 1}. {caseA.label}
                  </span>
                </div>
                <div className="grid grid-cols-[1fr_80px_80px_80px_1fr] gap-2 items-start">
                  {/* Output A */}
                  <div className="bg-zinc-800/50 rounded p-2 min-h-[40px]">
                    {caseA.status === "ERROR" ? (
                      <span className="text-red-400 text-xs italic">Error: {caseA.errorMessage}</span>
                    ) : (
                      <p className="text-xs text-zinc-300 line-clamp-3 whitespace-pre-wrap">
                        {caseA.agentOutput ?? "—"}
                      </p>
                    )}
                  </div>

                  {/* Score A */}
                  <div className="flex flex-col items-center gap-1">
                    <span className={`text-sm font-mono font-bold ${scoreColor(scoreA)}`}>
                      {scorePct(scoreA)}
                    </span>
                    {caseA.status === "PASSED" ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <XCircle className="w-3.5 h-3.5 text-red-400" />
                    )}
                  </div>

                  {/* Winner indicator */}
                  <div className="flex items-center justify-center">
                    {winner === "a" && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 font-medium">A ▲</span>
                    )}
                    {winner === "b" && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-400 font-medium">B ▲</span>
                    )}
                    {winner === "tie" && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-zinc-700/50 text-zinc-500">—</span>
                    )}
                  </div>

                  {/* Score B */}
                  <div className="flex flex-col items-center gap-1">
                    <span className={`text-sm font-mono font-bold ${scoreColor(scoreB)}`}>
                      {scorePct(scoreB)}
                    </span>
                    {caseB?.status === "PASSED" ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <XCircle className="w-3.5 h-3.5 text-red-400" />
                    )}
                  </div>

                  {/* Output B */}
                  <div className="bg-zinc-800/50 rounded p-2 min-h-[40px]">
                    {caseB?.status === "ERROR" ? (
                      <span className="text-red-400 text-xs italic">Error: {caseB.errorMessage}</span>
                    ) : (
                      <p className="text-xs text-zinc-300 line-clamp-3 whitespace-pre-wrap">
                        {caseB?.agentOutput ?? "—"}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Footer links ── */}
      <div className="flex items-center gap-3 text-xs text-zinc-600">
        <span>Run A: <code className="font-mono text-zinc-500">{runA.runId}</code></span>
        <span>·</span>
        <span>Run B: <code className="font-mono text-zinc-500">{runB.runId}</code></span>
      </div>
    </div>
  );
}
