import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return {
    ...actual,
    after: vi.fn(),
  };
});

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRaw: vi.fn(),
    $executeRaw: vi.fn(),
    cLIGeneration: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, remaining: 4 }),
}));

vi.mock("@/lib/cli-generator/executor", () => ({
  startExecution: vi.fn().mockResolvedValue(undefined),
  cancelExecution: vi.fn().mockReturnValue(false),
}));

vi.mock("@/lib/cli-generator/pipeline", () => ({
  createInitialPhases: vi.fn().mockReturnValue([]),
}));

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";

const mockAuth = vi.mocked(auth);
const mockQueryRaw = vi.mocked(prisma.$queryRaw);
const mockExecuteRaw = vi.mocked(prisma.$executeRaw);
const mockFindMany = vi.mocked(prisma.cLIGeneration.findMany);
const mockFindUnique = vi.mocked(prisma.cLIGeneration.findUnique);
const mockCount = vi.mocked(prisma.cLIGeneration.count);
const mockCreate = vi.mocked(prisma.cLIGeneration.create);
const mockDelete = vi.mocked(prisma.cLIGeneration.delete);
const mockRateLimit = vi.mocked(checkRateLimit);

function mockRequest(body?: unknown): Request {
  return new Request("http://localhost/api/cli-generator", {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe("CLI Generator API routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({
      user: { id: "user-1", email: "test@test.com" },
      expires: "2099-01-01",
    } as Awaited<ReturnType<typeof auth>>);
  });

  describe("GET /api/cli-generator", () => {
    it("returns 401 when unauthenticated", async () => {
      mockAuth.mockResolvedValueOnce(null);

      const { GET } = await import("../route");
      const res = await GET();
      expect(res.status).toBe(401);
    });

    it("returns list of generations", async () => {
      const generations = [
        { id: "gen-1", applicationName: "Blender", target: "python", status: "COMPLETED" },
      ];
      mockFindMany.mockResolvedValueOnce(generations as never);

      const { GET } = await import("../route");
      const res = await GET();
      const json = await res.json();

      expect(json.success).toBe(true);
      expect(json.data).toEqual(generations);
    });
  });

  describe("POST /api/cli-generator", () => {
    it("returns 401 when unauthenticated", async () => {
      mockAuth.mockResolvedValueOnce(null);

      const { POST } = await import("../route");
      const req = mockRequest({ applicationName: "Test" });
      const res = await POST(req as never);
      expect(res.status).toBe(401);
    });

    it("returns 400 for missing applicationName", async () => {
      const { POST } = await import("../route");
      const req = mockRequest({});
      const res = await POST(req as never);
      expect(res.status).toBe(400);
    });

    it("returns 429 when rate limited", async () => {
      mockRateLimit.mockReturnValueOnce({
        allowed: false,
        remaining: 0,
        retryAfter: 60,
      });

      const { POST } = await import("../route");
      const req = mockRequest({ applicationName: "App" });
      const res = await POST(req as never);
      expect(res.status).toBe(429);
    });

    it("returns 403 when limit reached", async () => {
      mockCount.mockResolvedValueOnce(50);

      const { POST } = await import("../route");
      const req = mockRequest({ applicationName: "App" });
      const res = await POST(req as never);
      expect(res.status).toBe(403);
    });

    it("creates generation successfully", async () => {
      mockCount.mockResolvedValueOnce(0);
      const created = {
        id: "gen-new",
        applicationName: "Blender",
        target: "python",
        status: "PENDING",
        currentPhase: 0,
        phases: [],
      };
      mockCreate.mockResolvedValueOnce(created as never);

      const { POST } = await import("../route");
      const req = mockRequest({
        applicationName: "Blender",
        capabilities: ["render"],
      });
      const res = await POST(req as never);
      const json = await res.json();

      expect(res.status).toBe(201);
      expect(json.success).toBe(true);
      expect(json.data.applicationName).toBe("Blender");
    });

    it("validates applicationName max length", async () => {
      const { POST } = await import("../route");
      const req = mockRequest({
        applicationName: "x".repeat(101),
      });
      const res = await POST(req as never);
      expect(res.status).toBe(400);
    });
  });

  describe("GET /api/cli-generator/[generationId]", () => {
    it("returns 404 for invalid id", async () => {
      const { GET } = await import("../[generationId]/route");
      const req = new Request("http://localhost/api/cli-generator/invalid");
      const res = await GET(req as never, {
        params: Promise.resolve({ generationId: "invalid" }),
      });
      expect(res.status).toBe(404);
    });

    it("returns 404 when not found", async () => {
      mockFindUnique.mockResolvedValueOnce(null);

      const { GET } = await import("../[generationId]/route");
      const req = new Request("http://localhost/api/cli-generator/clxtest123456789012345");
      const res = await GET(req as never, {
        params: Promise.resolve({ generationId: "clxtest123456789012345" }),
      });
      expect(res.status).toBe(404);
    });

    it("returns 403 for wrong user", async () => {
      mockFindUnique.mockResolvedValueOnce({
        id: "clxtest123456789012345",
        userId: "other-user",
      } as never);

      const { GET } = await import("../[generationId]/route");
      const req = new Request("http://localhost/api/cli-generator/clxtest123456789012345");
      const res = await GET(req as never, {
        params: Promise.resolve({ generationId: "clxtest123456789012345" }),
      });
      expect(res.status).toBe(403);
    });

    it("returns generation details", async () => {
      const gen = {
        id: "clxtest123456789012345",
        userId: "user-1",
        applicationName: "Blender",
        status: "COMPLETED",
      };
      mockFindUnique.mockResolvedValueOnce(gen as never);

      const { GET } = await import("../[generationId]/route");
      const req = new Request("http://localhost/api/cli-generator/clxtest123456789012345");
      const res = await GET(req as never, {
        params: Promise.resolve({ generationId: "clxtest123456789012345" }),
      });
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.applicationName).toBe("Blender");
    });
  });

  describe("DELETE /api/cli-generator/[generationId]", () => {
    it("returns 404 when not found", async () => {
      mockFindUnique.mockResolvedValueOnce(null);

      const { DELETE } = await import("../[generationId]/route");
      const req = new Request("http://localhost/api/cli-generator/clxtest123456789012345", {
        method: "DELETE",
      });
      const res = await DELETE(req as never, {
        params: Promise.resolve({ generationId: "clxtest123456789012345" }),
      });
      expect(res.status).toBe(404);
    });

    it("returns 403 for wrong user", async () => {
      mockFindUnique.mockResolvedValueOnce({
        userId: "other-user",
        status: "PENDING",
      } as never);

      const { DELETE } = await import("../[generationId]/route");
      const req = new Request("http://localhost/api/cli-generator/clxtest123456789012345", {
        method: "DELETE",
      });
      const res = await DELETE(req as never, {
        params: Promise.resolve({ generationId: "clxtest123456789012345" }),
      });
      expect(res.status).toBe(403);
    });

    it("deletes generation successfully", async () => {
      mockFindUnique.mockResolvedValueOnce({
        userId: "user-1",
        status: "COMPLETED",
      } as never);
      mockDelete.mockResolvedValueOnce({} as never);

      const { DELETE } = await import("../[generationId]/route");
      const req = new Request("http://localhost/api/cli-generator/clxtest123456789012345", {
        method: "DELETE",
      });
      const res = await DELETE(req as never, {
        params: Promise.resolve({ generationId: "clxtest123456789012345" }),
      });
      const json = await res.json();
      expect(json.success).toBe(true);
    });
  });

  describe("GET /api/cli-generator/[generationId]/logs", () => {
    it("returns phase logs", async () => {
      const phases = [
        { phase: 0, name: "analyze", status: "completed" },
      ];
      mockFindUnique.mockResolvedValueOnce({
        userId: "user-1",
        phases,
        currentPhase: 0,
        status: "ANALYZING",
        errorMessage: null,
      } as never);

      const { GET } = await import("../[generationId]/logs/route");
      const req = new Request("http://localhost/api/cli-generator/clxtest123456789012345/logs");
      const res = await GET(req as never, {
        params: Promise.resolve({ generationId: "clxtest123456789012345" }),
      });
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.phases).toEqual(phases);
    });

    it("returns 403 for wrong user", async () => {
      mockFindUnique.mockResolvedValueOnce({
        userId: "other-user",
        phases: [],
      } as never);

      const { GET } = await import("../[generationId]/logs/route");
      const req = new Request("http://localhost/api/cli-generator/clxtest123456789012345/logs");
      const res = await GET(req as never, {
        params: Promise.resolve({ generationId: "clxtest123456789012345" }),
      });
      expect(res.status).toBe(403);
    });
  });
});
