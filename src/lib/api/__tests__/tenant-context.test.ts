import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: { $transaction: vi.fn(), agent: {} },
}));

vi.mock("@/lib/db/rls-middleware", () => ({
  withOrgContext: vi.fn(),
}));

vi.mock("@/lib/context/org-context", () => ({
  getCurrentOrgId: vi.fn().mockReturnValue(null),
}));

import { prisma } from "@/lib/prisma";
import { withOrgContext } from "@/lib/db/rls-middleware";
import { getCurrentOrgId } from "@/lib/context/org-context";
import { withTenant, withAdminBypass } from "../tenant-context";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(withOrgContext).mockImplementation((_client, _orgId, fn) =>
    fn({} as never),
  );
});

describe("withTenant", () => {
  it("delegates to withOrgContext with the current ALS org ID", async () => {
    vi.mocked(getCurrentOrgId).mockReturnValue("org-abc");
    const fn = vi.fn().mockResolvedValue("result");

    await withTenant(fn);

    expect(withOrgContext).toHaveBeenCalledWith(prisma, "org-abc", fn);
  });

  it("passes null orgId when ALS has no context", async () => {
    vi.mocked(getCurrentOrgId).mockReturnValue(null);
    const fn = vi.fn().mockResolvedValue("result");

    await withTenant(fn);

    expect(withOrgContext).toHaveBeenCalledWith(prisma, null, fn);
  });

  it("returns the value from the inner function", async () => {
    vi.mocked(getCurrentOrgId).mockReturnValue("org-123");
    vi.mocked(withOrgContext).mockResolvedValue("payload");

    const result = await withTenant(vi.fn());

    expect(result).toBe("payload");
  });
});

describe("withAdminBypass", () => {
  it("calls the function with the prisma instance directly", async () => {
    const fn = vi.fn().mockResolvedValue("admin-result");

    const result = await withAdminBypass(fn);

    expect(fn).toHaveBeenCalledWith(prisma);
    expect(result).toBe("admin-result");
  });

  it("does not call withOrgContext", async () => {
    await withAdminBypass(vi.fn().mockResolvedValue(undefined));

    expect(withOrgContext).not.toHaveBeenCalled();
  });
});
