import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

const mockAuth = vi.hoisted(() => vi.fn());
const mockPrisma = vi.hoisted(() => ({
  agent: {
    findUnique: vi.fn(),
  },
}));

vi.mock("@/lib/auth", () => ({ auth: mockAuth }));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

import { requireAuth, requireAgentOwner, isAuthError } from "../auth-guard";

const VALID_CUID = "clh1234567890abcdef12345";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("requireAuth", () => {
  it("returns userId when authenticated", async () => {
    mockAuth.mockResolvedValue({ user: { id: "user1" } });

    const result = await requireAuth();

    expect(isAuthError(result)).toBe(false);
    if (!isAuthError(result)) {
      expect(result.userId).toBe("user1");
    }
  });

  it("returns 401 when no session", async () => {
    mockAuth.mockResolvedValue(null);

    const result = await requireAuth();

    expect(result).toBeInstanceOf(NextResponse);
    if (result instanceof NextResponse) {
      expect(result.status).toBe(401);
    }
  });

  it("returns 401 when session has no user id", async () => {
    mockAuth.mockResolvedValue({ user: {} });

    const result = await requireAuth();

    expect(result).toBeInstanceOf(NextResponse);
  });
});

describe("requireAgentOwner", () => {
  it("returns userId and agentId when user owns the agent", async () => {
    mockAuth.mockResolvedValue({ user: { id: "user1" } });
    mockPrisma.agent.findUnique.mockResolvedValue({ userId: "user1" });

    const result = await requireAgentOwner(VALID_CUID);

    expect(isAuthError(result)).toBe(false);
    if (!isAuthError(result)) {
      expect(result.userId).toBe("user1");
      expect(result.agentId).toBe(VALID_CUID);
    }
  });

  it("allows access to agents with null userId (unowned)", async () => {
    mockAuth.mockResolvedValue({ user: { id: "user1" } });
    mockPrisma.agent.findUnique.mockResolvedValue({ userId: null });

    const result = await requireAgentOwner(VALID_CUID);

    expect(isAuthError(result)).toBe(false);
  });

  it("returns 403 when user does not own the agent", async () => {
    mockAuth.mockResolvedValue({ user: { id: "user1" } });
    mockPrisma.agent.findUnique.mockResolvedValue({ userId: "user2" });

    const result = await requireAgentOwner(VALID_CUID);

    expect(result).toBeInstanceOf(NextResponse);
    if (result instanceof NextResponse) {
      expect(result.status).toBe(403);
    }
  });

  it("returns 404 for invalid CUID format", async () => {
    mockAuth.mockResolvedValue({ user: { id: "user1" } });

    const result = await requireAgentOwner("nonexistent");

    expect(result).toBeInstanceOf(NextResponse);
    if (result instanceof NextResponse) {
      expect(result.status).toBe(404);
    }
    expect(mockPrisma.agent.findUnique).not.toHaveBeenCalled();
  });

  it("returns 404 when agent does not exist in DB", async () => {
    mockAuth.mockResolvedValue({ user: { id: "user1" } });
    mockPrisma.agent.findUnique.mockResolvedValue(null);

    const result = await requireAgentOwner(VALID_CUID);

    expect(result).toBeInstanceOf(NextResponse);
    if (result instanceof NextResponse) {
      expect(result.status).toBe(404);
    }
  });

  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);

    const result = await requireAgentOwner(VALID_CUID);

    expect(result).toBeInstanceOf(NextResponse);
    if (result instanceof NextResponse) {
      expect(result.status).toBe(401);
    }
    expect(mockPrisma.agent.findUnique).not.toHaveBeenCalled();
  });
});

describe("isAuthError", () => {
  it("returns true for NextResponse", () => {
    expect(isAuthError(NextResponse.json({}))).toBe(true);
  });

  it("returns false for auth result", () => {
    expect(isAuthError({ userId: "u1" })).toBe(false);
  });
});
