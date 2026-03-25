import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    cLIGeneration: {
      findUnique: vi.fn(),
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

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const mockAuth = vi.mocked(auth);
const mockFindUnique = vi.mocked(prisma.cLIGeneration.findUnique);
const mockUpdate = vi.mocked(prisma.cLIGeneration.update);

// Import the constant from types so the threshold stays in sync
import { STUCK_THRESHOLD_MS } from "@/lib/cli-generator/types";

/** A updatedAt timestamp that is older than STUCK_THRESHOLD_MS (stuck). */
function stuckDate(): string {
  return new Date(Date.now() - STUCK_THRESHOLD_MS - 10_000).toISOString();
}

/** A updatedAt timestamp that is very recent (not stuck). */
function recentDate(): string {
  return new Date(Date.now() - 30_000).toISOString();
}

function mockRequest(): Request {
  return new Request(
    "http://localhost/api/cli-generator/clxtest123456789012345/resume",
    { method: "POST" },
  );
}

describe("POST /api/cli-generator/[generationId]/resume", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({
      user: { id: "user-1", email: "test@test.com" },
      expires: "2099-01-01",
    } as Awaited<ReturnType<typeof auth>>);
  });

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);

    const { POST } = await import("../[generationId]/resume/route");
    const res = await POST(mockRequest() as never, {
      params: Promise.resolve({ generationId: "clxtest123456789012345" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 404 when generation not found", async () => {
    mockFindUnique.mockResolvedValueOnce(null);

    const { POST } = await import("../[generationId]/resume/route");
    const res = await POST(mockRequest() as never, {
      params: Promise.resolve({ generationId: "clxtest123456789012345" }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 403 when owned by another user", async () => {
    mockFindUnique.mockResolvedValueOnce({
      id: "clxtest123456789012345",
      userId: "other-user",
      status: "FAILED",
      updatedAt: new Date(stuckDate()),
      phases: [],
    } as never);

    const { POST } = await import("../[generationId]/resume/route");
    const res = await POST(mockRequest() as never, {
      params: Promise.resolve({ generationId: "clxtest123456789012345" }),
    });
    expect(res.status).toBe(403);
  });

  it("returns 409 when generation is COMPLETED", async () => {
    mockFindUnique.mockResolvedValueOnce({
      id: "clxtest123456789012345",
      userId: "user-1",
      status: "COMPLETED",
      updatedAt: new Date(recentDate()),
      phases: [],
    } as never);

    const { POST } = await import("../[generationId]/resume/route");
    const res = await POST(mockRequest() as never, {
      params: Promise.resolve({ generationId: "clxtest123456789012345" }),
    });
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toContain("already completed");
  });

  it("returns 409 when generation is actively running (not stuck, not failed)", async () => {
    mockFindUnique.mockResolvedValueOnce({
      id: "clxtest123456789012345",
      userId: "user-1",
      status: "ANALYZING",
      updatedAt: new Date(recentDate()),
      phases: [{ phase: 0, name: "analyze", status: "running" }],
    } as never);

    const { POST } = await import("../[generationId]/resume/route");
    const res = await POST(mockRequest() as never, {
      params: Promise.resolve({ generationId: "clxtest123456789012345" }),
    });
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toContain("actively running");
  });

  it("resumes a FAILED generation — resets failed phase to pending", async () => {
    const phases = [
      { phase: 0, name: "analyze", status: "completed", output: { detectedCLIPaths: [] } },
      { phase: 1, name: "design", status: "failed", error: "API timeout" },
      { phase: 2, name: "implement", status: "pending" },
      { phase: 3, name: "write-tests", status: "pending" },
      { phase: 4, name: "document", status: "pending" },
      { phase: 5, name: "publish", status: "pending" },
    ];
    mockFindUnique.mockResolvedValueOnce({
      id: "clxtest123456789012345",
      userId: "user-1",
      status: "FAILED",
      updatedAt: new Date(recentDate()),
      phases,
    } as never);
    mockUpdate.mockResolvedValueOnce({
      id: "clxtest123456789012345",
      status: "DESIGNING",
    } as never);

    const { POST } = await import("../[generationId]/resume/route");
    const res = await POST(mockRequest() as never, {
      params: Promise.resolve({ generationId: "clxtest123456789012345" }),
    });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.resumeFromPhase).toBe(1);
    expect(json.data.done).toBe(false);

    // Verify update was called with the failed phase reset to pending
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "DESIGNING",
          currentPhase: 1,
          errorMessage: null,
          phases: expect.arrayContaining([
            expect.objectContaining({ phase: 1, status: "pending" }),
          ]),
        }),
      }),
    );
  });

  it("resumes a stuck generation — resets running phase to pending", async () => {
    const phases = [
      { phase: 0, name: "analyze", status: "completed", output: {} },
      { phase: 1, name: "design", status: "completed", output: [] },
      { phase: 2, name: "implement", status: "running" }, // stuck in running
      { phase: 3, name: "write-tests", status: "pending" },
      { phase: 4, name: "document", status: "pending" },
      { phase: 5, name: "publish", status: "pending" },
    ];
    mockFindUnique.mockResolvedValueOnce({
      id: "clxtest123456789012345",
      userId: "user-1",
      status: "IMPLEMENTING",
      updatedAt: new Date(stuckDate()),
      phases,
    } as never);
    mockUpdate.mockResolvedValueOnce({
      id: "clxtest123456789012345",
      status: "IMPLEMENTING",
    } as never);

    const { POST } = await import("../[generationId]/resume/route");
    const res = await POST(mockRequest() as never, {
      params: Promise.resolve({ generationId: "clxtest123456789012345" }),
    });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.resumeFromPhase).toBe(2);

    // Verify the running phase was reset to pending
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          currentPhase: 2,
          errorMessage: null,
          phases: expect.arrayContaining([
            expect.objectContaining({ phase: 2, status: "pending" }),
          ]),
        }),
      }),
    );
  });

  it("handles phases being null/empty — initialises fresh phases array", async () => {
    mockFindUnique.mockResolvedValueOnce({
      id: "clxtest123456789012345",
      userId: "user-1",
      status: "FAILED",
      updatedAt: new Date(stuckDate()),
      phases: null,
    } as never);
    mockUpdate.mockResolvedValueOnce({
      id: "clxtest123456789012345",
      status: "ANALYZING",
    } as never);

    const { POST } = await import("../[generationId]/resume/route");
    const res = await POST(mockRequest() as never, {
      params: Promise.resolve({ generationId: "clxtest123456789012345" }),
    });
    const json = await res.json();

    expect(json.success).toBe(true);
    expect(json.data.resumeFromPhase).toBe(0);
  });

  it("returns done:true when all phases are already completed", async () => {
    const phases = [0, 1, 2, 3, 4, 5].map((i) => ({
      phase: i,
      name: `phase-${i}`,
      status: "completed",
    }));
    mockFindUnique.mockResolvedValueOnce({
      id: "clxtest123456789012345",
      userId: "user-1",
      status: "FAILED", // status mismatch — all phases completed but status wrong
      updatedAt: new Date(recentDate()),
      phases,
    } as never);
    mockUpdate.mockResolvedValueOnce({
      id: "clxtest123456789012345",
      status: "COMPLETED",
    } as never);

    const { POST } = await import("../[generationId]/resume/route");
    const res = await POST(mockRequest() as never, {
      params: Promise.resolve({ generationId: "clxtest123456789012345" }),
    });
    const json = await res.json();

    expect(json.success).toBe(true);
    expect(json.data.done).toBe(true);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "COMPLETED" }),
      }),
    );
  });

  it("preserves completed phase outputs when resetting failed phase", async () => {
    const completedOutput = { detectedCLIPaths: ["/usr/bin/blender"] };
    const phases = [
      { phase: 0, name: "analyze", status: "completed", output: completedOutput },
      { phase: 1, name: "design", status: "failed", error: "timeout" },
      { phase: 2, name: "implement", status: "pending" },
      { phase: 3, name: "write-tests", status: "pending" },
      { phase: 4, name: "document", status: "pending" },
      { phase: 5, name: "publish", status: "pending" },
    ];
    mockFindUnique.mockResolvedValueOnce({
      id: "clxtest123456789012345",
      userId: "user-1",
      status: "FAILED",
      updatedAt: new Date(recentDate()),
      phases,
    } as never);
    mockUpdate.mockResolvedValueOnce({ id: "clxtest123456789012345", status: "DESIGNING" } as never);

    const { POST } = await import("../[generationId]/resume/route");
    await POST(mockRequest() as never, {
      params: Promise.resolve({ generationId: "clxtest123456789012345" }),
    });

    const updateCall = mockUpdate.mock.calls[0]?.[0];
    const updatedPhases = updateCall?.data?.phases as Array<{ phase: number; status: string; output?: unknown }>;
    const phase0 = updatedPhases?.find((p) => p.phase === 0);
    expect(phase0?.status).toBe("completed");
    expect(phase0?.output).toEqual(completedOutput);
  });
});
