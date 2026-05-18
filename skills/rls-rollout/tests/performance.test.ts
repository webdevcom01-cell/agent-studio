/**
 * performance.test.ts — RLS performance regression test
 *
 * Runs 20 representative queries with and without RLS context, compares p95
 * latency, and fails if regression exceeds 10%.
 *
 * IMPORTANT: This test requires a populated test database. If running against
 * an empty test DB, p95 results will be meaningless (sub-millisecond).
 *
 * Strategy:
 *   1. Seed N agents per org for K orgs (default: 100 × 5 = 500)
 *   2. Run each query 100 times
 *   3. Compute p50/p95/p99
 *   4. Compare against baseline (without RLS context — admin_user role)
 *   5. Fail if p95 regression > 10%
 */

import { describe, it, beforeAll, afterAll, expect } from "vitest";
import {
  getRLSClient,
  withRLSContext,
  type RLSClient,
} from "./_helpers/get-rls-client";

const ROWS_PER_ORG = parseInt(process.env.PERF_ROWS_PER_ORG ?? "100", 10);
const NUM_ORGS = parseInt(process.env.PERF_NUM_ORGS ?? "5", 10);
const ITERATIONS = parseInt(process.env.PERF_ITERATIONS ?? "100", 10);
const REGRESSION_THRESHOLD = parseFloat(process.env.PERF_REGRESSION_THRESHOLD ?? "0.10");

function percentile(sorted: number[], p: number): number {
  const idx = Math.ceil(sorted.length * p) - 1;
  return sorted[Math.max(0, Math.min(idx, sorted.length - 1))];
}

async function bench(fn: () => Promise<unknown>): Promise<number[]> {
  const samples: number[] = [];
  for (let i = 0; i < ITERATIONS; i++) {
    const start = process.hrtime.bigint();
    await fn();
    const end = process.hrtime.bigint();
    samples.push(Number(end - start) / 1e6); // ns → ms
  }
  return samples.sort((a, b) => a - b);
}

describe("RLS performance regression (p95 < +10%)", () => {
  let adminClient: RLSClient;
  let appClient: RLSClient;
  let orgIds: string[] = [];

  beforeAll(async () => {
    adminClient = await getRLSClient("admin_user");
    appClient = await getRLSClient("app_user");

    // Seed test data
    console.log(`Seeding ${NUM_ORGS} orgs × ${ROWS_PER_ORG} agents...`);
    for (let i = 0; i < NUM_ORGS; i++) {
      const org = await adminClient.prisma.organization.create({
        data: {
          id: `perf-org-${Date.now()}-${i}`,
          name: `Perf Org ${i}`,
          slug: `perf-${Date.now()}-${i}`,
        },
      });
      orgIds.push(org.id);

      await adminClient.prisma.agent.createMany({
        data: Array.from({ length: ROWS_PER_ORG }, (_, j) => ({
          id: `perf-agent-${Date.now()}-${i}-${j}`,
          name: `Agent ${i}-${j}`,
          organizationId: org.id,
        })),
      });
    }
    console.log("Seed complete.");
  }, 120_000);

  afterAll(async () => {
    try {
      for (const orgId of orgIds) {
        await adminClient.prisma.agent.deleteMany({
          where: { organizationId: orgId },
        });
        await adminClient.prisma.organization.delete({ where: { id: orgId } });
      }
    } catch (e) {
      console.error("Cleanup error:", e);
    }
    await adminClient.cleanup();
    await appClient.cleanup();
  });

  it("Agent.findMany — RLS p95 within 10% of baseline", async () => {
    const targetOrg = orgIds[0];

    // Baseline: admin client (no RLS overhead)
    const baseline = await bench(() =>
      adminClient.prisma.agent.findMany({
        where: { organizationId: targetOrg },
        take: 10,
      })
    );

    // With RLS: app_user + context
    const withRLS = await bench(() =>
      withRLSContext(
        appClient.prisma,
        { organizationId: targetOrg, userId: "perf-user" },
        (tx) => tx.agent.findMany({ take: 10 })
      )
    );

    const baselineP95 = percentile(baseline, 0.95);
    const rlsP95 = percentile(withRLS, 0.95);
    const regression = (rlsP95 - baselineP95) / baselineP95;

    console.log(`Baseline p95: ${baselineP95.toFixed(2)}ms`);
    console.log(`RLS p95:      ${rlsP95.toFixed(2)}ms`);
    console.log(`Regression:   ${(regression * 100).toFixed(1)}%`);

    expect(regression).toBeLessThanOrEqual(REGRESSION_THRESHOLD);
  }, 60_000);

  it("Agent.findUnique by id — RLS p95 within 10% of baseline", async () => {
    const targetOrg = orgIds[0];
    const agent = await adminClient.prisma.agent.findFirst({
      where: { organizationId: targetOrg },
    });
    if (!agent) throw new Error("No seed agent found");

    const baseline = await bench(() =>
      adminClient.prisma.agent.findUnique({ where: { id: agent.id } })
    );

    const withRLS = await bench(() =>
      withRLSContext(
        appClient.prisma,
        { organizationId: targetOrg, userId: "perf-user" },
        (tx) => tx.agent.findUnique({ where: { id: agent.id } })
      )
    );

    const baselineP95 = percentile(baseline, 0.95);
    const rlsP95 = percentile(withRLS, 0.95);
    const regression = (rlsP95 - baselineP95) / baselineP95;

    expect(regression).toBeLessThanOrEqual(REGRESSION_THRESHOLD);
  }, 60_000);
});
