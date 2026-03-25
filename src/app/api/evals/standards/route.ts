/**
 * GET /api/evals/standards
 *
 * Returns the full list of eval standards for all agent categories.
 * Public endpoint — used by the AI eval generator and the UI standards browser.
 *
 * Response:
 *   { success: true, data: EvalCategoryStandard[] }
 */

import { NextResponse } from "next/server";
import { getAllStandards, GLOBAL_EVAL_ASSERTIONS } from "@/lib/evals/standards";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    success: true,
    data: {
      /** Assertions applied to every agent regardless of category */
      globalAssertions: GLOBAL_EVAL_ASSERTIONS,
      /** Per-category standards (already include merged global assertions) */
      categories: getAllStandards(),
    },
  });
}
