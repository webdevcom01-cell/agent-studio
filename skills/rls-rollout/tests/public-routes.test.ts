/**
 * public-routes.test.ts — Anonymous traffic respects RLS via agent record
 *
 * Verifies:
 *   1. Public agent (isPublic=true) is accessible without auth
 *   2. RLS context is resolved from agent record server-side
 *   3. Private agent (isPublic=false) is NOT accessible anonymously
 *   4. The `isPublic` policy clause works
 */

import { describe, it, beforeAll, afterAll, expect } from "vitest";
import {
  getRLSClient,
  withRLSContext,
  type RLSClient,
} from "./_helpers/get-rls-client";

describe("Public routes respect RLS via agent record", () => {
  let setupClient: RLSClient;
  let appClient: RLSClient;
  let orgA: { id: string };
  let publicAgent: { id: string };
  let privateAgent: { id: string };

  beforeAll(async () => {
    setupClient = await getRLSClient("admin_user");
    appClient = await getRLSClient("app_user");

    orgA = await setupClient.prisma.organization.create({
      data: {
        id: `test-pub-org-${Date.now()}`,
        name: "Public Test Org",
        slug: `pub-test-${Date.now()}`,
      },
    });

    publicAgent = await setupClient.prisma.agent.create({
      data: {
        id: `test-pub-agent-${Date.now()}`,
        name: "Public Agent",
        organizationId: orgA.id,
        isPublic: true,
      },
    });

    privateAgent = await setupClient.prisma.agent.create({
      data: {
        id: `test-priv-agent-${Date.now()}`,
        name: "Private Agent",
        organizationId: orgA.id,
        isPublic: false,
      },
    });
  });

  afterAll(async () => {
    try {
      await setupClient.prisma.agent.deleteMany({
        where: { id: { in: [publicAgent.id, privateAgent.id] } },
      });
      await setupClient.prisma.organization.delete({ where: { id: orgA.id } });
    } catch (e) {
      console.error("Cleanup error:", e);
    }
    await appClient.cleanup();
    await setupClient.cleanup();
  });

  it("Anonymous user (different org context) CAN see public agent", async () => {
    // Simulate: anonymous request hits /api/agents/{id}/chat
    // Server resolves agent.organizationId from public lookup, sets context
    const fakeAnotherOrg = "different-org-id";

    const result = await withRLSContext(
      appClient.prisma,
      { organizationId: fakeAnotherOrg, userId: "anonymous" },
      (tx) => tx.agent.findUnique({ where: { id: publicAgent.id } })
    );

    // Should be visible due to isPublic=true policy clause
    expect(result).not.toBeNull();
    expect(result?.id).toBe(publicAgent.id);
  });

  it("Anonymous user CANNOT see private agent", async () => {
    const fakeAnotherOrg = "different-org-id";

    const result = await withRLSContext(
      appClient.prisma,
      { organizationId: fakeAnotherOrg, userId: "anonymous" },
      (tx) => tx.agent.findUnique({ where: { id: privateAgent.id } })
    );

    expect(result).toBeNull();
  });

  it("Org member sees BOTH public and private agents in their org", async () => {
    const result = await withRLSContext(
      appClient.prisma,
      { organizationId: orgA.id, userId: "any-user" },
      (tx) => tx.agent.findMany({
        where: { id: { in: [publicAgent.id, privateAgent.id] } },
      })
    );

    expect(result.length).toBe(2);
  });

  it("Anonymous user can SELECT public templates (marketplace)", async () => {
    // Create a public template and verify cross-org read works
    const publicTemplate = await setupClient.prisma.template.create({
      data: {
        id: `test-pub-tpl-${Date.now()}`,
        name: "Public Template",
        organizationId: orgA.id,
        isPublic: true,
        payload: {},
        checksum: "test-checksum",
      },
    });

    try {
      const result = await withRLSContext(
        appClient.prisma,
        { organizationId: "different-org", userId: "anonymous" },
        (tx) => tx.template.findUnique({ where: { id: publicTemplate.id } })
      );

      expect(result).not.toBeNull();
    } finally {
      await setupClient.prisma.template.delete({
        where: { id: publicTemplate.id },
      });
    }
  });
});
