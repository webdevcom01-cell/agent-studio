import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockAgentFindUnique, mockAgentFindMany, mockGrantFindFirst, mockGrantCreate } = vi.hoisted(() => ({
  mockAgentFindUnique: vi.fn(),
  mockAgentFindMany: vi.fn(),
  mockGrantFindFirst: vi.fn(),
  mockGrantCreate: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    agent: { findUnique: mockAgentFindUnique, findMany: mockAgentFindMany },
    agentPermissionGrant: { findFirst: mockGrantFindFirst, create: mockGrantCreate },
  },
}));

import { getAgentAncestors, getAgentDescendants, checkA2APermission, grantPermission } from "../hierarchy";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getAgentAncestors", () => {
  it("returns empty array when agent has no parent", async () => {
    mockAgentFindUnique.mockResolvedValue({ parentAgentId: null });

    const result = await getAgentAncestors("agent-1");

    expect(result).toEqual([]);
  });

  it("returns [parentId] for a single-level hierarchy", async () => {
    mockAgentFindUnique
      .mockResolvedValueOnce({ parentAgentId: "parent-1" })
      .mockResolvedValueOnce({ parentAgentId: null });

    const result = await getAgentAncestors("agent-1");

    expect(result).toEqual(["parent-1"]);
  });

  it("returns [parentId, grandparentId] for two-level hierarchy", async () => {
    mockAgentFindUnique
      .mockResolvedValueOnce({ parentAgentId: "parent-1" })
      .mockResolvedValueOnce({ parentAgentId: "grandparent-1" })
      .mockResolvedValueOnce({ parentAgentId: null });

    const result = await getAgentAncestors("agent-1");

    expect(result).toEqual(["parent-1", "grandparent-1"]);
  });

  it("stops at maxDepth and does not infinitely recurse", async () => {
    // Always has a parent — would loop forever without depth limit
    mockAgentFindUnique.mockResolvedValue({ parentAgentId: "infinite-parent" });

    const result = await getAgentAncestors("agent-1", 3);

    expect(result).toHaveLength(3);
    expect(mockAgentFindUnique).toHaveBeenCalledTimes(3);
  });
});

describe("getAgentDescendants", () => {
  it("returns empty array when agent has no children", async () => {
    mockAgentFindMany.mockResolvedValue([]);

    const result = await getAgentDescendants("agent-1");

    expect(result).toEqual([]);
  });

  it("returns direct children", async () => {
    mockAgentFindMany
      .mockResolvedValueOnce([{ id: "child-1" }, { id: "child-2" }])
      .mockResolvedValue([]);

    const result = await getAgentDescendants("agent-1");

    expect(result).toEqual(expect.arrayContaining(["child-1", "child-2"]));
  });
});

describe("checkA2APermission", () => {
  it("returns allowed=false when no grants exist", async () => {
    mockAgentFindUnique.mockResolvedValue({ parentAgentId: "parent-1" });
    mockAgentFindUnique.mockResolvedValueOnce({ parentAgentId: "parent-1" });
    // second call: parent has no parent
    mockAgentFindUnique.mockResolvedValueOnce({ parentAgentId: "parent-1" });
    mockAgentFindUnique.mockResolvedValue({ parentAgentId: null });
    mockGrantFindFirst.mockResolvedValue(null);

    // Reset and set up clean chain
    mockAgentFindUnique.mockReset();
    mockAgentFindUnique
      .mockResolvedValueOnce({ parentAgentId: "parent-1" })
      .mockResolvedValueOnce({ parentAgentId: null });
    mockGrantFindFirst.mockResolvedValue(null);

    const result = await checkA2APermission("agent-1", "flow.execute");

    expect(result.allowed).toBe(false);
  });

  it("returns allowed=true when direct parent has granted permission", async () => {
    mockAgentFindUnique
      .mockResolvedValueOnce({ parentAgentId: "parent-1" })
      .mockResolvedValueOnce({ parentAgentId: null });
    mockGrantFindFirst.mockResolvedValue({ grantorAgentId: "parent-1" });

    const result = await checkA2APermission("agent-1", "flow.execute");

    expect(result.allowed).toBe(true);
    expect(result.grantedBy).toBe("parent-1");
  });

  it("returns allowed=true when grandparent has granted permission", async () => {
    mockAgentFindUnique
      .mockResolvedValueOnce({ parentAgentId: "parent-1" })
      .mockResolvedValueOnce({ parentAgentId: "grandparent-1" })
      .mockResolvedValueOnce({ parentAgentId: null });
    mockGrantFindFirst.mockResolvedValue({ grantorAgentId: "grandparent-1" });

    const result = await checkA2APermission("agent-1", "flow.execute");

    expect(result.allowed).toBe(true);
    expect(result.grantedBy).toBe("grandparent-1");
  });
});

describe("grantPermission", () => {
  it("throws when grantorAgentId is NOT an ancestor of granteeAgentId", async () => {
    // Agent has no parent — so "rogue-agent" is not an ancestor
    mockAgentFindUnique.mockResolvedValue({ parentAgentId: null });

    await expect(
      grantPermission("rogue-agent", "agent-1", "org-1", "flow.execute"),
    ).rejects.toThrow("ancestor");
  });

  it("creates grant when grantorAgentId IS an ancestor", async () => {
    mockAgentFindUnique
      .mockResolvedValueOnce({ parentAgentId: "parent-1" })
      .mockResolvedValueOnce({ parentAgentId: null });

    const expectedGrant = {
      id: "grant-1",
      grantorAgentId: "parent-1",
      granteeAgentId: "agent-1",
      organizationId: "org-1",
      permission: "flow.execute",
      scope: null,
      expiresAt: null,
      createdAt: new Date(),
    };
    mockGrantCreate.mockResolvedValue(expectedGrant);

    const result = await grantPermission("parent-1", "agent-1", "org-1", "flow.execute");

    expect(mockGrantCreate).toHaveBeenCalledOnce();
    expect(result.grantorAgentId).toBe("parent-1");
    expect(result.granteeAgentId).toBe("agent-1");
    expect(result.permission).toBe("flow.execute");
  });
});
