/**
 * POST /api/cron/migrate-oauth-tokens
 *
 * One-time migration: encrypts all plaintext OAuth tokens in the Account table.
 * Processes in batches. Idempotent — skips already-encrypted accounts.
 * Protected by CRON_SECRET header.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { getEnv } from "@/lib/env";
import { encrypt, isEncryptionConfigured } from "@/lib/crypto";

const BATCH_SIZE = 50;
const KEY_NAME = "OAUTH_ENCRYPTION_KEY" as const;
const TOKEN_FIELDS = ["access_token", "refresh_token", "id_token"] as const;

function verifyCronSecret(req: NextRequest): boolean {
  const env = getEnv();
  const cronSecret = env.CRON_SECRET;
  if (!cronSecret) return true;

  const authHeader = req.headers.get("authorization") ?? "";
  return authHeader === `Bearer ${cronSecret}`;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!verifyCronSecret(req)) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  if (!isEncryptionConfigured(KEY_NAME)) {
    return NextResponse.json(
      { success: false, error: "OAUTH_ENCRYPTION_KEY is not configured" },
      { status: 400 }
    );
  }

  try {
    let totalMigrated = 0;
    let hasMore = true;

    while (hasMore) {
      const batch = await prisma.account.findMany({
        where: { tokensEncrypted: false },
        select: {
          id: true,
          access_token: true,
          refresh_token: true,
          id_token: true,
        },
        take: BATCH_SIZE,
      });

      if (batch.length === 0) {
        hasMore = false;
        break;
      }

      for (const account of batch) {
        const data: Record<string, string | boolean> = { tokensEncrypted: true };

        for (const field of TOKEN_FIELDS) {
          const value = account[field];
          if (typeof value === "string" && value.length > 0) {
            data[field] = encrypt(value, KEY_NAME);
          }
        }

        await prisma.account.update({
          where: { id: account.id },
          data,
        });
        totalMigrated++;
      }

      if (batch.length < BATCH_SIZE) {
        hasMore = false;
      }
    }

    logger.info("OAuth token migration complete", { migrated: totalMigrated });

    return NextResponse.json({
      success: true,
      data: { migrated: totalMigrated },
    });
  } catch (error) {
    logger.error("OAuth token migration failed", error, {});
    return NextResponse.json(
      { success: false, error: "Migration failed" },
      { status: 500 }
    );
  }
}
