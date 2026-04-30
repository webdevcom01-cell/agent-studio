/**
 * Per-endpoint rate limit configuration.
 *
 * Provides differentiated limits for different API endpoints
 * instead of the global 20 req/min default.
 */

export interface EndpointRateLimit {
  maxRequests: number;
  windowMs: number;
}

const ENDPOINT_LIMITS: Record<string, EndpointRateLimit> = {
  // Auth — strict to prevent brute force
  "auth:login": { maxRequests: 5, windowMs: 60_000 },
  "auth:register": { maxRequests: 3, windowMs: 60_000 },

  // Chat — moderate (user is waiting)
  "chat": { maxRequests: 30, windowMs: 60_000 },

  // Upload — restrictive (expensive operation)
  "upload": { maxRequests: 10, windowMs: 60_000 },

  // API — standard
  "api:agents": { maxRequests: 60, windowMs: 60_000 },
  "api:knowledge": { maxRequests: 30, windowMs: 60_000 },

  // Webhooks — higher limit (machine-to-machine)
  "webhook": { maxRequests: 60, windowMs: 60_000 },

  // Admin — moderate
  "admin": { maxRequests: 30, windowMs: 60_000 },

  // Pipeline — very restrictive (each run is expensive AI compute)
  "pipeline": { maxRequests: 5, windowMs: 60_000 },

  // Export — strict (expensive)
  "export": { maxRequests: 1, windowMs: 86_400_000 }, // 1 per day

  // Default fallback
  "default": { maxRequests: 20, windowMs: 60_000 },
};

/**
 * Get rate limit config for a given endpoint category.
 */
export function getEndpointLimit(category: string): EndpointRateLimit {
  return ENDPOINT_LIMITS[category] ?? ENDPOINT_LIMITS.default;
}

/**
 * Determine endpoint category from request pathname.
 */
export function categorizeEndpoint(pathname: string): string {
  if (pathname.includes("/auth/")) return "auth:login";
  if (pathname.includes("/chat")) return "chat";
  if (pathname.includes("/upload")) return "upload";
  if (pathname.includes("/knowledge")) return "api:knowledge";
  if (pathname.includes("/pipelines")) return "pipeline";
  if (pathname.includes("/trigger/")) return "webhook";
  if (pathname.includes("/admin/")) return "admin";
  if (pathname.includes("/export")) return "export";
  if (pathname.includes("/agents")) return "api:agents";
  return "default";
}

export { ENDPOINT_LIMITS };
