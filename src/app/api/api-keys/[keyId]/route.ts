/**
 * PATCH  /api/api-keys/[keyId]  — rename key or update scopes
 * DELETE /api/api-keys/[keyId]  — revoke key (soft delete)
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, isAuthError } from "@/lib/api/auth-guard";
import { API_KEY_SCOPES } from "@/lib/api/api-key";
import { writeAuditLog } from "@/lib/security/audit";
import { logger } from "@/lib/logger";

interface RouteParams {
  params: Promise<{ keyId: string }>;
}

const patchSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  scopes: z.array(z.enum(API_KEY_SCOPES)).min(1).optional(),
});

// ── Ownership helper ─────────────────────────────────────────────────────────

async function getOwnedKey(keyId: string, userId: string) {
  return prisma.apiKey.findFirst({
    where: { id: keyId, userId, revokedAt: null },
    select: { id: true, name: true, scopes: true },
  });
}

// ── PATCH — update name / scopes ─────────────────────────────────────────────

export async function PATCH(
  req: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  try {
    const { keyId } = await params;
    const authResult = await requireAuth(req);
    if (isAuthError(authResult)) return authResult;

    const key = await getOwnedKey(keyId, authResult.userId);
    if (!key) {
      return NextResponse.json(
        { success: false, error: "API key not found" },
        { status: 404 },
      );
    }

    const body = await req.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.message },
        { status: 422 },
      );
    }

    const updated = await prisma.apiKey.update({
      where: { id: keyId },
      data: {
        ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
        ...(parsed.data.scopes !== undefined ? { scopes: parsed.data.scopes } : {}),
      },
      select: { id: true, keyPrefix: true, name: true, scopes: true, expiresAt: true, updatedAt: true },
    });

    writeAuditLog({
      userId: authResult.userId,
      action: "UPDATE",
      resourceType: "ApiKey",
      resourceId: keyId,
      before: { name: key.name, scopes: key.scopes },
      after: { name: updated.name, scopes: updated.scopes },
    }).catch(() => {});

    return NextResponse.json({ success: true, data: updated });
  } catch (err) {
    logger.error("Failed to update API key", err, {});
    return NextResponse.json(
      { success: false, error: "Failed to update API key" },
      { status: 500 },
    );
  }
}

// ── DELETE — revoke key ──────────────────────────────────────────────────────

export async function DELETE(
  req: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  try {
    const { keyId } = await params;
    const authResult = await requireAuth(req);
    if (isAuthError(authResult)) return authResult;

    const key = await getOwnedKey(keyId, authResult.userId);
    if (!key) {
      return NextResponse.json(
        { success: false, error: "API key not found" },
        { status: 404 },
      );
    }

    await prisma.apiKey.update({
      where: { id: keyId },
      data: { revokedAt: new Date() },
    });

    writeAuditLog({
      userId: authResult.userId,
      action: "DELETE",
      resourceType: "ApiKey",
      resourceId: keyId,
      before: { name: key.name },
    }).catch(() => {});

    logger.info("API key revoked", { userId: authResult.userId, keyId });

    return NextResponse.json({ success: true, data: { revoked: true } });
  } catch (err) {
    logger.error("Failed to revoke API key", err, {});
    return NextResponse.json(
      { success: false, error: "Failed to revoke API key" },
      { status: 500 },
    );
  }
}
