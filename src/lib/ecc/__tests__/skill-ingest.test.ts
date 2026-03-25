import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ParsedSkill } from "../types";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    skill: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
    },
    $executeRaw: vi.fn(),
  },
}));

vi.mock("@/lib/knowledge/embeddings", () => ({
  generateEmbeddings: vi.fn().mockResolvedValue([[0.1, 0.2, 0.3]]),
}));

vi.mock("@/lib/knowledge/chunker", () => ({
  chunkText: vi.fn().mockReturnValue(["chunk1"]),
  estimateTokens: vi.fn().mockReturnValue(10),
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

import { prisma } from "@/lib/prisma";
import { ingestSkills } from "../skill-ingest";

const mockPrisma = vi.mocked(prisma);

function makeSkill(slug: string): ParsedSkill {
  return {
    slug,
    frontmatter: {
      name: `Skill ${slug}`,
      description: `Description for ${slug}`,
      version: "1.0.0",
      tags: ["test"],
    },
    content: `# ${slug}\n\nContent body`,
  };
}

describe("ingestSkills", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates new skills when none exist", async () => {
    mockPrisma.skill.findUnique.mockResolvedValue(null);
    mockPrisma.skill.create.mockResolvedValue({} as never);

    const result = await ingestSkills([makeSkill("new-skill")]);

    expect(result.created).toBe(1);
    expect(result.updated).toBe(0);
    expect(result.failed).toBe(0);
    expect(mockPrisma.skill.create).toHaveBeenCalledOnce();
  });

  it("skips skills with same version", async () => {
    mockPrisma.skill.findUnique.mockResolvedValue({
      id: "existing-id",
      version: "1.0.0",
    } as never);

    const result = await ingestSkills([makeSkill("existing-skill")]);

    expect(result.updated).toBe(1);
    expect(result.created).toBe(0);
    expect(mockPrisma.skill.create).not.toHaveBeenCalled();
    expect(mockPrisma.skill.update).not.toHaveBeenCalled();
  });

  it("updates skills with different version", async () => {
    mockPrisma.skill.findUnique.mockResolvedValue({
      id: "existing-id",
      version: "0.9.0",
    } as never);
    mockPrisma.skill.update.mockResolvedValue({} as never);

    const result = await ingestSkills([makeSkill("updated-skill")]);

    expect(result.updated).toBe(1);
    expect(mockPrisma.skill.update).toHaveBeenCalledOnce();
  });

  it("handles multiple skills with mixed outcomes", async () => {
    mockPrisma.skill.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "e", version: "1.0.0" } as never)
      .mockRejectedValueOnce(new Error("DB error"));

    mockPrisma.skill.create.mockResolvedValue({} as never);

    const result = await ingestSkills([
      makeSkill("new"),
      makeSkill("existing"),
      makeSkill("broken"),
    ]);

    expect(result.total).toBe(3);
    expect(result.created).toBe(1);
    expect(result.updated).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].slug).toBe("broken");
  });

  it("returns empty result for empty input", async () => {
    const result = await ingestSkills([]);

    expect(result.total).toBe(0);
    expect(result.created).toBe(0);
    expect(result.failed).toBe(0);
  });

  it("sets eccOrigin to true on created skills", async () => {
    mockPrisma.skill.findUnique.mockResolvedValue(null);
    mockPrisma.skill.create.mockResolvedValue({} as never);

    await ingestSkills([makeSkill("ecc-origin")]);

    const createCall = mockPrisma.skill.create.mock.calls[0][0];
    expect(createCall.data.eccOrigin).toBe(true);
  });
});
