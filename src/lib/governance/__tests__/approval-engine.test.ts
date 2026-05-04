import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockPolicyFindFirst,
  mockPolicyFindUnique,
  mockDecisionFindFirst,
  mockDecisionFindUnique,
  mockDecisionFindMany,
  mockDecisionCreate,
  mockDecisionUpdate,
} = vi.hoisted(() => ({
  mockPolicyFindFirst: vi.fn(),
  mockPolicyFindUnique: vi.fn(),
  mockDecisionFindFirst: vi.fn(),
  mockDecisionFindUnique: vi.fn(),
  mockDecisionFindMany: vi.fn(),
  mockDecisionCreate: vi.fn(),
  mockDecisionUpdate: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    approvalPolicy: {
      findFirst: mockPolicyFindFirst,
      findUnique: mockPolicyFindUnique,
    },
    policyDecision: {
      findFirst: mockDecisionFindFirst,
      findUnique: mockDecisionFindUnique,
      findMany: mockDecisionFindMany,
      create: mockDecisionCreate,
      update: mockDecisionUpdate,
    },
  },
}));

import {
  checkPolicies,
  requestApproval,
  resolveDecision,
  processTimeouts,
  waitForDecision,
} from "../approval-engine";

const makePolicy = (overrides = {}) => ({
  id: "policy-1",
  agentId: "agent-1",
  organizationId: "org-1",
  name: "Require approval for emails",
  actionPattern: "send_email",
  approverIds: ["user-1"],
  timeoutSeconds: 3600,
  timeoutApprove: false,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

const makeDecision = (overrides = {}) => ({
  id: "decision-1",
  policyId: "policy-1",
  agentId: "agent-1",
  organizationId: "org-1",
  action: "send_email",
  context: null,
  status: "PENDING",
  resolvedBy: null,
  resolvedAt: null,
  resolverNote: null,
  expiresAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("checkPolicies", () => {
  it("returns requiresApproval=false when no matching policy", async () => {
    mockPolicyFindFirst.mockResolvedValue(null);

    const result = await checkPolicies("agent-1", "send_email");

    expect(result.requiresApproval).toBe(false);
    expect(result.policy).toBeNull();
  });

  it("returns requiresApproval=true with matching policy", async () => {
    const policy = makePolicy();
    mockPolicyFindFirst.mockResolvedValue(policy);

    const result = await checkPolicies("agent-1", "send_email");

    expect(result.requiresApproval).toBe(true);
    expect(result.policy).toEqual(policy);
    expect(mockPolicyFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          agentId: "agent-1",
          isActive: true,
          actionPattern: { in: ["send_email", "*"] },
        }),
      }),
    );
  });

  it("fails open (no approval required) when DB throws", async () => {
    mockPolicyFindFirst.mockRejectedValue(new Error("DB error"));

    const result = await checkPolicies("agent-1", "send_email");

    expect(result.requiresApproval).toBe(false);
    expect(result.policy).toBeNull();
  });
});

describe("requestApproval", () => {
  it("returns existing PENDING decision without creating a new one", async () => {
    const existing = makeDecision();
    mockDecisionFindFirst.mockResolvedValue(existing);

    const result = await requestApproval("policy-1", "agent-1", "org-1", "send_email");

    expect(result.alreadyPending).toBe(true);
    expect(result.decision).toEqual(existing);
    expect(mockDecisionCreate).not.toHaveBeenCalled();
  });

  it("creates a new decision with expiresAt when policy has timeoutSeconds", async () => {
    mockDecisionFindFirst.mockResolvedValue(null);
    mockPolicyFindUnique.mockResolvedValue(makePolicy({ timeoutSeconds: 3600 }));
    const newDecision = makeDecision({ expiresAt: new Date(Date.now() + 3600_000) });
    mockDecisionCreate.mockResolvedValue(newDecision);

    const result = await requestApproval("policy-1", "agent-1", "org-1", "send_email", { to: "boss@example.com" });

    expect(result.alreadyPending).toBe(false);
    expect(mockDecisionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          policyId: "policy-1",
          action: "send_email",
          status: "PENDING",
          expiresAt: expect.any(Date),
        }),
      }),
    );
  });

  it("creates a decision with expiresAt=null when policy has no timeout", async () => {
    mockDecisionFindFirst.mockResolvedValue(null);
    mockPolicyFindUnique.mockResolvedValue(makePolicy({ timeoutSeconds: null }));
    mockDecisionCreate.mockResolvedValue(makeDecision({ expiresAt: null }));

    await requestApproval("policy-1", "agent-1", "org-1", "send_email");

    expect(mockDecisionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ expiresAt: null }),
      }),
    );
  });

  it("throws when policy not found", async () => {
    mockDecisionFindFirst.mockResolvedValue(null);
    mockPolicyFindUnique.mockResolvedValue(null);

    await expect(requestApproval("nonexistent", "agent-1", "org-1", "send_email")).rejects.toThrow(
      "ApprovalPolicy nonexistent not found",
    );
  });
});

describe("resolveDecision", () => {
  it("resolves a PENDING decision as APPROVED", async () => {
    mockDecisionFindUnique.mockResolvedValue(makeDecision({ status: "PENDING" }));
    const resolved = makeDecision({ status: "APPROVED", resolvedBy: "user-1", resolvedAt: new Date() });
    mockDecisionUpdate.mockResolvedValue(resolved);

    const result = await resolveDecision("decision-1", "APPROVED", "user-1", "Looks good");

    expect(result.decision.status).toBe("APPROVED");
    expect(mockDecisionUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "decision-1" },
        data: expect.objectContaining({ status: "APPROVED", resolvedBy: "user-1" }),
      }),
    );
  });

  it("throws when decision is already resolved", async () => {
    mockDecisionFindUnique.mockResolvedValue(makeDecision({ status: "APPROVED" }));

    await expect(resolveDecision("decision-1", "REJECTED", "user-1")).rejects.toThrow(
      "PolicyDecision decision-1 is already APPROVED",
    );
  });

  it("throws when decision not found", async () => {
    mockDecisionFindUnique.mockResolvedValue(null);

    await expect(resolveDecision("nonexistent", "APPROVED", "user-1")).rejects.toThrow(
      "PolicyDecision nonexistent not found",
    );
  });
});

describe("processTimeouts", () => {
  it("returns zero counts when no expired decisions", async () => {
    mockDecisionFindMany.mockResolvedValue([]);

    const result = await processTimeouts();

    expect(result).toEqual({ processed: 0, approved: 0, rejected: 0 });
    expect(mockDecisionUpdate).not.toHaveBeenCalled();
  });

  it("sets status=APPROVED when policy.timeoutApprove=true", async () => {
    mockDecisionFindMany.mockResolvedValue([
      { ...makeDecision({ id: "d-1" }), policy: { timeoutApprove: true } },
    ]);
    mockDecisionUpdate.mockResolvedValue({});

    const result = await processTimeouts();

    expect(result.processed).toBe(1);
    expect(result.approved).toBe(1);
    expect(result.rejected).toBe(0);
    expect(mockDecisionUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "APPROVED" }) }),
    );
  });

  it("sets status=REJECTED when policy.timeoutApprove=false", async () => {
    mockDecisionFindMany.mockResolvedValue([
      { ...makeDecision({ id: "d-2" }), policy: { timeoutApprove: false } },
    ]);
    mockDecisionUpdate.mockResolvedValue({});

    const result = await processTimeouts();

    expect(result.processed).toBe(1);
    expect(result.approved).toBe(0);
    expect(result.rejected).toBe(1);
    expect(mockDecisionUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "REJECTED" }) }),
    );
  });

  it("counts both APPROVED and REJECTED when mixed policies", async () => {
    mockDecisionFindMany.mockResolvedValue([
      { ...makeDecision({ id: "d-1" }), policy: { timeoutApprove: true } },
      { ...makeDecision({ id: "d-2" }), policy: { timeoutApprove: false } },
    ]);
    mockDecisionUpdate.mockResolvedValue({});

    const result = await processTimeouts();

    expect(result.processed).toBe(2);
    expect(result.approved).toBe(1);
    expect(result.rejected).toBe(1);
    expect(mockDecisionUpdate).toHaveBeenCalledTimes(2);
  });
});

describe("waitForDecision", () => {
  it("returns immediately when decision is already resolved", async () => {
    const resolved = makeDecision({ status: "APPROVED" });
    mockDecisionFindUnique.mockResolvedValue(resolved);

    const result = await waitForDecision("decision-1", 5000, 10);

    expect(result.status).toBe("APPROVED");
    expect(mockDecisionFindUnique).toHaveBeenCalledTimes(1);
  });

  it("polls until decision is resolved", async () => {
    const pending = makeDecision({ status: "PENDING" });
    const resolved = makeDecision({ status: "REJECTED" });
    mockDecisionFindUnique.mockResolvedValueOnce(pending).mockResolvedValueOnce(resolved);

    const result = await waitForDecision("decision-1", 5000, 1);

    expect(result.status).toBe("REJECTED");
    expect(mockDecisionFindUnique).toHaveBeenCalledTimes(2);
  });

  it("throws when max wait time exceeded", async () => {
    mockDecisionFindUnique.mockResolvedValue(makeDecision({ status: "PENDING" }));

    await expect(waitForDecision("decision-1", 50, 10)).rejects.toThrow("waitForDecision timed out");
  });

  it("throws when decision not found", async () => {
    mockDecisionFindUnique.mockResolvedValue(null);

    await expect(waitForDecision("decision-1", 5000, 10)).rejects.toThrow("PolicyDecision decision-1 not found");
  });
});
