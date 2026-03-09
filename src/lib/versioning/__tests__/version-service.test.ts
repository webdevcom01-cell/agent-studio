import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPrisma = vi.hoisted(() => ({
  flowVersion: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    findUniqueOrThrow: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  flow: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  flowDeployment: {
    create: vi.fn(),
  },
  $transaction: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: mockPrisma,
}));

import { VersionService } from "../version-service";
import type { FlowContent } from "@/types";

const EMPTY_CONTENT: FlowContent = { nodes: [], edges: [], variables: [] };
const CONTENT_WITH_NODE: FlowContent = {
  nodes: [{ id: "n1", type: "message", position: { x: 0, y: 0 }, data: {} }],
  edges: [],
  variables: [],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("VersionService.createVersion", () => {
  it("creates first version with version number 1", async () => {
    mockPrisma.flowVersion.findFirst.mockResolvedValue(null);
    mockPrisma.flowVersion.create.mockResolvedValue({
      id: "v1",
      version: 1,
      flowId: "f1",
      status: "DRAFT",
    });

    const result = await VersionService.createVersion("f1", EMPTY_CONTENT);

    expect(mockPrisma.flowVersion.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          flowId: "f1",
          version: 1,
          status: "DRAFT",
        }),
      })
    );
    expect(result.version).toBe(1);
  });

  it("increments version number", async () => {
    mockPrisma.flowVersion.findFirst.mockResolvedValue({
      id: "v2",
      version: 2,
      content: EMPTY_CONTENT,
      createdAt: new Date(Date.now() - 60_000),
    });
    mockPrisma.flowVersion.create.mockResolvedValue({
      id: "v3",
      version: 3,
      flowId: "f1",
    });

    await VersionService.createVersion("f1", CONTENT_WITH_NODE);

    expect(mockPrisma.flowVersion.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ version: 3 }),
      })
    );
  });

  it("skips creation when content unchanged within throttle window", async () => {
    mockPrisma.flowVersion.findFirst.mockResolvedValue({
      id: "v1",
      version: 1,
      content: EMPTY_CONTENT,
      createdAt: new Date(),
    });

    const result = await VersionService.createVersion("f1", EMPTY_CONTENT);

    expect(mockPrisma.flowVersion.create).not.toHaveBeenCalled();
    expect(result.id).toBe("v1");
  });

  it("creates version even within throttle if content differs", async () => {
    mockPrisma.flowVersion.findFirst.mockResolvedValue({
      id: "v1",
      version: 1,
      content: EMPTY_CONTENT,
      createdAt: new Date(),
    });
    mockPrisma.flowVersion.create.mockResolvedValue({
      id: "v2",
      version: 2,
    });

    await VersionService.createVersion("f1", CONTENT_WITH_NODE);

    expect(mockPrisma.flowVersion.create).toHaveBeenCalled();
  });

  it("generates changes summary from previous version", async () => {
    mockPrisma.flowVersion.findFirst.mockResolvedValue({
      id: "v1",
      version: 1,
      content: EMPTY_CONTENT,
      createdAt: new Date(Date.now() - 60_000),
    });
    mockPrisma.flowVersion.create.mockResolvedValue({
      id: "v2",
      version: 2,
    });

    await VersionService.createVersion("f1", CONTENT_WITH_NODE);

    const createCall = mockPrisma.flowVersion.create.mock.calls[0][0];
    expect(createCall.data.changesSummary).toBeDefined();
    expect(createCall.data.changesSummary.summary).toContain("Added 1 node");
  });
});

describe("VersionService.listVersions", () => {
  it("returns versions sorted by version DESC", async () => {
    mockPrisma.flowVersion.findMany.mockResolvedValue([
      { id: "v2", version: 2 },
      { id: "v1", version: 1 },
    ]);

    const result = await VersionService.listVersions("f1");

    expect(result).toHaveLength(2);
    expect(mockPrisma.flowVersion.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { version: "desc" },
      })
    );
  });
});

describe("VersionService.rollbackToVersion", () => {
  it("creates new version with target version content", async () => {
    mockPrisma.flowVersion.findUniqueOrThrow.mockResolvedValue({
      id: "v1",
      version: 1,
      content: CONTENT_WITH_NODE,
    });
    mockPrisma.flowVersion.findFirst.mockResolvedValue({
      id: "v3",
      version: 3,
      content: EMPTY_CONTENT,
      createdAt: new Date(Date.now() - 60_000),
    });
    mockPrisma.flowVersion.create.mockResolvedValue({
      id: "v4",
      version: 4,
      label: "Rollback to v1",
    });

    const result = await VersionService.rollbackToVersion("f1", "v1", "user1");

    expect(result.label).toBe("Rollback to v1");
    expect(mockPrisma.flowVersion.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          label: "Rollback to v1",
        }),
      })
    );
  });
});

describe("VersionService.deployVersion", () => {
  it("archives old PUBLISHED versions and deploys new one", async () => {
    mockPrisma.flowVersion.findUniqueOrThrow.mockResolvedValue({
      id: "v2",
      version: 2,
      flowId: "f1",
      content: CONTENT_WITH_NODE,
      flow: { id: "f1" },
    });
    mockPrisma.flowDeployment.create.mockResolvedValue({
      id: "d1",
      agentId: "a1",
      flowVersionId: "v2",
    });
    mockPrisma.$transaction.mockImplementation(
      async (fn: (tx: typeof mockPrisma) => Promise<unknown>) => fn(mockPrisma)
    );

    const result = await VersionService.deployVersion("a1", "v2", "user1", "Go live");

    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    expect(mockPrisma.flowVersion.updateMany).toHaveBeenCalled();
    expect(mockPrisma.flowDeployment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          agentId: "a1",
          flowVersionId: "v2",
          note: "Go live",
        }),
      })
    );
    expect(result.id).toBe("d1");
  });
});

describe("VersionService.getActiveVersion", () => {
  it("returns null when no active version", async () => {
    mockPrisma.flow.findUnique.mockResolvedValue({
      activeVersionId: null,
    });

    const result = await VersionService.getActiveVersion("a1");

    expect(result).toBeNull();
  });

  it("returns active version when set", async () => {
    mockPrisma.flow.findUnique.mockResolvedValue({
      activeVersionId: "v5",
    });
    mockPrisma.flowVersion.findUnique.mockResolvedValue({
      id: "v5",
      version: 5,
      status: "PUBLISHED",
    });

    const result = await VersionService.getActiveVersion("a1");

    expect(result?.id).toBe("v5");
  });
});
