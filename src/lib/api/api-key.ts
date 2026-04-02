/**
 * API Key — generation, hashing, and validation
 *
 * 2026 enterprise standard (Anthropic / Google model):
 *  - Format:     as_live_<43 random base64url chars>  (256-bit entropy)
 *  - Storage:    SHA-256 hash of the raw key — plaintext is NEVER stored
 *  - Lookup:     O(1) via unique index on keyHash
 *  - Scopes:     fine-grained permission strings (agents:read, flows:execute, …)
 *  - Expiry:     optional per-key expiresAt
 *  - Revocation: soft-delete via revokedAt timestamp
 */

import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

// ── Key prefix ───────────────────────────────────────────────────────────────

const KEY_PREFIX = "as_live_";

// ── Scopes ───────────────────────────────────────────────────────────────────

export const API_KEY_SCOPES = [
  "agents:read",
  "agents:write",
  "agents:delete",
  "flows:read",
  "flows:execute",
  "kb:read",
  "kb:write",
  "evals:read",
  "evals:run",
  "webhooks:read",
  "admin",
] as const;

export type ApiKeyScope = (typeof API_KEY_SCOPES)[number];

// ── Generation ───────────────────────────────────────────────────────────────

export interface GeneratedApiKey {
  /** Raw key — show once to the user, never store */
  key: string;
  /** SHA-256 hash — store in DB */
  keyHash: string;
  /** First 12 chars of raw key — safe to display in UI */
  keyPrefix: string;
}

export function generateApiKey(): GeneratedApiKey {
  const raw = KEY_PREFIX + randomBytes(32).toString("base64url");
  const keyHash = hashApiKey(raw);
  const keyPrefix = raw.slice(0, 12);

  return { key: raw, keyHash, keyPrefix };
}

export function hashApiKey(rawKey: string): string {
  return createHash("sha256").update(rawKey).digest("hex");
}

// ── Validation ───────────────────────────────────────────────────────────────

export interface ApiKeyAuthResult {
  userId: string;
  apiKeyId: string;
  scopes: string[];
}

/**
 * Validates a raw API key string.
 * Returns the auth result or null if invalid/expired/revoked.
 * Updates lastUsedAt as a fire-and-forget side effect.
 */
export async function validateApiKey(
  rawKey: string,
): Promise<ApiKeyAuthResult | null> {
  if (!rawKey.startsWith(KEY_PREFIX)) {
    return null;
  }

  const keyHash = hashApiKey(rawKey);

  let apiKey: {
    id: string;
    userId: string;
    scopes: string[];
    expiresAt: Date | null;
    revokedAt: Date | null;
  } | null;

  try {
    apiKey = await prisma.apiKey.findUnique({
      where: { keyHash },
      select: {
        id: true,
        userId: true,
        scopes: true,
        expiresAt: true,
        revokedAt: true,
      },
    });
  } catch (err) {
    logger.error("API key lookup failed", err, {});
    return null;
  }

  if (!apiKey) return null;
  if (apiKey.revokedAt) return null;
  if (apiKey.expiresAt && apiKey.expiresAt < new Date()) return null;

  // Update lastUsedAt — fire-and-forget, never block the request
  prisma.apiKey
    .update({ where: { id: apiKey.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {});

  return {
    userId: apiKey.userId,
    apiKeyId: apiKey.id,
    scopes: apiKey.scopes,
  };
}

// ── Scope helpers ─────────────────────────────────────────────────────────────

/** Returns true if the given scopes array grants the requested scope.
 *  "admin" scope is a wildcard — grants everything. */
export function hasScope(grantedScopes: string[], required: ApiKeyScope): boolean {
  return grantedScopes.includes("admin") || grantedScopes.includes(required);
}

export function requiresScope(
  grantedScopes: string[],
  required: ApiKeyScope,
): void {
  if (!hasScope(grantedScopes, required)) {
    throw new ApiKeyScopeError(required, grantedScopes);
  }
}

export class ApiKeyScopeError extends Error {
  readonly required: ApiKeyScope;
  readonly granted: string[];

  constructor(required: ApiKeyScope, granted: string[]) {
    super(`API key is missing required scope: ${required}`);
    this.name = "ApiKeyScopeError";
    this.required = required;
    this.granted = granted;
  }
}
