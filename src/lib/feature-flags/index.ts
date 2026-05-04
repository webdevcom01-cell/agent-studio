/**
 * Feature Flag System — server-side flag evaluation.
 *
 * Supports:
 *  - Boolean flags (on/off)
 *  - Percentage-based rollout (0-100%)
 *  - Per-org overrides
 *
 * Flags are evaluated server-side only — never exposed to the client
 * unless explicitly included in a page prop or API response.
 *
 * Storage: in-memory defaults + optional Redis override layer.
 */

import { cacheGet, cacheSet } from "@/lib/redis";
import { logger } from "@/lib/logger";

export interface FeatureFlag {
  key: string;
  enabled: boolean;
  rolloutPercent: number;
  description: string;
}

interface FlagOverride {
  enabled?: boolean;
  rolloutPercent?: number;
}

// ── Default flag definitions ─────────────────────────────────────────────────

const DEFAULT_FLAGS: Record<string, FeatureFlag> = {
  "async-execution": {
    key: "async-execution",
    enabled: false, // Disabled until dedicated worker Railway service is deployed
    rolloutPercent: 0,
    description: "Route chat requests through BullMQ job queue",
  },
  "webhook-retry": {
    key: "webhook-retry",
    enabled: true,
    rolloutPercent: 100,
    description: "Retry failed webhook executions with exponential backoff",
  },
  "safety-middleware": {
    key: "safety-middleware",
    enabled: true,
    rolloutPercent: 100,
    description: "Auto-check AI calls for injection and PII",
  },
  "onboarding-wizard": {
    key: "onboarding-wizard",
    enabled: false,
    rolloutPercent: 0,
    description: "Show guided onboarding for new users",
  },
  "org-multi-tenancy": {
    key: "org-multi-tenancy",
    enabled: false,
    rolloutPercent: 0,
    description: "Enable organization-based multi-tenancy",
  },
};

const REDIS_PREFIX = "ff:";
const OVERRIDE_PREFIX = "ff-override:";

// ── Core evaluation ──────────────────────────────────────────────────────────

/**
 * Check if a feature flag is enabled for a given context.
 * Evaluation order: org override > Redis override > default.
 */
export async function isFeatureEnabled(
  flagKey: string,
  context?: { orgId?: string; userId?: string },
): Promise<boolean> {
  const flag = DEFAULT_FLAGS[flagKey];
  if (!flag) return false;

  // Check per-org override first
  if (context?.orgId) {
    const orgOverride = await getOrgOverride(flagKey, context.orgId);
    if (orgOverride?.enabled !== undefined) {
      return orgOverride.enabled;
    }
  }

  // Check Redis override (set via admin API)
  const redisOverride = await getRedisOverride(flagKey);
  if (redisOverride?.enabled !== undefined) {
    return redisOverride.enabled;
  }

  // Default: check enabled + percentage rollout
  if (!flag.enabled) return false;
  if (flag.rolloutPercent >= 100) return true;
  if (flag.rolloutPercent <= 0) return false;

  // Deterministic hash for consistent rollout per user/org
  const seed = context?.userId ?? context?.orgId ?? "anonymous";
  const hash = simpleHash(seed + flagKey);
  return (hash % 100) < flag.rolloutPercent;
}

/**
 * Get all flags with their current state (for admin dashboard).
 */
export function getAllFlags(): FeatureFlag[] {
  return Object.values(DEFAULT_FLAGS);
}

/**
 * Set a global override for a flag (persisted in Redis).
 */
export async function setFlagOverride(
  flagKey: string,
  override: FlagOverride,
): Promise<void> {
  await cacheSet(
    `${REDIS_PREFIX}${flagKey}`,
    JSON.stringify(override),
    86400 * 30, // 30 days
  );
  logger.info("Feature flag override set", { flagKey, override });
}

/**
 * Set a per-org override for a flag.
 */
export async function setOrgFlagOverride(
  flagKey: string,
  orgId: string,
  override: FlagOverride,
): Promise<void> {
  await cacheSet(
    `${OVERRIDE_PREFIX}${orgId}:${flagKey}`,
    JSON.stringify(override),
    86400 * 30,
  );
  logger.info("Feature flag org override set", { flagKey, orgId, override });
}

/**
 * Remove a global override (revert to default).
 */
export async function clearFlagOverride(flagKey: string): Promise<void> {
  const { cacheDel } = await import("@/lib/redis");
  await cacheDel(`${REDIS_PREFIX}${flagKey}`);
}

// ── Internal helpers ─────────────────────────────────────────────────────────

async function getRedisOverride(flagKey: string): Promise<FlagOverride | null> {
  try {
    const data = await cacheGet(`${REDIS_PREFIX}${flagKey}`);
    if (!data) return null;
    return JSON.parse(data) as FlagOverride;
  } catch {
    return null;
  }
}

async function getOrgOverride(
  flagKey: string,
  orgId: string,
): Promise<FlagOverride | null> {
  try {
    const data = await cacheGet(`${OVERRIDE_PREFIX}${orgId}:${flagKey}`);
    if (!data) return null;
    return JSON.parse(data) as FlagOverride;
  } catch {
    return null;
  }
}

function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return Math.abs(hash);
}

export { DEFAULT_FLAGS };
