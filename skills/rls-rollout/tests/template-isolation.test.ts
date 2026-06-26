/**
 * template-isolation.test.ts — RLS cross-tenant isolation for Template.
 *
 * Template was a TENANT_DIRECT table missing its RLS policy (found during the
 * Phase 2 dry-run coverage audit; fixed in migration
 * 20260626000001_rls_phase1_template). This test proves:
 *   - private templates are org-isolated (org A cannot see/write org B's)
 *   - public templates are visible cross-org (marketplace, isPublic clause)
 *   - writes stay strict (public read does NOT grant write)
 *
 * Prerequisites (same as cross-tenant.test.ts):
 *   - RLS_ENFORCEMENT_ENABLED=true, app_user + admin_user roles, migrations applied
 */

import { describe, it, beforeAll, afterAll, expect } from "vitest";
import { Prisma } from "@/generated/prisma";
import {
  getRLSClient,
  withRLSContext,
  type RLSClient,
} from "./_helpers/get-rls-client";

describe("RLS Template isolation", () => {
  let setup: RLSClient; // admin_user — fixtures (bypasses RLS)
  let app: RLSClient; // app_user — exercises RLS
  let orgA: { id: string };
  let orgB: { id: string };
  let privB: { id: string };
  let pubB: { id: string };

  beforeAll(async () => {
    setup = await getRLSClient("admin_user");
    app = await getRLSClient("app_user");
    const ts = Date.now();

    orgA = await setup.prisma.organization.create({
      data: { id: `tpl-org-a-${ts}`, name: "Tpl Org A", slug: `tpl-a-${ts}` },
    });
    orgB = await setup.prisma.organization.create({
      data: { id: `tpl-org-b-${ts}`, name: "Tpl Org B", slug: `tpl-b-${ts}` },
    });
    privB = await setup.prisma.template.create({
      data: { id: `tpl-priv-b-${ts}`, name: "Private B", organizationId: orgB.id, isPublic: false, payload: {}, checksum: "c" },
    });
    pubB = await setup.prisma.template.create({
      data: { id: `tpl-pub-b-${ts}`, name: "Public B", organizationId: orgB.id, isPublic: true, payload: {}, checksum: "c" },
    });
  });

  afterAll(async () => {
    try {
      await setup.prisma.template.deleteMany({ where: { id: { in: [privB.id, pubB.id] } } });
      await setup.prisma.organization.deleteMany({ where: { id: { in: [orgA.id, orgB.id] } } });
    } catch (e) {
      console.error("Cleanup error:", e);
    }
    await app.cleanup();
    await setup.cleanup();
  });

  // Run a query as app_user in org A's context.
  const asA = <T>(fn: (tx: Prisma.TransactionClient) => Promise<T>) =>
    withRLSContext(app.prisma, { organizationId: orgA.id, userId: "u-a" }, fn);

  it("org A CANNOT see org B's PRIVATE template", async () => {
    const r = await asA((tx) => tx.template.findUnique({ where: { id: privB.id } }));
    expect(r).toBeNull();
  });

  it("org A CAN see org B's PUBLIC template (marketplace)", async () => {
    const r = await asA((tx) => tx.template.findUnique({ where: { id: pubB.id } }));
    expect(r).not.toBeNull();
    expect(r?.id).toBe(pubB.id);
  });

  it("org A findMany returns none of org B's private templates", async () => {
    const r = await asA((tx) =>
      tx.template.findMany({ where: { organizationId: orgB.id, isPublic: false } }),
    );
    expect(r.length).toBe(0);
  });

  it("org A CANNOT update org B's private template (0 rows)", async () => {
    const r = await asA((tx) =>
      tx.template.updateMany({ where: { id: privB.id }, data: { name: "pwned" } }),
    );
    expect(r.count).toBe(0);
  });

  it("org A CANNOT delete org B's template (0 rows)", async () => {
    const r = await asA((tx) => tx.template.deleteMany({ where: { id: privB.id } }));
    expect(r.count).toBe(0);
  });

  it("org A CANNOT insert a template with org B's organizationId", async () => {
    await expect(
      asA((tx) =>
        tx.template.create({
          data: { id: `tpl-x-${Date.now()}`, name: "x", organizationId: orgB.id, isPublic: false, payload: {}, checksum: "c" },
        }),
      ),
    ).rejects.toThrow();
  });

  it("admin_user (bypass) CAN see org B's private template", async () => {
    const r = await setup.prisma.template.findUnique({ where: { id: privB.id } });
    expect(r).not.toBeNull();
  });
});
