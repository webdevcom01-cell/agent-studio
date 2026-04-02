import { NextResponse } from "next/server";
import { generateOpenApiSpec } from "@/lib/openapi/spec";

export const dynamic = "force-static";

/**
 * GET /api/openapi.json
 *
 * Returns the OpenAPI 3.1 specification as JSON.
 * Cached at the CDN edge via `force-static` — spec rebuilds on every deploy.
 *
 * Usage:
 *   curl https://your-app.railway.app/api/openapi.json
 *   npx @redocly/cli lint https://your-app.railway.app/api/openapi.json
 */
export function GET(): NextResponse {
  const spec = generateOpenApiSpec();
  return NextResponse.json(spec, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      // Cache for 1 hour at the edge; revalidates on new deploy automatically
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
