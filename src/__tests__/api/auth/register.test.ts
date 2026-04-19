/**
 * Tests for POST /api/auth/register
 *
 * Covers:
 *   1. Zod validation — missing/invalid fields return 422
 *   2. Duplicate email — returns 409
 *   3. Happy path — creates user, returns 201 with userId
 *   4. bcrypt hash is stored, not plaintext
 *   5. Prisma failure — returns 500
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Mocks — hoisted
// ---------------------------------------------------------------------------

const mockFindUnique = vi.hoisted(() => vi.fn());
const mockCreate = vi.hoisted(() => vi.fn());
const mockHash = vi.hoisted(() => vi.fn());
const mockLogger = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: mockFindUnique,
      create: mockCreate,
    },
  },
}));

vi.mock("bcryptjs", () => ({
  hash: mockHash,
}));

vi.mock("@/lib/logger", () => ({ logger: mockLogger }));

// ---------------------------------------------------------------------------
// Import under test (after mocks)
// ---------------------------------------------------------------------------

import { POST } from "@/app/api/auth/register/route";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockHash.mockResolvedValue("$2b$12$hashedpassword");
  mockFindUnique.mockResolvedValue(null); // no existing user by default
  mockCreate.mockResolvedValue({ id: "user-123", email: "test@example.com", name: null });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /api/auth/register", () => {
  describe("Validation (422)", () => {
    it("returns 422 for missing email", async () => {
      const req = makeRequest({ password: "password123" });
      const res = await POST(req);
      expect(res.status).toBe(422);
      const body = await res.json() as { success: boolean; error: string };
      expect(body.success).toBe(false);
      expect(body.error).toBeTruthy();
    });

    it("returns 422 for invalid email format", async () => {
      const req = makeRequest({ email: "not-an-email", password: "password123" });
      const res = await POST(req);
      expect(res.status).toBe(422);
      const body = await res.json() as { success: boolean; error: string };
      expect(body.success).toBe(false);
    });

    it("returns 422 for missing password", async () => {
      const req = makeRequest({ email: "test@example.com" });
      const res = await POST(req);
      expect(res.status).toBe(422);
    });

    it("returns 422 for password shorter than 8 chars", async () => {
      const req = makeRequest({ email: "test@example.com", password: "short" });
      const res = await POST(req);
      expect(res.status).toBe(422);
      const body = await res.json() as { success: boolean; error: string };
      expect(body.error).toContain("8 characters");
    });

    it("returns 422 for empty body", async () => {
      const req = makeRequest({});
      const res = await POST(req);
      expect(res.status).toBe(422);
    });
  });

  describe("Duplicate email (409)", () => {
    it("returns 409 when email already exists", async () => {
      mockFindUnique.mockResolvedValue({ id: "existing-user" });

      const req = makeRequest({ email: "taken@example.com", password: "password123" });
      const res = await POST(req);

      expect(res.status).toBe(409);
      const body = await res.json() as { success: boolean; error: string };
      expect(body.success).toBe(false);
      expect(body.error).toContain("already exists");
    });

    it("normalises email to lowercase before checking duplicates", async () => {
      const req = makeRequest({ email: "Test@Example.COM", password: "password123" });
      await POST(req);

      expect(mockFindUnique).toHaveBeenCalledWith({
        where: { email: "test@example.com" },
        select: { id: true },
      });
    });
  });

  describe("Happy path (201)", () => {
    it("creates user and returns 201 with userId", async () => {
      const req = makeRequest({ email: "new@example.com", password: "securepassword" });
      const res = await POST(req);

      expect(res.status).toBe(201);
      const body = await res.json() as { success: boolean; data: { userId: string } };
      expect(body.success).toBe(true);
      expect(body.data.userId).toBe("user-123");
    });

    it("hashes the password with bcrypt cost 12 before storing", async () => {
      const req = makeRequest({ email: "new@example.com", password: "mypassword" });
      await POST(req);

      expect(mockHash).toHaveBeenCalledWith("mypassword", 12);
    });

    it("stores the bcrypt hash, not plaintext, in user.create", async () => {
      const req = makeRequest({ email: "new@example.com", password: "mypassword" });
      await POST(req);

      const createCall = mockCreate.mock.calls[0]?.[0] as { data: { password: string } };
      expect(createCall.data.password).toBe("$2b$12$hashedpassword"); // the mocked hash
      expect(createCall.data.password).not.toBe("mypassword");
    });

    it("stores optional name when provided", async () => {
      const req = makeRequest({ email: "new@example.com", password: "mypassword", name: "Alice" });
      await POST(req);

      const createCall = mockCreate.mock.calls[0]?.[0] as { data: { name: string } };
      expect(createCall.data.name).toBe("Alice");
    });

    it("logs the registration event", async () => {
      const req = makeRequest({ email: "new@example.com", password: "mypassword" });
      await POST(req);

      expect(mockLogger.info).toHaveBeenCalledWith(
        "User registered via email/password",
        expect.objectContaining({ userId: "user-123" }),
      );
    });
  });

  describe("Error handling (500)", () => {
    it("returns 500 when prisma.create throws", async () => {
      mockCreate.mockRejectedValue(new Error("DB connection failed"));

      const req = makeRequest({ email: "new@example.com", password: "mypassword" });
      const res = await POST(req);

      expect(res.status).toBe(500);
      const body = await res.json() as { success: boolean; error: string };
      expect(body.success).toBe(false);
      expect(body.error).not.toContain("DB connection failed"); // don't leak internals
    });

    it("logs the error on failure", async () => {
      mockCreate.mockRejectedValue(new Error("DB error"));

      const req = makeRequest({ email: "new@example.com", password: "mypassword" });
      await POST(req);

      expect(mockLogger.error).toHaveBeenCalled();
    });
  });
});
