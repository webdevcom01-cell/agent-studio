/**
 * AES-256-GCM encryption/decryption for sensitive data at rest.
 *
 * Used for webhook signing secrets and (future) OAuth tokens.
 * Requires WEBHOOK_ENCRYPTION_KEY env var (32-byte base64url string).
 *
 * Format: base64url(iv:ciphertext:authTag)
 *   - iv: 12 bytes (96-bit, NIST recommended for GCM)
 *   - authTag: 16 bytes (128-bit)
 */

import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function getEncryptionKey(): Buffer {
  const raw = process.env.WEBHOOK_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "WEBHOOK_ENCRYPTION_KEY is not set. Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('base64url'))\""
    );
  }
  const buf = Buffer.from(raw, "base64url");
  if (buf.length !== 32) {
    throw new Error(
      `WEBHOOK_ENCRYPTION_KEY must be exactly 32 bytes (256 bits). Got ${buf.length} bytes.`
    );
  }
  return buf;
}

/**
 * Encrypts a plaintext string using AES-256-GCM.
 * Returns a single base64url-encoded string containing iv + ciphertext + authTag.
 */
export function encrypt(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  const combined = Buffer.concat([iv, encrypted, authTag]);
  return combined.toString("base64url");
}

/**
 * Decrypts a base64url-encoded AES-256-GCM ciphertext.
 * Returns the original plaintext string.
 * Throws on tampered data (GCM authentication failure).
 */
export function decrypt(encoded: string): string {
  const key = getEncryptionKey();
  const combined = Buffer.from(encoded, "base64url");

  if (combined.length < IV_LENGTH + AUTH_TAG_LENGTH) {
    throw new Error("Encrypted data is too short to be valid");
  }

  const iv = combined.subarray(0, IV_LENGTH);
  const authTag = combined.subarray(combined.length - AUTH_TAG_LENGTH);
  const ciphertext = combined.subarray(IV_LENGTH, combined.length - AUTH_TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}

/**
 * Checks whether the encryption key is configured.
 * Use this for graceful degradation during migration.
 */
export function isEncryptionConfigured(): boolean {
  const raw = process.env.WEBHOOK_ENCRYPTION_KEY;
  if (!raw) return false;
  try {
    const buf = Buffer.from(raw, "base64url");
    return buf.length === 32;
  } catch {
    return false;
  }
}
