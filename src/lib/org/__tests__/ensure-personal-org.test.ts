import { describe, it, expect, vi, beforeEach } from "vitest";

const findFirst = vi.fn();
const create = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    organizationMember: { findFirst: (...a: unknown[]) => findFirst(...a) },
    organization: { create: (...a: unknown[]) => create(...a) },
  },
  // no admin client in tests -> withAdminBypass falls back to `prisma`
  prismaAdmin: undefined,
}));

import { ensurePersonalOrg } from "../ensure-personal-org";

describe("ensurePersonalOrg", () => {
  beforeEach(() => {
    findFirst.mockReset();
    create.mockReset();
  });

  it("returns the existing org when the user already has a membership", async () => {
    findFirst.mockResolvedValueOnce({ organizationId: "org-existing" });
    const id = await ensurePersonalOrg("u1", "Alice");
    expect(id).toBe("org-existing");
    expect(create).not.toHaveBeenCalled();
  });

  it("creates a personal org (OWNER, per-user slug) when none exists", async () => {
    findFirst.mockResolvedValueOnce(null);
    create.mockResolvedValueOnce({ id: "org-new" });
    const id = await ensurePersonalOrg("u1", "Alice");
    expect(id).toBe("org-new");
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: "Alice (Personal)",
          slug: "personal-u1",
          members: { create: { userId: "u1", role: "OWNER" } },
        }),
      }),
    );
  });

  it("falls back to 'My (Personal)' when no label is given", async () => {
    findFirst.mockResolvedValueOnce(null);
    create.mockResolvedValueOnce({ id: "org-new" });
    await ensurePersonalOrg("u2");
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ name: "My (Personal)", slug: "personal-u2" }),
      }),
    );
  });

  it("re-reads the winner when a concurrent create loses the race", async () => {
    findFirst
      .mockResolvedValueOnce(null) // initial check: none
      .mockResolvedValueOnce({ organizationId: "org-raced" }); // post-conflict re-read
    create.mockRejectedValueOnce(new Error("unique constraint violation"));
    const id = await ensurePersonalOrg("u3");
    expect(id).toBe("org-raced");
  });
});
