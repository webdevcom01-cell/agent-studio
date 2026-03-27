import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAgentOwner, isAuthError } from "@/lib/api/auth-guard";
import { logger } from "@/lib/logger";

interface RouteParams {
  params: Promise<{ agentId: string; suiteId: string; runId: string }>;
}

// ─── CSV helpers ──────────────────────────────────────────────────────────────

/** Escape a value for CSV: wrap in double quotes, escape internal double quotes. */
function csvCell(value: string | number | boolean | null | undefined): string {
  if (value == null) return "";
  const str = String(value);
  // Always quote — simplest safe approach, handles commas/newlines/quotes
  return `"${str.replace(/"/g, '""')}"`;
}

/** Build a single CSV row from an array of values. */
function csvRow(cells: Array<string | number | boolean | null | undefined>): string {
  return cells.map(csvCell).join(",");
}

const CSV_HEADERS = [
  "run_id",
  "run_date",
  "run_triggered_by",
  "run_score",
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
 * GET /api/agents/[agentId]/evals/[suiteId]/run/[runId]/export
 * Download a single eval run as a CSV file.
 * One row per assertion (N assertions × M test cases = N×M rows).
 */
export async function GET(
  _request: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse | Response> {
  try {
    const { agentId, suiteId, runId } = await params;
    const authResult = await requireAgentOwner(agentId);
    if (isAuthError(authResult)) return authResult;

    // Verify suite belongs to agent
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

    const run = await prisma.evalRun.findUnique({
      where: { id: runId, suiteId },
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

    if (!run) {
      return NextResponse.json(
        { success: false, error: "Eval run not found" },
        { status: 404 },
      );
    }

    // Build CSV rows — one row per assertion per test case
    const lines: string[] = [];
    lines.push(CSV_HEADERS.join(","));

    const runDate = run.createdAt.toISOString().split("T")[0] ?? "";
    const runScore = run.score != null ? (run.score * 100).toFixed(1) + "%" : "";

    for (const result of run.results) {
      const assertions = parseAssertionResults(result.assertions);

      if (assertions.length === 0) {
        // No assertions — emit one row for the case itself
        lines.push(
          csvRow([
            run.id,
            runDate,
            run.triggeredBy ?? "manual",
            runScore,
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

    const csv = lines.join("\r\n");

    // Safe filename: replace non-alphanumeric chars with dashes
    const safeName = suite.name.replace(/[^a-z0-9]/gi, "-").toLowerCase();
    const dateStr = runDate || "export";
    const filename = `eval-${safeName}-${dateStr}.csv`;

    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    logger.error("Failed to export eval run as CSV", err);
    return NextResponse.json(
      { success: false, error: "Failed to export eval run" },
      { status: 500 },
    );
  }
}
