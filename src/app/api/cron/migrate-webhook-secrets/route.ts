/**
 * POST /api/cron/migrate-webhook-secrets
 *
 * One-time migration: encrypts all plaintext webhook secrets in the database.
 * Processes in batches to avoid long-running transactions.
 * Idempotent — safe to run multiple times (skips already-encrypted secrets).
 * Protected by CRON_SECRET header.
 */

import { NextRequest, NextResponse } from "next/server";
import { withAdminBypass } from "@/lib/api/tenant-context";
import { logger } from "@/lib/logger";
import { isEncryptionConfigured } from "@/lib/crypto";
import { encryptWebhookSecret } from "@/lib/webhooks/verify";
import { requireCronSecret } from "@/lib/api/auth-guard";

const BATCH_SIZE = 50;

export async function POST(req: NextRequest): Promise<NextResponse> {
  const authError = requireCronSecret(req);
  if (authError) return authError;

  if (!isEncryptionConfigured()) {
    return NextResponse.json(
      { success: false, error: "WEBHOOK_ENCRYPTION_KEY is not configured" },
      { status: 400 }
    );
  }

  try {
    let totalMigrated = 0;
    let totalSkipped = 0;
    let hasMore = true;

    while (hasMore) {
      const batch = await withAdminBypass((db) => db.webhookConfig.findMany({
        where: { secretEncrypted: false },
        select: { id: true, secret: true },
        take: BATCH_SIZE,
      }));

      if (batch.length === 0) {
        hasMore = false;
        break;
      }

      for (const webhook of batch) {
        const { encrypted, isEncrypted } = encryptWebhookSecret(webhook.secret);
        if (!isEncrypted) {
          totalSkipped++;
          continue;
        }

        await withAdminBypass((db) => db.webhookConfig.update({
          where: { id: webhook.id },
          data: { secret: encrypted, secretEncrypted: true },
        }));
        totalMigrated++;
      }

      if (batch.length < BATCH_SIZE) {
        hasMore = false;
      }
    }

    logger.info("Webhook secret migration complete", {
      migrated: totalMigrated,
      skipped: totalSkipped,
    });

    return NextResponse.json({
      success: true,
      data: { migrated: totalMigrated, skipped: totalSkipped },
    });
  } catch (error) {
    logger.error("Webhook secret migration failed", error, {});
    return NextResponse.json(
      { success: false, error: "Migration failed" },
      { status: 500 }
    );
  }
}
