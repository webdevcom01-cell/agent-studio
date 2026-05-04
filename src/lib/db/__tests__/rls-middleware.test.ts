import { describe, it, expect, vi, beforeEach } from "vitest";
import { withOrgContext, registerRLSMiddleware } from "../rls-middleware";
import type { OrgIdResolver } from "../rls-middleware";

// Minimal mock that satisfies PrismaClient usage in rls-middleware
function makeMockClient() {
  return {
    $executeRawUnsafe: vi.fn().mockResolvedValue(0),
    $use: vi.fn(),
  };
}

type MockClient = ReturnType<typeof makeMockClient>;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("withOrgContext", () => {
  it("calls set_config with the correct orgId before the callback", async () => {
    const client = makeMockClient();
    const fn = vi.fn().mockResolvedValue([]);

    await withOrgContext(client as never, "org-123", fn);

    expect(client.$executeRawUnsafe).toHaveBeenCalledOnce();
    expect(client.$executeRawUnsafe).toHaveBeenCalledWith(
      `SELECT set_config('app.current_org_id', $1, true)`,
      "org-123",
    );
  });

  it("calls set_config before the callback, not after", async () => {
    const client = makeMockClient();
    const callOrder: string[] = [];

    client.$executeRawUnsafe.mockImplementation(async () => {
      callOrder.push("set_config");
      return 0;
    });

    const fn = vi.fn().mockImplementation(async () => {
      callOrder.push("callback");
      return "result";
    });

    await withOrgContext(client as never, "org-abc", fn);

    expect(callOrder).toEqual(["set_config", "callback"]);
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

  it("passes the client instance into the callback", async () => {
    const client = makeMockClient();
    let receivedClient: unknown = null;

    await withOrgContext(client as never, "org-123", async (db) => {
      receivedClient = db;
    });

    expect(receivedClient).toBe(client);
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
