/**
 * Generate a session token for CI E2E tests.
 *
 * NextAuth v5 uses JWT sessions. This script creates a valid JWT using
 * Node.js built-in crypto (no extra deps), signed with the same AUTH_SECRET.
 *
 * Usage:
 *   pnpm tsx e2e/scripts/generate-ci-session.ts
 *
 * Requires:
 *   AUTH_SECRET env var (same as the app)
 *   DATABASE_URL env var (to seed the test user)
 */

import { PrismaClient } from "../../src/generated/prisma/index.js";
import { createHmac } from "crypto";

const AUTH_SECRET: string = process.env.AUTH_SECRET ?? "";
if (!AUTH_SECRET) {
  console.error("❌ AUTH_SECRET is required");
  process.exit(1);
}

const prisma = new PrismaClient();

/** Base64url encode (no padding) */
function base64url(input: string | Buffer): string {
  const buf = typeof input === "string" ? Buffer.from(input) : input;
  return buf.toString("base64url");
}

/** Create a signed JWT (HS256) compatible with NextAuth v5 */
function createJWT(payload: Record<string, unknown>, secret: string): string {
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = base64url(JSON.stringify(payload));
  const signature = base64url(
    createHmac("sha256", secret).update(`${header}.${body}`).digest()
  );
  return `${header}.${body}.${signature}`;
}

async function main() {
  // Ensure a test user exists
  const testUser = await prisma.user.upsert({
    where: { email: "e2e-test@agent-studio.dev" },
    update: {},
    create: {
      email: "e2e-test@agent-studio.dev",
      name: "E2E Test User",
    },
  });

  const now = Math.floor(Date.now() / 1000);
  const token = createJWT(
    {
      sub: testUser.id,
      name: testUser.name,
      email: testUser.email,
      iat: now,
      exp: now + 86400, // 24 hours
    },
    AUTH_SECRET
  );

  // Output the token (CI script captures this)
  console.log(token);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("❌ Failed to generate session:", err);
  process.exit(1);
});
