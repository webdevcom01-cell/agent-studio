import { describe, it, expect, vi, beforeEach } from "vitest";

const mockAuth = vi.fn();
const mockFindUnique = vi.fn();

vi.mock("@/lib/auth", () => ({
  auth: () => mockAuth(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    organizationMember: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
    },
    agent: {
      findUnique: vi.fn(),
    },
  },
}));

import { requireOrgMember, requireOrgAdmin, requireOrgOwner, isAuthError } from "../auth-guard";

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue({ user: { id: "user-1" } });
});

describe("requireOrgMember", () => {
  it("returns member result when user belongs to org", async () => {
    mockFindUnique.mockResolvedValueOnce({ role: "MEMBER" });

    const result = await requireOrgMember("org-1");
    expect(isAuthError(result)).toBe(false);
    if (!isAuthError(result)) {
      expect(result.organizationId).toBe("org-1");
      expect(result.role).toBe("MEMBER");
    }
  });

  it("returns 403 when user is not a member", async () => {
    mockFindUnique.mockResolvedValueOnce(null);

    const result = await requireOrgMember("org-1");
    expect(isAuthError(result)).toBe(true);
  });

  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);

    const result = await requireOrgMember("org-1");
    expect(isAuthError(result)).toBe(true);
  });
});

describe("requireOrgAdmin", () => {
  it("allows ADMIN role", async () => {
    mockFindUnique.mockResolvedValueOnce({ role: "ADMIN" });

    const result = await requireOrgAdmin("org-1");
    expect(isAuthError(result)).toBe(false);
  });

  it("allows OWNER role", async () => {
    mockFindUnique.mockResolvedValueOnce({ role: "OWNER" });

    const result = await requireOrgAdmin("org-1");
    expect(isAuthError(result)).toBe(false);
  });

  it("rejects MEMBER role", async () => {
    mockFindUnique.mockResolvedValueOnce({ role: "MEMBER" });

    const result = await requireOrgAdmin("org-1");
    expect(isAuthError(result)).toBe(true);
  });

  it("rejects VIEWER role", async () => {
    mockFindUnique.mockResolvedValueOnce({ role: "VIEWER" });

    const result = await requireOrgAdmin("org-1");
    expect(isAuthError(result)).toBe(true);
  });
});

describe("requireOrgOwner", () => {
  it("allows OWNER role only", async () => {
    mockFindUnique.mockResolvedValueOnce({ role: "OWNER" });

    const result = await requireOrgOwner("org-1");
    expect(isAuthError(result)).toBe(false);
  });

  it("rejects ADMIN role", async () => {
    mockFindUnique.mockResolvedValueOnce({ role: "ADMIN" });

    const result = await requireOrgOwner("org-1");
    expect(isAuthError(result)).toBe(true);
  });
});
