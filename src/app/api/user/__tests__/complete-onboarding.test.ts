import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/api/auth-guard", () => ({
  requireAuth: vi.fn(),
  isAuthError: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { update: vi.fn() },
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn() },
}));

import { POST } from "../complete-onboarding/route";
import { requireAuth, isAuthError } from "@/lib/api/auth-guard";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { NextResponse } from "next/server";

const mockRequireAuth = vi.mocked(requireAuth);
const mockIsAuthError = vi.mocked(isAuthError);
const mockUserUpdate = vi.mocked(prisma.user.update);

const AUTH_RESULT = { userId: "user_abc123", apiKeyId: null, scopes: [] };

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuth.mockResolvedValue(AUTH_RESULT);
  mockIsAuthError.mockReturnValue(false);
});

describe("POST /api/user/complete-onboarding", () => {
  it("updates onboardingCompletedAt and returns success", async () => {
    mockUserUpdate.mockResolvedValue({} as never);

    const response = await POST();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ success: true, data: null });
    expect(mockUserUpdate).toHaveBeenCalledWith({
      where: { id: "user_abc123" },
      data: { onboardingCompletedAt: expect.any(Date) },
    });
  });

  it("returns 401 when not authenticated", async () => {
    const errorResponse = NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 },
    );
    mockRequireAuth.mockResolvedValue(errorResponse);
    mockIsAuthError.mockReturnValue(true);

    const response = await POST();
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toEqual({ success: false, error: "Unauthorized" });
    expect(mockUserUpdate).not.toHaveBeenCalled();
  });

  it("returns 500 when prisma update throws", async () => {
    mockUserUpdate.mockRejectedValue(new Error("DB connection lost"));

    const response = await POST();
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({ success: false, error: "Failed to complete onboarding" });
    expect(vi.mocked(logger.error)).toHaveBeenCalledWith(
      "Failed to complete onboarding",
      { userId: "user_abc123", error: expect.any(Error) },
    );
  });
});
