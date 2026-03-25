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
