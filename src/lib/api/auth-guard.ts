/**
 * Auth Guards — centralized authentication & authorization helpers
 *
 * Supports two authentication methods (in priority order):
 *   1. Session cookie  (NextAuth JWT)
 *   2. API key         (x-api-key header, as_live_… format)
 *
 * Usage in API routes:
 *   const auth = await requireAuth(req);
 *   if (isAuthError(auth)) return auth;
 *   const { userId, apiKeyId, scopes } = auth;
 */

import { NextRequest, NextResponse } from "next/server";
import { headers as nextHeaders } from "next/headers";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { validateApiKey, hasScope, type ApiKeyScope } from "@/lib/api/api-key";
import { withAdminBypass } from "@/lib/api/tenant-context";

const cuidSchema = z.string().cuid();

// ── Result types ─────────────────────────────────────────────────────────────

export interface AuthResult {
  userId: string;
  /** Set when authenticated via API key (null for session auth) */
  apiKeyId: string | null;
  /** Scopes granted by the API key (empty array for session auth = full access) */
  scopes: string[];
  /**
   * Tenant org for this request. Resolved centrally so every route gets a
   * consistent value regardless of auth method:
   *   - session auth : the session's currently-selected org (currentOrgId)
   *   - API-key auth : the user's earliest org membership (no cookie session)
   * Null only when the user belongs to no organization.
   */
  organizationId: string | null;
}

interface AgentOwnerResult extends AuthResult {
  agentId: string;
  organizationId: string | null;
}

interface OrgMemberResult extends AuthResult {
  organizationId: string;
  role: string;
}

// ── HTTP error helpers ───────────────────────────────────────────────────────

function unauthorized(message = "Unauthorized"): NextResponse {
  return NextResponse.json({ success: false, error: message }, { status: 401 });
}

function forbidden(message = "Forbidden"): NextResponse {
  return NextResponse.json({ success: false, error: message }, { status: 403 });
}

function agentNotFound(): NextResponse {
  return NextResponse.json({ success: false, error: "Agent not found" }, { status: 404 });
}

// ── Org resolution ───────────────────────────────────────────────────────────
// Resolve the tenant org for an API-key caller. API keys have no cookie session,
// and the ApiKey model is not yet org-scoped, so we attribute the request to the
// user's earliest org membership — for single-org users this is their
// auto-provisioned personal org. Uses an admin-bypass read because the RLS org
// context is not established yet at authentication time.
//
// TODO(multi-org): add an `organizationId` column to ApiKey so a key can be
// explicitly bound to one org, and prefer that here when present.
async function resolveApiKeyOrgId(userId: string): Promise<string | null> {
  const membership = await withAdminBypass((db) =>
    db.organizationMember.findFirst({
      where: { userId },
      select: { organizationId: true },
      orderBy: { joinedAt: "asc" },
    }),
  );
  return membership?.organizationId ?? null;
}

// ── Core: requireAuth ────────────────────────────────────────────────────────
// Accepts an optional NextRequest to check the x-api-key header.
// Falls back to session cookie when no API key provided.
//
// Pass requiredScope to enforce API key scope. Scope check is skipped for
// session auth and for API keys created without explicit scopes (full access).

export async function requireAuth(
  req?: NextRequest,
  requiredScope?: ApiKeyScope,
): Promise<AuthResult | NextResponse> {
  // 1️⃣  Try API key from x-api-key header.
  //     Prefer the explicitly passed NextRequest; fall back to Next.js
  //     server-side headers() so callers don't need to pass req manually.
  const headerSource = req ? req.headers : await nextHeaders();
  const rawApiKey = headerSource.get("x-api-key") ?? null;
  if (rawApiKey) {
    const keyResult = await validateApiKey(rawApiKey);
    if (!keyResult) {
      return unauthorized("Invalid or expired API key");
    }
    if (requiredScope && keyResult.scopes.length > 0) {
      if (!hasScope(keyResult.scopes, requiredScope)) {
        return forbidden(`API key missing required scope: ${requiredScope}`);
      }
    }
    const authResult: AuthResult = {
      userId: keyResult.userId,
      apiKeyId: keyResult.apiKeyId,
      scopes: keyResult.scopes,
      organizationId: await resolveApiKeyOrgId(keyResult.userId),
    };
    return authResult;
  }

  // 2️⃣  Fall back to session cookie (no scope restrictions)
  const session = await auth();
  if (!session?.user?.id) {
    return unauthorized();
  }

  return {
    userId: session.user.id,
    apiKeyId: null,
    scopes: [],
    organizationId: session.user.currentOrgId ?? null,
  };
}

// ── checkScope ───────────────────────────────────────────────────────────────
// Use after requireAgentOwner/requireOrgMember when per-method scope differs.
// Returns a 403 NextResponse if the API key lacks the scope, null if OK.

export function checkScope(
  authResult: AuthResult,
  required: ApiKeyScope,
): NextResponse | null {
  if (authResult.apiKeyId === null) return null;
  if (authResult.scopes.length === 0) return null;
  if (hasScope(authResult.scopes, required)) return null;
  return forbidden(`API key missing required scope: ${required}`);
}

// ── requireAgentOwner ────────────────────────────────────────────────────────
// Multi-tenancy aware: checks userId OR org membership.

export async function requireAgentOwner(
  agentId: string,
  req?: NextRequest,
): Promise<AgentOwnerResult | NextResponse> {
  const authResult = await requireAuth(req);
  if (authResult instanceof NextResponse) return authResult;

  if (!cuidSchema.safeParse(agentId).success) {
    return agentNotFound();
  }

  const agent = await withAdminBypass((db) =>
    db.agent.findUnique({
      where: { id: agentId },
      select: { userId: true, organizationId: true },
    }),
  );

  if (!agent) {
    return agentNotFound();
  }

  const { userId } = authResult;

  // Case 1: agent owned directly by this user
  if (agent.userId === userId) {
    return { ...authResult, agentId, organizationId: agent.organizationId ?? null };
  }

  // Case 2: agent owned by an organization of which this user is a member
  if (agent.organizationId) {
    const membership = await withAdminBypass((db) =>
      db.organizationMember.findUnique({
        where: {
          userId_organizationId: {
            userId,
            organizationId: agent.organizationId as string,
          },
        },
        select: { role: true },
      }),
    );

    if (membership) {
      return { ...authResult, agentId, organizationId: agent.organizationId ?? null };
    }
  }

  // Case 3: unowned agent (userId null, no org) — accessible to any authenticated user
  if (!agent.userId && !agent.organizationId) {
    return { ...authResult, agentId, organizationId: agent.organizationId ?? null };
  }

  return forbidden();
}

// ── Organization-level guards ────────────────────────────────────────────────

export async function requireOrgMember(
  orgId: string,
  req?: NextRequest,
): Promise<OrgMemberResult | NextResponse> {
  const authResult = await requireAuth(req);
  if (authResult instanceof NextResponse) return authResult;

  const member = await withAdminBypass((db) =>
    db.organizationMember.findUnique({
      where: {
        userId_organizationId: {
          userId: authResult.userId,
          organizationId: orgId,
        },
      },
      select: { role: true },
    }),
  );

  if (!member) return forbidden();

  return { ...authResult, organizationId: orgId, role: member.role };
}

export async function requireOrgAdmin(
  orgId: string,
  req?: NextRequest,
): Promise<OrgMemberResult | NextResponse> {
  const result = await requireOrgMember(orgId, req);
  if (result instanceof NextResponse) return result;

  if (result.role !== "ADMIN" && result.role !== "OWNER") {
    return forbidden("Admin or Owner role required");
  }

  return result;
}

export async function requireOrgOwner(
  orgId: string,
  req?: NextRequest,
): Promise<OrgMemberResult | NextResponse> {
  const result = await requireOrgMember(orgId, req);
  if (result instanceof NextResponse) return result;

  if (result.role !== "OWNER") {
    return forbidden("Owner role required");
  }

  return result;
}

// ── requireAdmin ─────────────────────────────────────────────────────────────
// Requires authentication AND that the userId appears in the ADMIN_USER_IDS
// environment variable (comma-separated list).
// In production, ADMIN_USER_IDS must be set — returns 503 if missing.
// In development, falls back to allowing all authenticated users.

export async function requireAdmin(
  req?: NextRequest,
): Promise<AuthResult | NextResponse> {
  const authResult = await requireAuth(req);
  if (authResult instanceof NextResponse) return authResult;

  const rawIds = process.env.ADMIN_USER_IDS;
  if (!rawIds) {
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json(
        { success: false, error: "Admin access not configured" },
        { status: 503 },
      );
    }
    return authResult;
  }

  const adminIds = rawIds
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);

  if (!adminIds.includes(authResult.userId)) {
    return forbidden("Admin access required");
  }

  return authResult;
}

// ── requireCronSecret ────────────────────────────────────────────────────────
// Returns null on success, NextResponse on failure.
// In production, CRON_SECRET must be set and matched.
// In development, allows all requests when CRON_SECRET is unset.

export function requireCronSecret(req: NextRequest): NextResponse | null {
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json(
        { success: false, error: "Cron endpoint is disabled: CRON_SECRET not configured" },
        { status: 503 },
      );
    }
    return null;
  }

  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${secret}`) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  return null;
}

// ── Type guard ───────────────────────────────────────────────────────────────

export function isAuthError(
  result: AuthResult | AgentOwnerResult | OrgMemberResult | NextResponse,
): result is NextResponse {
  return result instanceof NextResponse;
}
