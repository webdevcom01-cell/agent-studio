/**
 * Vitest global setup file.
 *
 * React 19 exports `act` only in development builds.
 * react-dom/test-utils.production.js calls React.act() which is undefined
 * in production. We ensure the development build is used by forcing
 * NODE_ENV to "test" before any module is imported, then patch React.act
 * from the named `act` export as a safety net.
 */

// Ensure non-production NODE_ENV so React loads its development build
if (process.env.NODE_ENV === "production") {
  process.env.NODE_ENV = "test";
}

// next/headers is only available inside a real Next.js request context.
// In unit tests we stub it so auth-guard.ts can call headers() without crashing.
// The stub returns an empty Headers object — no x-api-key, so auth falls
// through to the mocked NextAuth session.
import { vi } from "vitest";
vi.mock("next/headers", () => ({
  headers: () => new Headers(),
  cookies: () => ({ get: () => undefined, getAll: () => [], has: () => false }),
}));
