/**
 * Generate a session token for CI E2E tests.
 *
 * NextAuth v5 uses ENCRYPTED JWE session tokens (A256CBC-HS512), NOT signed
 * HS256 JWTs. The app reads the cookie with the library decoder, so the token
 * MUST be produced by the same `encode()` from `next-auth/jwt` — a hand-rolled
 * HMAC token fails decryption and throws JWTSessionError on every auth request.
 *
 * The salt MUST equal the session cookie name pinned in src/lib/auth.ts
 * ("authjs.session-token"); the secret is AUTH_SECRET.
 *
 * The jwt callback only enriches the token on sign-in/update — for a token
 * decoded from a cookie it runs neither branch. So `id`, `currentOrgId` and
 * `onboardingCompleted` have to be baked in here, or session.user.id /
 * currentOrgId come back empty and org-gated routes (POST /api/agents) 403.
 *
 * Usage:
 *   pnpm tsx e2e/scripts/generate-ci-session.ts
 *
 * Requires:
 *   AUTH_SECRET env var (same as the app)
 *   DATABASE_URL env var (to seed the test user + personal org)
 */

import { PrismaClient } from "../../src/generated/prisma/index.js";
import { encode } from "next-auth/jwt";

const SESSION_COOKIE_NAME = "authjs.session-token";
const SESSION_MAX_AGE_SECONDS = 86400;
const TEST_USER_EMAIL = "e2e-test@agent-studio.dev";
const TEST_USER_NAME = "E2E Test User";

const AUTH_SECRET: string = process.env.AUTH_SECRET ?? "";
if (!AUTH_SECRET) {
  process.stderr.write("❌ AUTH_SECRET is required\n");
  process.exit(1);
}

const prisma = new PrismaClient();

/**
 * Mirror of src/lib/org/ensure-personal-org.ts so the test user has an org
 * membership — required for RLS-gated writes like POST /api/agents. The CI
 * `postgres` superuser bypasses RLS, so the standalone client can provision it.
 */
async function ensurePersonalOrg(userId: string, label: string | null): Promise<string> {
  const existing = await prisma.organizationMember.findFirst({
    where: { userId },
    select: { organizationId: true },
    orderBy: { joinedAt: "asc" },
  });
  if (existing) return existing.organizationId;

  const org = await prisma.organization.create({
    data: {
      name: `${label?.trim() || "My"} (Personal)`,
      slug: `personal-${userId}`,
      members: { create: { userId, role: "OWNER" } },
    },
    select: { id: true },
  });
  return org.id;
}

async function main(): Promise<void> {
  const testUser = await prisma.user.upsert({
    where: { email: TEST_USER_EMAIL },
    update: {},
    create: { email: TEST_USER_EMAIL, name: TEST_USER_NAME },
  });

  const currentOrgId = await ensurePersonalOrg(testUser.id, testUser.name);

  const token = await encode({
    salt: SESSION_COOKIE_NAME,
    secret: AUTH_SECRET,
    maxAge: SESSION_MAX_AGE_SECONDS,
    token: {
      id: testUser.id,
      sub: testUser.id,
      name: testUser.name,
      email: testUser.email,
      currentOrgId,
      onboardingCompleted: true,
    },
  });

  // CI captures stdout as the token value — emit ONLY the token here.
  process.stdout.write(`${token}\n`);

  await prisma.$disconnect();
}

main().catch(async (err) => {
  process.stderr.write(`❌ Failed to generate session: ${String(err)}\n`);
  await prisma.$disconnect();
  process.exit(1);
});
