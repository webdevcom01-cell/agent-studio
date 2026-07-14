/**
 * F4-1: Encryption-at-rest for MCPServer.headers (may contain Bearer tokens).
 *
 * Storage format (encrypted): { "__enc": "<base64url AES-256-GCM blob>" }
 * Key: OAUTH_ENCRYPTION_KEY (same key class as OAuth tokens — headers carry
 * the same kind of secret; no new env var needed).
 *
 * Backward compatible: legacy rows store a plain JSON object of headers.
 * decryptMcpHeaders() detects the format and returns plaintext legacy rows
 * as-is, so existing MCP servers keep working without a backfill.
 */

import { encrypt, decrypt, isEncryptionConfigured } from "@/lib/crypto";
import { logger } from "@/lib/logger";

const KEY_NAME = "OAUTH_ENCRYPTION_KEY" as const;
const ENC_FIELD = "__enc" as const;

type EncryptedEnvelope = { [ENC_FIELD]: string };

function isEncryptedEnvelope(value: unknown): value is EncryptedEnvelope {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Record<string, unknown>)[ENC_FIELD] === "string"
  );
}

/**
 * Encrypts a headers object for storage. If the encryption key is not
 * configured, falls back to plaintext (legacy behavior) with a loud warning —
 * never blocks server creation.
 */
export function encryptMcpHeaders(
  headers: Record<string, string>,
): Record<string, string> | EncryptedEnvelope {
  if (!isEncryptionConfigured(KEY_NAME)) {
    logger.warn(
      "MCPServer.headers stored in PLAINTEXT — OAUTH_ENCRYPTION_KEY is not configured",
    );
    return headers;
  }
  return { [ENC_FIELD]: encrypt(JSON.stringify(headers), KEY_NAME) };
}

/**
 * Decrypts stored headers. Graceful fallback:
 *  - encrypted envelope → decrypt + parse
 *  - legacy plain object → returned as-is (existing servers keep working)
 *  - null/undefined/non-object → undefined
 *  - decrypt/parse failure → undefined + error log (connection will surface
 *    the missing auth loudly instead of silently sending a corrupted header)
 */
export function decryptMcpHeaders(
  stored: unknown,
): Record<string, string> | undefined {
  if (!stored || typeof stored !== "object") return undefined;

  if (isEncryptedEnvelope(stored)) {
    try {
      const parsed: unknown = JSON.parse(decrypt(stored[ENC_FIELD], KEY_NAME));
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, string>;
      }
      logger.error("Decrypted MCP headers are not an object — ignoring");
      return undefined;
    } catch (err) {
      logger.error("Failed to decrypt MCPServer.headers", {
        error: err instanceof Error ? err.message : String(err),
      });
      return undefined;
    }
  }

  // Legacy plaintext row — keep working.
  return stored as Record<string, string>;
}

/** True when the stored value is already in the encrypted format. */
export function isMcpHeadersEncrypted(stored: unknown): boolean {
  return isEncryptedEnvelope(stored);
}
