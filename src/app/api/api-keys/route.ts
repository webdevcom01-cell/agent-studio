/**
 * GET  /api/api-keys  — list caller's API keys (hashes + metadata, no raw keys)
 * POST /api/api-keys  — create new key (returns raw key ONCE)
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, isAuthError } from "@/lib/api/auth-guard";
import { generateApiKey, API_KEY_SCOPES } from "@/lib/api/api-key";
import { writeAuditLog } from "@/lib/security/audit";
import { logger } from "@/lib/logger";

// ── Zod schemas ───────────────────────────────────────────────────────────────

const createKeySchema = z.object({
  name: z.string().min(1).max(100),
  scopes: z
    .array(z.enum(API_KEY_SCOPES))
    .min(1, "At least one scope is required")
    .default(["agents:read"]),
  expiresInDays: z
    .number()
    .int()
    .min(1)
    .max(365)
    .optional(),
});

// ── GET — list keys ──────────────────────────────────────────────────────────

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const authResult = await requireAuth(req);
    if (isAuthError(authResult)) return authResult;

    const keys = await prisma.apiKey.findMany({
      where: {
        userId: authResult.userId,
        revokedAt: null,
      },
      select: {
        id: true,
        keyPrefix: true,
        name: true,
        scopes: true,
        expiresAt: true,
        lastUsedAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ success: true, data: keys });
  } catch (err) {
    logger.error("Failed to list API keys", err, {});
    return NextResponse.json(
      { success: false, error: "Failed to list API keys" },
      { status: 500 },
    );
  }
}

// ── POST — create key ────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const authResult = await requireAuth(req);
    if (isAuthError(authResult)) return authResult;

    const body = await req.json();
    const parsed = createKeySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.message },
        { status: 422 },
      );
    }

    const { name, scopes, expiresInDays } = parsed.data;

    // Enforce max 20 active keys per user
    const activeCount = await prisma.apiKey.count({
      where: { userId: authResult.userId, revokedAt: null },
    });
    if (activeCount >= 20) {
      return NextResponse.json(
        { success: false, error: "Maximum of 20 active API keys allowed" },
        { status: 429 },
      );
    }

    const { key, keyHash, keyPrefix } = generateApiKey();

    const expiresAt = expiresInDays
      ? new Date(Date.now() + expiresInDays * 86_400_000)
      : null;

    const record = await prisma.apiKey.create({
      data: {
        keyHash,
        keyPrefix,
        name,
        userId: authResult.userId,
        scopes,
        expiresAt,
      },
      select: { id: true, keyPrefix: true, name: true, scopes: true, expiresAt: true, createdAt: true },
    });

    writeAuditLog({
      userId: authResult.userId,
      action: "CREATE",
      resourceType: "ApiKey",
      resourceId: record.id,
      after: { name, scopes, expiresAt },
    }).catch(() => {});

    logger.info("API key created", { userId: authResult.userId, keyId: record.id, scopes });

    // Return the raw key ONCE — it is never stored or retrievable again
    return NextResponse.json(
      { success: true, data: { ...record, key } },
      { status: 201 },
    );
  } catch (err) {
    logger.error("Failed to create API key", err, {});
    return NextResponse.json(
      { success: false, error: "Failed to create API key" },
      { status: 500 },
    );
  }
}
