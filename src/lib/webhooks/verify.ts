/**
 * Inbound webhook signature verification — Standard Webhooks spec.
 *
 * Implements HMAC-SHA256 verification with timestamp validation to prevent
 * replay attacks. Follows the Standard Webhooks specification:
 * https://www.standardwebhooks.com
 *
 * Signature base string: "${webhookId}.${timestamp}.${rawBody}"
 * Signature format:       "v1,<base64-encoded-hmac>"
 *
 * Accepted headers (primary / fallback):
 *   x-webhook-id        | webhook-id
 *   x-webhook-timestamp | webhook-timestamp
 *   x-webhook-signature | webhook-signature
 */

import { createHmac, timingSafeEqual, randomBytes } from "crypto";

/** Maximum age of a webhook request before it is rejected (5 minutes). */
const MAX_TIMESTAMP_AGE_SECONDS = 5 * 60;

export interface WebhookVerifyResult {
  valid: boolean;
  error?: string;
}

/**
 * Extracts a header value using a primary name and an optional fallback name.
 * Case-insensitive — webhook providers are inconsistent with casing.
 */
function getHeader(
  headers: Record<string, string | string[] | undefined>,
  primary: string,
  fallback?: string
): string | undefined {
  const normalised = Object.fromEntries(
    Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v])
  );
  const value =
    normalised[primary.toLowerCase()] ?? normalised[fallback?.toLowerCase() ?? ""];
  if (Array.isArray(value)) return value[0];
  return value;
}

/**
 * Verifies an inbound webhook request using HMAC-SHA256.
 *
 * @param rawBody  - Raw request body string (MUST be preserved before JSON parsing)
 * @param headers  - Request headers object
 * @param secret   - Webhook signing secret stored in WebhookConfig
 *
 * Steps:
 *  1. Extract required Standard Webhooks headers
 *  2. Validate timestamp is within the 5-minute window
 *  3. Reconstruct the signature base string
 *  4. Compute HMAC-SHA256 and compare timing-safely
 */
export function verifyWebhookSignature(
  rawBody: string,
  headers: Record<string, string | string[] | undefined>,
  secret: string
): WebhookVerifyResult {
  // ── 1. Extract headers ─────────────────────────────────────────────────────
  const msgId = getHeader(headers, "x-webhook-id", "webhook-id");
  const msgTimestamp = getHeader(headers, "x-webhook-timestamp", "webhook-timestamp");
  const msgSignature = getHeader(headers, "x-webhook-signature", "webhook-signature");

  if (!msgId) {
    return { valid: false, error: "Missing x-webhook-id header" };
  }
  if (!msgTimestamp) {
    return { valid: false, error: "Missing x-webhook-timestamp header" };
  }
  if (!msgSignature) {
    return { valid: false, error: "Missing x-webhook-signature header" };
  }

  // ── 2. Timestamp validation (replay attack prevention) ────────────────────
  const timestamp = parseInt(msgTimestamp, 10);
  if (isNaN(timestamp)) {
    return { valid: false, error: "Invalid x-webhook-timestamp: not a number" };
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  const ageDelta = Math.abs(nowSeconds - timestamp);

  if (ageDelta > MAX_TIMESTAMP_AGE_SECONDS) {
    return {
      valid: false,
      error: `Webhook timestamp too old (${ageDelta}s). Max allowed: ${MAX_TIMESTAMP_AGE_SECONDS}s`,
    };
  }

  // ── 3. Reconstruct base string & compute expected signature ───────────────
  // Standard Webhooks base string: "${id}.${timestamp}.${rawBody}"
  const toSign = `${msgId}.${msgTimestamp}.${rawBody}`;

  const expectedRaw = createHmac("sha256", secret).update(toSign).digest("base64");
  const expectedSignature = `v1,${expectedRaw}`;

  // ── 4. Timing-safe comparison ─────────────────────────────────────────────
  // The header may contain multiple signatures: "v1,sig1 v1,sig2"
  // Accept if ANY of them matches — allows secret rotation without downtime.
  const signatures = msgSignature.split(" ");

  for (const sig of signatures) {
    try {
      if (
        timingSafeEqual(Buffer.from(sig.trim()), Buffer.from(expectedSignature))
      ) {
        return { valid: true };
      }
    } catch {
      // timingSafeEqual throws if buffers differ in length — treat as mismatch
    }
  }

  return { valid: false, error: "Signature mismatch" };
}

/**
 * Generates a cryptographically secure webhook signing secret.
 * Returns a URL-safe base64 string (43 chars, 256 bits of entropy).
 */
export function generateWebhookSecret(): string {
  return randomBytes(32).toString("base64url");
}
