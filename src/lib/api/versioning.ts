/**
 * API Versioning — URL prefix pattern.
 *
 * Pattern: /api/v1/agents → current version
 * Legacy: /api/agents → redirects to /api/v1/agents
 *
 * Deprecation policy: 6 months warning before removing old version.
 */

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";

const CURRENT_VERSION = "v1";
const SUPPORTED_VERSIONS = new Set(["v1"]);

/**
 * Middleware helper: rewrite legacy /api/* paths to /api/v1/*.
 * Returns null if no rewrite needed (already versioned or non-API path).
 */
export function rewriteApiVersion(request: NextRequest): NextResponse | null {
  const { pathname } = request.nextUrl;

  // Only handle /api/ paths
  if (!pathname.startsWith("/api/")) return null;

  // Skip already versioned paths
  if (pathname.match(/^\/api\/v\d+\//)) return null;

  // Skip special paths that don't need versioning
  const skipPaths = ["/api/auth/", "/api/health", "/api/admin/"];
  if (skipPaths.some((p) => pathname.startsWith(p))) return null;

  // Rewrite /api/agents → /api/v1/agents (transparent, same handler)
  const versionedPath = pathname.replace("/api/", `/api/${CURRENT_VERSION}/`);

  // Add deprecation header on legacy paths
  const url = request.nextUrl.clone();
  url.pathname = versionedPath;

  const response = NextResponse.rewrite(url);
  response.headers.set(
    "Deprecation",
    "true",
  );
  response.headers.set(
    "Sunset",
    new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toUTCString(), // 6 months
  );
  response.headers.set(
    "Link",
    `<${versionedPath}>; rel="successor-version"`,
  );

  return response;
}

/**
 * Check if a version string is currently supported.
 */
export function isVersionSupported(version: string): boolean {
  return SUPPORTED_VERSIONS.has(version);
}

/**
 * Extract API version from pathname.
 * Returns null for unversioned paths.
 */
export function extractVersion(pathname: string): string | null {
  const match = pathname.match(/^\/api\/(v\d+)\//);
  return match?.[1] ?? null;
}

export { CURRENT_VERSION, SUPPORTED_VERSIONS };
