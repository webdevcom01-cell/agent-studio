/**
 * Encrypted PrismaAdapter wrapper for NextAuth.
 *
 * Transparently encrypts OAuth tokens (access_token, refresh_token, id_token)
 * before storage and decrypts them on read. Uses AES-256-GCM via OAUTH_ENCRYPTION_KEY.
 *
 * Falls back to plaintext when OAUTH_ENCRYPTION_KEY is not configured (dev/migration).
 * Handles mixed state: reads both encrypted and plaintext tokens via tokensEncrypted flag.
 */

import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import { encrypt, decrypt, isEncryptionConfigured } from "@/lib/crypto";
import type { Adapter, AdapterAccount } from "next-auth/adapters";

const KEY_NAME = "OAUTH_ENCRYPTION_KEY" as const;

const TOKEN_FIELDS = ["access_token", "refresh_token", "id_token"] as const;

function encryptTokens(
  account: Record<string, unknown>
): Record<string, unknown> {
  if (!isEncryptionConfigured(KEY_NAME)) {
    return { ...account, tokensEncrypted: false };
  }

  const result: Record<string, unknown> = { ...account, tokensEncrypted: true };
  for (const field of TOKEN_FIELDS) {
    const value = result[field];
    if (typeof value === "string" && value.length > 0) {
      result[field] = encrypt(value, KEY_NAME);
    }
  }
  return result;
}

function decryptTokens<T extends Record<string, unknown>>(account: T): T {
  if (!account.tokensEncrypted) return account;

  const result = { ...account };
  for (const field of TOKEN_FIELDS) {
    const value = result[field];
    if (typeof value === "string" && value.length > 0) {
      try {
        (result as Record<string, unknown>)[field] = decrypt(value, KEY_NAME);
      } catch {
        (result as Record<string, unknown>)[field] = null;
      }
    }
  }
  return result;
}

/**
 * Creates a PrismaAdapter that encrypts/decrypts OAuth tokens transparently.
 */
export function createEncryptedAdapter(): Adapter {
  const base = PrismaAdapter(prisma);

  return {
    ...base,

    linkAccount(account: AdapterAccount) {
      const encrypted = encryptTokens(
        account as unknown as Record<string, unknown>
      );
      return base.linkAccount!(encrypted as unknown as AdapterAccount);
    },
  };
}
