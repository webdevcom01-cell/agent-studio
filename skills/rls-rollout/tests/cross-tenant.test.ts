/**
 * cross-tenant.test.ts — RLS cross-tenant isolation verification
 *
 * MUST pass before any production cutover. If this test detects a leak, RLS is
 * NOT enforcing tenant isolation correctly.
 *
 * Prerequisites:
 *   - RLS_ENFORCEMENT_ENABLED=true in test env
 *   - app_user and admin_user roles exist with appropriate permissions
 *   - Migrations through current phase applied
 *
 * Run:
 *   pnpm vitest run skills/rls-rollout/tests/cross-tenant.test.ts
 */

import { describe, it, beforeAll, afterAll, expect } from "vitest";
import {
  getRLSClient,
  withRLSContext,
  type RLSClient,
} from "./_helpers/get-rls-client";

describe("RLS cross-tenant isolation", () => {
  let setupClient: RLSClient; // admin_user — for test data setup
  let appClient: RLSClient; // app_user — exercises RLS

  let orgA: { id: string };
  let orgB: { id: string };
  let userA: { id: string };
  let userB: { id: string };
  let agentA: { id: string };
  let agentB: { id: string };

  beforeAll(async () => {
    setupClient = await getRLSClient("admin_user");
    appClient = await getRLSClient("app_user");

    // Create two isolated orgs + users + agents (via admin, bypasses RLS)
    orgA = await setupClient.prisma.organization.create({
      data: {
        id: `test-rls-org-a-${Date.now()}`,
        name: "Test Org A",
        slug: `test-rls-a-${Date.now()}`,
      },
    });
    orgB = await setupClient.prisma.organization.create({
      data: {
        id: `test-rls-org-b-${Date.now()}`,
        name: "Test Org B",
        slug: `test-rls-b-${Date.now()}`,
      },
    });

    userA = await setupClient.prisma.user.create({
      data: {
        id: `test-rls-user-a-${Date.now()}`,
        email: `rls-test-a-${Date.now()}@test.local`,
      },
    });
    userB = await setupClient.prisma.user.create({
      data: {
        id: `test-rls-user-b-${Date.now()}`,
        email: `rls-test-b-${Date.now()}@test.local`,
      },
    });

    await setupClient.prisma.organizationMember.createMany({
      data: [
        { userId: userA.id, organizationId: orgA.id, role: "OWNER" },
        { userId: userB.id, organizationId: orgB.id, role: "OWNER" },
      ],
    });

    agentA = await setupClient.prisma.agent.create({
      data: {
        id: `test-rls-agent-a-${Date.now()}`,
        name: "Agent A",
        organizationId: orgA.id,
        userId: userA.id,
      },
    });
    agentB = await setupClient.prisma.agent.create({
      data: {
        id: `test-rls-agent-b-${Date.now()}`,
        name: "Agent B",
        organizationId: orgB.id,
        userId: userB.id,
      },
    });
  });

  afterAll(async () => {
    // Cleanup via admin (bypasses RLS)
    try {
      await setupClient.prisma.agent.deleteMany({
        where: { id: { in: [agentA.id, agentB.id] } },
      });
      await setupClient.prisma.organizationMember.deleteMany({
        where: { organizationId: { in: [orgA.id, orgB.id] } },
      });
      await setupClient.prisma.user.deleteMany({
        where: { id: { in: [userA.id, userB.id] } },
      });
      await setupClient.prisma.organization.deleteMany({
        where: { id: { in: [orgA.id, orgB.id] } },
      });
    } catch (e) {
      console.error("Cleanup failed (may need manual cleanup):", e);
    }
    await appClient.cleanup();
    await setupClient.cleanup();
  });

  // ============================================================================
  // SELECT isolation
  // ============================================================================

  describe("SELECT isolation", () => {
    it("orgA context: findMany returns ONLY orgA agents", async () => {
      const result = await withRLSContext(
        appClient.prisma,
        { organizationId: orgA.id, userId: userA.id },
        (tx) => tx.agent.findMany({
          where: { id: { in: [agentA.id, agentB.id] } },
        })
      );

      expect(result.find((a) => a.id === agentA.id)).toBeDefined();
      expect(result.find((a) => a.id === agentB.id)).toBeUndefined();
    });

    it("orgB context: findMany returns ONLY orgB agents", async () => {
      const result = await withRLSContext(
        appClient.prisma,
        { organizationId: orgB.id, userId: userB.id },
        (tx) => tx.agent.findMany({
          where: { id: { in: [agentA.id, agentB.id] } },
        })
      );

      expect(result.find((a) => a.id === agentB.id)).toBeDefined();
      expect(result.find((a) => a.id === agentA.id)).toBeUndefined();
    });

    it("orgA context: findUnique on agentB returns null", async () => {
      const result = await withRLSContext(
        appClient.prisma,
        { organizationId: orgA.id, userId: userA.id },
        (tx) => tx.agent.findUnique({ where: { id: agentB.id } })
      );

      expect(result).toBeNull();
    });
  });

  // ============================================================================
  // UPDATE isolation
  // ============================================================================

  describe("UPDATE isolation", () => {
    it("orgA context: cannot UPDATE orgB's agent (returns 'record not found')", async () => {
      await expect(
        withRLSContext(
          appClient.prisma,
          { organizationId: orgA.id, userId: userA.id },
          (tx) =>
            tx.agent.update({
              where: { id: agentB.id },
              data: { name: "PWNED" },
            })
        )
      ).rejects.toThrow();
    });

    it("orgB's agent name was NOT modified after attempted attack", async () => {
      // Verify via admin client
      const fresh = await setupClient.prisma.agent.findUnique({
        where: { id: agentB.id },
      });
      expect(fresh?.name).toBe("Agent B");
    });
  });

  // ============================================================================
  // DELETE isolation
  // ============================================================================

  describe("DELETE isolation", () => {
    it("orgA context: deleteMany on orgB rows affects 0 rows", async () => {
      const result = await withRLSContext(
        appClient.prisma,
        { organizationId: orgA.id, userId: userA.id },
        (tx) => tx.agent.deleteMany({ where: { id: agentB.id } })
      );

      expect(result.count).toBe(0);
    });

    it("orgB's agent still exists after orgA attempted delete", async () => {
      const fresh = await setupClient.prisma.agent.findUnique({
        where: { id: agentB.id },
      });
      expect(fresh).not.toBeNull();
    });
  });

  // ============================================================================
  // INSERT isolation
  // ============================================================================

  describe("INSERT isolation", () => {
    it("orgA context: cannot INSERT with orgB's organizationId", async () => {
      await expect(
        withRLSContext(
          appClient.prisma,
          { organizationId: orgA.id, userId: userA.id },
          (tx) =>
            tx.agent.create({
              data: {
                id: `test-rls-leak-${Date.now()}`,
                name: "Leak",
                organizationId: orgB.id, // attempting to create in OTHER org
                userId: userA.id,
              },
            })
        )
      ).rejects.toThrow();
    });
  });

  // ============================================================================
  // TENANT_INDIRECT cascade (Flow → Agent.organizationId)
  // ============================================================================

  describe("TENANT_INDIRECT isolation (Flow → Agent)", () => {
    it("orgA context: Flow visible only if its agent is in orgA", async () => {
      // Setup: create flows via admin
      const flowA = await setupClient.prisma.flow.create({
        data: {
          id: `test-rls-flow-a-${Date.now()}`,
          agentId: agentA.id,
          content: { nodes: [] },
        },
      });
      const flowB = await setupClient.prisma.flow.create({
        data: {
          id: `test-rls-flow-b-${Date.now()}`,
          agentId: agentB.id,
          content: { nodes: [] },
        },
      });

      try {
        const result = await withRLSContext(
          appClient.prisma,
          { organizationId: orgA.id, userId: userA.id },
          (tx) => tx.flow.findMany({
            where: { id: { in: [flowA.id, flowB.id] } },
          })
        );

        expect(result.find((f) => f.id === flowA.id)).toBeDefined();
        expect(result.find((f) => f.id === flowB.id)).toBeUndefined();
      } finally {
        await setupClient.prisma.flow.deleteMany({
          where: { id: { in: [flowA.id, flowB.id] } },
        });
      }
    });
  });

  // ============================================================================
  // Sanity: admin_user bypasses RLS
  // ============================================================================

  describe("admin_user role bypasses RLS", () => {
    it("admin client can SELECT across all orgs without context", async () => {
      const all = await setupClient.prisma.agent.findMany({
        where: { id: { in: [agentA.id, agentB.id] } },
      });
      expect(all.length).toBe(2);
    });
  });
});
