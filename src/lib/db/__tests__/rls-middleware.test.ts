import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/feature-flags", () => ({
  isFeatureEnabled: vi.fn().mockResolvedValue(true),
}));

import { isFeatureEnabled } from "@/lib/feature-flags";
import { withOrgContext, registerRLSMiddleware } from "../rls-middleware";
import type { OrgIdResolver } from "../rls-middleware";

// ---------------------------------------------------------------------------
// Mock surface
// ---------------------------------------------------------------------------
//
// withOrgContext now wraps `fn` in `client.$transaction(async (tx) => …)`,
// so the mock client must expose `$transaction` and pass back a `tx` object
// that mimics the relevant subset of Prisma.TransactionClient (`$executeRaw`,
// `$queryRaw`). The mock $transaction invokes the user callback with that tx
// and returns its result — matching Prisma's interactive-transaction shape.

function makeMockTx() {
  return {
    $executeRaw: vi.fn().mockResolvedValue(0),
    $queryRaw: vi.fn().mockResolvedValue([]),
  };
}

type MockTx = ReturnType<typeof makeMockTx>;

function makeMockClient(tx: MockTx = makeMockTx()) {
  return {
    // Mock $transaction simulates Prisma's interactive transaction:
    // call the user callback with `tx`, return whatever the callback returns.
    $transaction: vi.fn(async (fn: (tx: MockTx) => Promise<unknown>) => fn(tx)),
    // $executeRawUnsafe + $use are kept on the outer client for the
    // legacy registerRLSMiddleware tests below — they must NOT be used
    // by the new withOrgContext path.
    $executeRawUnsafe: vi.fn().mockResolvedValue(0),
    $use: vi.fn(),
    _tx: tx,
  };
}

type MockClient = ReturnType<typeof makeMockClient>;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(isFeatureEnabled).mockResolvedValue(true);
});

describe("withOrgContext", () => {
  it("opens a $transaction with the documented options", async () => {
    const client = makeMockClient();

    await withOrgContext(client as never, "org-123", async () => "ok");

    expect(client.$transaction).toHaveBeenCalledOnce();
    // Second arg is the options bag — verify isolation level + bounds.
    const [, opts] = client.$transaction.mock.calls[0];
    expect(opts).toMatchObject({
      isolationLevel: "ReadCommitted",
      maxWait: 5000,
      timeout: 30000,
    });
  });

  it("calls set_config on the tx (not the outer client) before the callback", async () => {
    const client = makeMockClient();
    const callOrder: string[] = [];

    client._tx.$executeRaw.mockImplementation(async () => {
      callOrder.push("set_config");
      return 0;
    });

    const fn = vi.fn().mockImplementation(async () => {
      callOrder.push("callback");
      return "result";
    });

    await withOrgContext(client as never, "org-abc", fn);

    // Order is: set_config inside the tx, then user callback.
    expect(callOrder).toEqual(["set_config", "callback"]);

    // The legacy outer-client path must NOT be used by the new implementation.
    expect(client.$executeRawUnsafe).not.toHaveBeenCalled();

    // set_config used the tx, with the orgId interpolated via tagged template.
    expect(client._tx.$executeRaw).toHaveBeenCalledOnce();
    const firstArg = client._tx.$executeRaw.mock.calls[0][0];
    // Tagged template gives Prisma a TemplateStringsArray; verify the static
    // fragments contain the right SQL skeleton.
    expect(Array.isArray(firstArg)).toBe(true);
    expect((firstArg as readonly string[]).join("")).toContain(
      "SELECT set_config('app.current_org_id'",
    );
    // The interpolated value (orgId) is passed as the second tagged-template arg.
    expect(client._tx.$executeRaw.mock.calls[0][1]).toBe("org-abc");
  });

  it("passes the tx (NOT the outer client) into the callback", async () => {
    const client = makeMockClient();
    let receivedClient: unknown = null;

    await withOrgContext(client as never, "org-123", async (db) => {
      receivedClient = db;
    });

    // This is the regression guard against the pre-fix pool-leak bug:
    // the callback must run against the transaction client, never the outer
    // pooled client. If anyone refactors back to `return fn(client)`, this
    // assertion fails immediately.
    expect(receivedClient).toBe(client._tx);
    expect(receivedClient).not.toBe(client);
  });

  it("returns the value from the callback", async () => {
    const client = makeMockClient();
    const expected = [{ id: "agent-1" }, { id: "agent-2" }];

    const result = await withOrgContext(
      client as never,
      "org-123",
      async () => expected,
    );

    expect(result).toBe(expected);
  });

  it("propagates errors thrown inside the callback", async () => {
    const client = makeMockClient();
    const boom = new Error("DB exploded");

    await expect(
      withOrgContext(client as never, "org-123", async () => {
        throw boom;
      }),
    ).rejects.toThrow("DB exploded");
  });

  // ---------------------------------------------------------------------------
  // Integration coverage gap — see PLAN-V2 §4.1 test plan
  // ---------------------------------------------------------------------------
  //
  // The unit tests above verify the SHAPE of the fix (set_config runs inside
  // $transaction, callback receives the tx, options are correct). They CANNOT
  // verify the underlying bug — that the session variable survives across
  // multiple queries on the same pooled connection — because the bug only
  // manifests against a real Postgres connection pool.
  //
  // TODO(rls-phase-1): wire this against the real DB harness once Phase 1
  // brings up an integration test infra (see skill-rls-rollout-PLAN-V2.md
  // §12.4 cross-tenant test pseudocode).
  it.skip("integration: session variable persists within transaction across queries (real Postgres)", async () => {
    // Pseudo-code for when the harness exists:
    //   await withOrgContext(realPrisma, "test-org-123", async (tx) => {
    //     const before = await tx.$queryRaw<{ val: string }[]>`
    //       SELECT current_setting('app.current_org_id', true) AS val`;
    //     expect(before[0].val).toBe("test-org-123");
    //     await tx.agent.findMany();
    //     const after = await tx.$queryRaw<{ val: string }[]>`
    //       SELECT current_setting('app.current_org_id', true) AS val`;
    //     expect(after[0].val).toBe("test-org-123");
    //   });
  });
});

describe("withOrgContext — rls-enforcement flag off (bypass path)", () => {
  beforeEach(() => {
    vi.mocked(isFeatureEnabled).mockResolvedValue(false);
  });

  it("does not open a $transaction when flag is off", async () => {
    const client = makeMockClient();
    await withOrgContext(client as never, "org-123", async () => "ok");
    expect(client.$transaction).not.toHaveBeenCalled();
  });

  it("passes the outer client directly to the callback", async () => {
    const client = makeMockClient();
    let received: unknown = null;

    await withOrgContext(client as never, "org-123", async (db) => {
      received = db;
    });

    expect(received).toBe(client);
  });

  it("returns the callback value without enforcement", async () => {
    const client = makeMockClient();
    const result = await withOrgContext(
      client as never,
      "org-123",
      async () => "bypass-result",
    );
    expect(result).toBe("bypass-result");
  });

  it("does not call set_config when flag is off", async () => {
    const client = makeMockClient();
    await withOrgContext(client as never, "org-123", async () => undefined);
    expect(client._tx.$executeRaw).not.toHaveBeenCalled();
  });
});

describe("registerRLSMiddleware", () => {
  it("registers a middleware via $use when orgId resolver returns non-null", async () => {
    const client = makeMockClient();
    const getOrgId: OrgIdResolver = () => "org-xyz";

    registerRLSMiddleware(client as never, getOrgId);

    expect(client.$use).toHaveBeenCalledOnce();

    // Extract and invoke the registered middleware to verify set_config is called
    const middleware = (client.$use as MockClient["$use"]).mock.calls[0][0] as (
      params: Record<string, unknown>,
      next: (p: Record<string, unknown>) => Promise<unknown>,
    ) => Promise<unknown>;

    const next = vi.fn().mockResolvedValue("ok");
    await middleware({}, next);

    expect(client.$executeRawUnsafe).toHaveBeenCalledWith(
      `SELECT set_config('app.current_org_id', $1, true)`,
      "org-xyz",
    );
    expect(next).toHaveBeenCalledOnce();
  });

  it("skips set_config when orgId resolver returns null", async () => {
    const client = makeMockClient();
    const getOrgId: OrgIdResolver = () => null;

    registerRLSMiddleware(client as never, getOrgId);

    const middleware = (client.$use as MockClient["$use"]).mock.calls[0][0] as (
      params: Record<string, unknown>,
      next: (p: Record<string, unknown>) => Promise<unknown>,
    ) => Promise<unknown>;

    const next = vi.fn().mockResolvedValue("ok");
    await middleware({}, next);

    expect(client.$executeRawUnsafe).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledOnce();
  });

  it("does not throw when client has no $use (Prisma v6 production client)", () => {
    const clientWithoutUse = {
      $executeRawUnsafe: vi.fn().mockResolvedValue(0),
      // no $use
    };

    expect(() =>
      registerRLSMiddleware(clientWithoutUse as never, () => "org-1"),
    ).not.toThrow();
  });
});
