/**
 * One-time migration: encrypt all plaintext webhook secrets.
 *
 * Run after setting WEBHOOK_ENCRYPTION_KEY in the environment:
 *   WEBHOOK_ENCRYPTION_KEY=<base64url-32-bytes> node scripts/encrypt-webhook-secrets.mjs
 *
 * Safe to run multiple times — skips already-encrypted rows (secretEncrypted = true).
 */

import { createCipheriv, randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function getKey() {
  const raw = process.env.WEBHOOK_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error("WEBHOOK_ENCRYPTION_KEY is not set");
  }
  const key = Buffer.from(raw, "base64url");
  if (key.length !== 32) {
    throw new Error(`WEBHOOK_ENCRYPTION_KEY must be 32 bytes (got ${key.length})`);
  }
  return key;
}

function encrypt(plaintext, key) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, encrypted, authTag]).toString("base64url");
}

async function main() {
  const key = getKey();

  const plaintext = await prisma.webhookConfig.findMany({
    where: { secretEncrypted: false },
    select: { id: true, secret: true },
  });

  if (plaintext.length === 0) {
    console.warn("No plaintext webhook secrets found. All secrets are already encrypted.");
    return;
  }

  console.warn(`Encrypting ${plaintext.length} webhook secret(s)...`);

  let succeeded = 0;
  let failed = 0;

  for (const webhook of plaintext) {
    try {
      const encryptedSecret = encrypt(webhook.secret, key);
      await prisma.webhookConfig.update({
        where: { id: webhook.id },
        data: { secret: encryptedSecret, secretEncrypted: true },
      });
      succeeded++;
    } catch (err) {
      console.error(`Failed to encrypt webhook ${webhook.id}:`, err.message);
      failed++;
    }
  }

  console.warn(`Done. Encrypted: ${succeeded}, Failed: ${failed}`);

  if (failed > 0) {
    process.exit(1);
  }
}

main()
  .catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
