import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAgentOwner, isAuthError } from "@/lib/api/auth-guard";
import { logger } from "@/lib/logger";

interface RouteParams {
  params: Promise<{ agentId: string; suiteId: string }>;
}

// ─── CSV helpers ──────────────────────────────────────────────────────────────

function csvCell(value: string | number | boolean | null | undefined): string {
  if (value == null) return "";
  const str = String(value);
  return `"${str.replace(/"/g, '""')}"`;
}

function csvRow(cells: Array<string | number | boolean | null | undefined>): string {
  return cells.map(csvCell).join(",");
}

const CSV_HEADERS = [
  "run_id",
  "run_date",
  "run_triggered_by",
  "run_score",
  "run_passed",
  "run_failed",
  "run_total",
  "test_case_label",
  "test_case_input",
  "test_case_tags",
  "agent_output",
  "case_status",
  "case_score",
  "latency_ms",
  "assertion_type",
  "assertion_passed",
  "assertion_score",
  "assertion_message",
  "error_message",
] as const;

interface AssertionResult {
  type: string;
  passed: boolean;
  score: number;
  message: string;
}

function parseAssertionResults(raw: unknown): AssertionResult[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (item): item is AssertionResult =>
      typeof item === "object" &&
      item !== null &&
      typeof (item as Record<string, unknown>).type === "string",
  );
}

/**
 * GET /api/agents/[agentId]/evals/[suiteId]/export
 * Download all completed runs in a suite as a single CSV file.
 * Useful for trend analysis across multiple runs.
 * Query params: limit (default 50, max 100)
 */
export async function GET(
  request: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse | Response> {
  try {
    const { agentId, suiteId } = await params;
    const authResult = await requireAgentOwner(agentId);
    if (isAuthError(authResult)) return authResult;

    const suite = await prisma.evalSuite.findUnique({
      where: { id: suiteId, agentId },
      select: { id: true, name: true },
    });
    if (!suite) {
      return NextResponse.json(
        { success: false, error: "Eval suite not found" },
        { status: 404 },
      );
    }

    const url = new URL(request.url);
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 50), 100);

    const runs = await prisma.evalRun.findMany({
      where: { suiteId, status: "COMPLETED" },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        results: {
          orderBy: { createdAt: "asc" },
          include: {
            testCase: {
              select: {
                id: true,
                label: true,
                input: true,
                tags: true,
                order: true,
              },
            },
          },
        },
      },
    });

    const lines: string[] = [];
    lines.push(CSV_HEADERS.join(","));

    for (const run of runs) {
      const runDate = run.createdAt.toISOString().split("T")[0] ?? "";
      const runScore = run.score != null ? (run.score * 100).toFixed(1) + "%" : "";

      for (const result of run.results) {
        const assertions = parseAssertionResults(result.assertions);

        if (assertions.length === 0) {
          lines.push(
            csvRow([
              run.id,
              runDate,
              run.triggeredBy ?? "manual",
              runScore,
              run.passedCases,
              run.failedCases,
              run.totalCases,
              result.testCase.label,
              result.testCase.input,
              result.testCase.tags.join("; "),
              result.agentOutput ?? "",
              result.status,
              result.score != null ? (result.score * 100).toFixed(1) + "%" : "",
              result.latencyMs ?? "",
              "",
              "",
              "",
              "",
              result.errorMessage ?? "",
            ]),
          );
        } else {
          for (const assertion of assertions) {
            lines.push(
              csvRow([
                run.id,
                runDate,
                run.triggeredBy ?? "manual",
                runScore,
                run.passedCases,
                run.failedCases,
                run.totalCases,
                result.testCase.label,
                result.testCase.input,
                result.testCase.tags.join("; "),
                result.agentOutput ?? "",
                result.status,
                result.score != null ? (result.score * 100).toFixed(1) + "%" : "",
                result.latencyMs ?? "",
                assertion.type,
                assertion.passed ? "true" : "false",
                (assertion.score * 100).toFixed(1) + "%",
                assertion.message,
                result.errorMessage ?? "",
              ]),
            );
          }
        }
      }
    }

    const csv = lines.join("\r\n");
    const safeName = suite.name.replace(/[^a-z0-9]/gi, "-").toLowerCase();
    const today = new Date().toISOString().split("T")[0] ?? "export";
    const filename = `eval-${safeName}-all-runs-${today}.csv`;

    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    logger.error("Failed to export eval suite as CSV", err);
    return NextResponse.json(
      { success: false, error: "Failed to export eval suite" },
      { status: 500 },
    );
  }
}
