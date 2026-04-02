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
import { prisma } from "@/lib/prisma";
import { validateApiKey } from "@/lib/api/api-key";

const cuidSchema = z.string().cuid();

// ── Result types ─────────────────────────────────────────────────────────────

export interface AuthResult {
  userId: string;
  /** Set when authenticated via API key (null for session auth) */
  apiKeyId: string | null;
  /** Scopes granted by the API key (empty array for session auth = full access) */
  scopes: string[];
}

interface AgentOwnerResult extends AuthResult {
  agentId: string;
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

// ── Core: requireAuth ────────────────────────────────────────────────────────
// Accepts an optional NextRequest to check the x-api-key header.
// Falls back to session cookie when no API key provided.

export async function requireAuth(
  req?: NextRequest,
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
    return {
      userId: keyResult.userId,
      apiKeyId: keyResult.apiKeyId,
      scopes: keyResult.scopes,
    };
  }

  // 2️⃣  Fall back to session cookie
  const session = await auth();
  if (!session?.user?.id) {
    return unauthorized();
  }

  return { userId: session.user.id, apiKeyId: null, scopes: [] };
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

  const agent = await prisma.agent.findUnique({
    where: { id: agentId },
    select: { userId: true, organizationId: true },
  });

  if (!agent) {
    return agentNotFound();
  }

  const { userId } = authResult;

  // Case 1: agent owned directly by this user
  if (agent.userId === userId) {
    return { ...authResult, agentId };
  }

  // Case 2: agent owned by an organization of which this user is a member
  if (agent.organizationId) {
    const membership = await prisma.organizationMember.findUnique({
      where: {
        userId_organizationId: {
          userId,
          organizationId: agent.organizationId,
        },
      },
      select: { role: true },
    });

    if (membership) {
      return { ...authResult, agentId };
    }
  }

  // Case 3: unowned agent (userId null, no org) — accessible to any authenticated user
  if (!agent.userId && !agent.organizationId) {
    return { ...authResult, agentId };
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

  const member = await prisma.organizationMember.findUnique({
    where: {
      userId_organizationId: {
        userId: authResult.userId,
        organizationId: orgId,
      },
    },
    select: { role: true },
  });

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

// ── Type guard ───────────────────────────────────────────────────────────────

export function isAuthError(
  result: AuthResult | AgentOwnerResult | OrgMemberResult | NextResponse,
): result is NextResponse {
  return result instanceof NextResponse;
}
