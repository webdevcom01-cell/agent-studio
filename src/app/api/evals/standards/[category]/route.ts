/**
 * GET /api/evals/standards/[category]
 *
 * Returns the merged eval standard for a single agent category
 * (global assertions + category-specific assertions combined).
 *
 * Returns 200 with DEFAULT_EVAL_STANDARD for unknown categories —
 * never 404, so callers can always safely destructure the response.
 *
 * Response:
 *   { success: true, data: EvalCategoryStandard }
 */

import { type NextRequest, NextResponse } from "next/server";
import { getCategoryStandard } from "@/lib/evals/standards";

interface RouteParams {
  params: Promise<{ category: string }>;
}

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  const { category } = await params;

  const standard = getCategoryStandard(category);

  return NextResponse.json({
    success: true,
    data: standard,
  });
}
