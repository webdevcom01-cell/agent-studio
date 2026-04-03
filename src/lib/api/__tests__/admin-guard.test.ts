/**
 * Tests for requireAdmin() — the admin-level auth guard added in 6.2.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextResponse } from "next/server";

const mockAuth = vi.hoisted(() => vi.fn());
const mockValidateApiKey = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth", () => ({ auth: mockAuth }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/api/api-key", () => ({ validateApiKey: mockValidateApiKey }));
// next/headers is used by requireAuth when no req is passed
vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue({ get: () => null }),
}));

import { requireAdmin, isAuthError } from "../auth-guard";

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.ADMIN_USER_IDS;
});

afterEach(() => {
  delete process.env.ADMIN_USER_IDS;
});

describe("requireAdmin()", () => {
  it("allows any authenticated user when ADMIN_USER_IDS is not configured", async () => {
    mockAuth.mockResolvedValue({ user: { id: "user-123" } });
    // ADMIN_USER_IDS is unset (deleted in beforeEach)

    const result = await requireAdmin();

    expect(isAuthError(result)).toBe(false);
    if (!isAuthError(result)) {
      expect(result.userId).toBe("user-123");
    }
  });

  it("allows access when userId is in ADMIN_USER_IDS list", async () => {
    process.env.ADMIN_USER_IDS = "admin-1,admin-2,admin-3";
    mockAuth.mockResolvedValue({ user: { id: "admin-2" } });

    const result = await requireAdmin();

    expect(isAuthError(result)).toBe(false);
    if (!isAuthError(result)) {
      expect(result.userId).toBe("admin-2");
    }
  });

  it("returns 403 when userId is NOT in ADMIN_USER_IDS list", async () => {
    process.env.ADMIN_USER_IDS = "admin-1,admin-2";
    mockAuth.mockResolvedValue({ user: { id: "regular-user" } });

    const result = await requireAdmin();

    expect(result).toBeInstanceOf(NextResponse);
    if (result instanceof NextResponse) {
      expect(result.status).toBe(403);
      const body = await result.json() as { success: boolean; error: string };
      expect(body.success).toBe(false);
      expect(body.error).toMatch(/admin/i);
    }
  });
});
