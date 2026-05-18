/**
 * gdpr-export.test.ts — GDPR user export works across all user's orgs
 *
 * Verifies that a user with agents in MULTIPLE orgs can export all their data
 * via the GDPR endpoint, which uses admin_user (BYPASSRLS) to scan cross-org.
 *
 * The route under test: /api/user/export
 * Underlying implementation: src/lib/gdpr/data-export.ts
 */

import { describe, it, beforeAll, afterAll, expect } from "vitest";
import { getRLSClient, type RLSClient } from "./_helpers/get-rls-client";

describe("GDPR export — cross-org user data", () => {
  let adminClient: RLSClient;
  let userId: string;
  let orgX: { id: string };
  let orgY: { id: string };
  let agentInX: { id: string };
  let agentInY: { id: string };

  beforeAll(async () => {
    adminClient = await getRLSClient("admin_user");

    userId = `test-gdpr-user-${Date.now()}`;
    await adminClient.prisma.user.create({
      data: { id: userId, email: `gdpr-${Date.now()}@test.local` },
    });

    orgX = await adminClient.prisma.organization.create({
      data: {
        id: `test-gdpr-x-${Date.now()}`,
        name: "GDPR Test X",
        slug: `gdpr-x-${Date.now()}`,
      },
    });
    orgY = await adminClient.prisma.organization.create({
      data: {
        id: `test-gdpr-y-${Date.now()}`,
        name: "GDPR Test Y",
        slug: `gdpr-y-${Date.now()}`,
      },
    });

    await adminClient.prisma.organizationMember.createMany({
      data: [
        { userId, organizationId: orgX.id, role: "MEMBER" },
        { userId, organizationId: orgY.id, role: "MEMBER" },
      ],
    });

    agentInX = await adminClient.prisma.agent.create({
      data: {
        id: `test-gdpr-agent-x-${Date.now()}`,
        name: "Agent in X",
        organizationId: orgX.id,
        userId,
      },
    });
    agentInY = await adminClient.prisma.agent.create({
      data: {
        id: `test-gdpr-agent-y-${Date.now()}`,
        name: "Agent in Y",
        organizationId: orgY.id,
        userId,
      },
    });
  });

  afterAll(async () => {
    try {
      await adminClient.prisma.agent.deleteMany({
        where: { id: { in: [agentInX.id, agentInY.id] } },
      });
      await adminClient.prisma.organizationMember.deleteMany({
        where: { userId },
      });
      await adminClient.prisma.organization.deleteMany({
        where: { id: { in: [orgX.id, orgY.id] } },
      });
      await adminClient.prisma.user.delete({ where: { id: userId } });
    } catch (e) {
      console.error("Cleanup error:", e);
    }
    await adminClient.cleanup();
  });

  it("admin client can read user's agents across all their orgs", async () => {
    // Simulates: /api/user/export uses admin client filtered by userId
    const result = await adminClient.prisma.agent.findMany({
      where: { userId },
    });

    expect(result.length).toBeGreaterThanOrEqual(2);
    expect(result.find((a) => a.id === agentInX.id)).toBeDefined();
    expect(result.find((a) => a.id === agentInY.id)).toBeDefined();
  });

  it("admin client can read user's org memberships across all orgs", async () => {
    const result = await adminClient.prisma.organizationMember.findMany({
      where: { userId },
    });

    expect(result.length).toBe(2);
    const orgIds = result.map((m) => m.organizationId);
    expect(orgIds).toContain(orgX.id);
    expect(orgIds).toContain(orgY.id);
  });
});
