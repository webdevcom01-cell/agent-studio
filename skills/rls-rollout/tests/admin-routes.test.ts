/**
 * admin-routes.test.ts — Admin routes bypass RLS via admin_user role
 *
 * Verifies:
 *   1. admin_user role has BYPASSRLS attribute
 *   2. Cross-tenant queries return data from all orgs
 *   3. app_user role with admin context flag still respects RLS (rules out
 *      accidentally using app_user for admin code paths)
 */

import { describe, it, beforeAll, afterAll, expect } from "vitest";
import { getRLSClient, type RLSClient } from "./_helpers/get-rls-client";

describe("Admin routes bypass RLS via admin_user role", () => {
  let adminClient: RLSClient;
  let appClient: RLSClient;
  let org1: { id: string };
  let org2: { id: string };
  let agent1: { id: string };
  let agent2: { id: string };

  beforeAll(async () => {
    adminClient = await getRLSClient("admin_user");
    appClient = await getRLSClient("app_user");

    org1 = await adminClient.prisma.organization.create({
      data: {
        id: `test-admin-org1-${Date.now()}`,
        name: "Admin Test Org 1",
        slug: `admin-test-1-${Date.now()}`,
      },
    });
    org2 = await adminClient.prisma.organization.create({
      data: {
        id: `test-admin-org2-${Date.now()}`,
        name: "Admin Test Org 2",
        slug: `admin-test-2-${Date.now()}`,
      },
    });

    agent1 = await adminClient.prisma.agent.create({
      data: {
        id: `test-admin-agent1-${Date.now()}`,
        name: "Admin Test Agent 1",
        organizationId: org1.id,
      },
    });
    agent2 = await adminClient.prisma.agent.create({
      data: {
        id: `test-admin-agent2-${Date.now()}`,
        name: "Admin Test Agent 2",
        organizationId: org2.id,
      },
    });
  });

  afterAll(async () => {
    try {
      await adminClient.prisma.agent.deleteMany({
        where: { id: { in: [agent1.id, agent2.id] } },
      });
      await adminClient.prisma.organization.deleteMany({
        where: { id: { in: [org1.id, org2.id] } },
      });
    } catch (e) {
      console.error("Cleanup error:", e);
    }
    await adminClient.cleanup();
    await appClient.cleanup();
  });

  it("admin_user role has BYPASSRLS=true", async () => {
    const result = await adminClient.prisma.$queryRaw<
      { rolbypassrls: boolean }[]
    >`SELECT rolbypassrls FROM pg_roles WHERE rolname = 'admin_user'`;

    expect(result[0]?.rolbypassrls).toBe(true);
  });

  it("app_user role has BYPASSRLS=false", async () => {
    const result = await adminClient.prisma.$queryRaw<
      { rolbypassrls: boolean }[]
    >`SELECT rolbypassrls FROM pg_roles WHERE rolname = 'app_user'`;

    expect(result[0]?.rolbypassrls).toBe(false);
  });

  it("admin client sees agents across all orgs (no context required)", async () => {
    const result = await adminClient.prisma.agent.findMany({
      where: { id: { in: [agent1.id, agent2.id] } },
    });

    expect(result.length).toBe(2);
  });

  it("admin client can mutate any org's data", async () => {
    const result = await adminClient.prisma.agent.update({
      where: { id: agent1.id },
      data: { name: "Renamed by admin" },
    });

    expect(result.name).toBe("Renamed by admin");

    // Restore for cleanup
    await adminClient.prisma.agent.update({
      where: { id: agent1.id },
      data: { name: "Admin Test Agent 1" },
    });
  });

  it("app_user client WITHOUT context sees 0 agents (defense-in-depth)", async () => {
    // Calling findMany without withRLSContext should return empty due to RLS
    const result = await appClient.prisma.agent.findMany({
      where: { id: { in: [agent1.id, agent2.id] } },
    });

    expect(result.length).toBe(0);
  });
});
