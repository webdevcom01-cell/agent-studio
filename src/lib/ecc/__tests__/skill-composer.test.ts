import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock prisma before importing the module
vi.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRaw: vi.fn(),
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
}));

import { prisma } from "@/lib/prisma";
import {
  composeSkillPipeline,
  formatSkillPipelineForPrompt,
  getGuaranteeSkills,
  validateLayer,
} from "../skill-composer";

const mockQueryRaw = prisma.$queryRaw as ReturnType<typeof vi.fn>;

function makeSkillRow(
  id: string,
  name: string,
  slug: string,
  layer: string,
  content: string = "Skill content",
  description: string = "Skill desc",
) {
  return { id, name, slug, compositionLayer: layer, content, description };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("composeSkillPipeline", () => {
  it("returns empty array when agent has no skills", async () => {
    mockQueryRaw.mockResolvedValue([]);
    const result = await composeSkillPipeline("agent-1");
    expect(result).toEqual([]);
  });

  it("orders skills by layer: guarantee → enhancement → execution", async () => {
    mockQueryRaw.mockResolvedValue([
      makeSkillRow("s3", "Task Runner", "task-runner", "execution"),
      makeSkillRow("s1", "Security Check", "security-check", "guarantee"),
      makeSkillRow("s2", "Perf Monitor", "perf-monitor", "enhancement"),
    ]);

    const result = await composeSkillPipeline("agent-1");
    expect(result.map((s) => s.compositionLayer)).toEqual([
      "guarantee",
      "enhancement",
      "execution",
    ]);
  });

  it("orders skills alphabetically within the same layer", async () => {
    mockQueryRaw.mockResolvedValue([
      makeSkillRow("s2", "Zebra Guard", "zebra-guard", "guarantee"),
      makeSkillRow("s1", "Alpha Guard", "alpha-guard", "guarantee"),
    ]);

    const result = await composeSkillPipeline("agent-1");
    expect(result.map((s) => s.name)).toEqual(["Alpha Guard", "Zebra Guard"]);
  });

  it("includes task skill when not already in permissions", async () => {
    // First call returns agent permissions
    mockQueryRaw
      .mockResolvedValueOnce([
        makeSkillRow("s1", "Security", "security", "guarantee"),
      ])
      // Second call returns the task skill
      .mockResolvedValueOnce([
        makeSkillRow("task-1", "My Task", "my-task", "execution"),
      ]);

    const result = await composeSkillPipeline("agent-1", "task-1");
    expect(result).toHaveLength(2);
    expect(result[1].id).toBe("task-1");
    expect(result[1].compositionLayer).toBe("execution");
  });

  it("does not duplicate task skill if already in permissions", async () => {
    mockQueryRaw.mockResolvedValue([
      makeSkillRow("s1", "Security", "security", "guarantee"),
      makeSkillRow("task-1", "My Task", "my-task", "execution"),
    ]);

    const result = await composeSkillPipeline("agent-1", "task-1");
    expect(result).toHaveLength(2);
    // Should only have called $queryRaw once (no second call for task skill)
    expect(mockQueryRaw).toHaveBeenCalledTimes(1);
  });

  it("defaults unknown composition layers to execution", async () => {
    mockQueryRaw.mockResolvedValue([
      makeSkillRow("s1", "Unknown Skill", "unknown", "invalid_layer"),
    ]);

    const result = await composeSkillPipeline("agent-1");
    expect(result[0].compositionLayer).toBe("execution");
  });

  it("returns empty array on error (never throws)", async () => {
    mockQueryRaw.mockRejectedValue(new Error("DB error"));
    const result = await composeSkillPipeline("agent-1");
    expect(result).toEqual([]);
  });
});

describe("formatSkillPipelineForPrompt", () => {
  it("returns empty string for empty pipeline", () => {
    expect(formatSkillPipelineForPrompt([])).toBe("");
  });

  it("formats a single-layer pipeline with XML tags", () => {
    const skills = [
      {
        id: "s1",
        name: "Security",
        slug: "security-check",
        compositionLayer: "guarantee" as const,
        content: "Check for vulnerabilities",
        description: "Security scanning",
      },
    ];

    const result = formatSkillPipelineForPrompt(skills);
    expect(result).toContain("<skill_pipeline>");
    expect(result).toContain("</skill_pipeline>");
    expect(result).toContain("<guarantee_layer>");
    expect(result).toContain("</guarantee_layer>");
    expect(result).toContain("[GUARANTEE: security-check]");
    expect(result).toContain("Check for vulnerabilities");
    expect(result).not.toContain("<enhancement_layer>");
    expect(result).not.toContain("<execution_layer>");
  });

  it("formats all three layers in correct order", () => {
    const skills = [
      {
        id: "s1",
        name: "Guard",
        slug: "guard",
        compositionLayer: "guarantee" as const,
        content: "Guard content",
        description: "",
      },
      {
        id: "s2",
        name: "Enhance",
        slug: "enhance",
        compositionLayer: "enhancement" as const,
        content: "Enhance content",
        description: "",
      },
      {
        id: "s3",
        name: "Execute",
        slug: "execute",
        compositionLayer: "execution" as const,
        content: "Execute content",
        description: "",
      },
    ];

    const result = formatSkillPipelineForPrompt(skills);
    const guaranteeIdx = result.indexOf("<guarantee_layer>");
    const enhancementIdx = result.indexOf("<enhancement_layer>");
    const executionIdx = result.indexOf("<execution_layer>");
    expect(guaranteeIdx).toBeLessThan(enhancementIdx);
    expect(enhancementIdx).toBeLessThan(executionIdx);
  });

  it("truncates long skill content to 2000 chars", () => {
    const longContent = "x".repeat(3000);
    const skills = [
      {
        id: "s1",
        name: "Long Skill",
        slug: "long",
        compositionLayer: "execution" as const,
        content: longContent,
        description: "",
      },
    ];

    const result = formatSkillPipelineForPrompt(skills);
    expect(result).not.toContain("x".repeat(3000));
    expect(result).toContain("x".repeat(1997) + "...");
  });

  it("does not truncate content at exactly 2000 chars", () => {
    const exactContent = "y".repeat(2000);
    const skills = [
      {
        id: "s1",
        name: "Exact",
        slug: "exact",
        compositionLayer: "execution" as const,
        content: exactContent,
        description: "",
      },
    ];

    const result = formatSkillPipelineForPrompt(skills);
    expect(result).toContain(exactContent);
    expect(result).not.toContain("...");
  });
});

describe("getGuaranteeSkills", () => {
  it("returns guarantee skills from raw query", async () => {
    mockQueryRaw.mockResolvedValue([
      makeSkillRow("s1", "Alpha Guard", "alpha", "guarantee"),
      makeSkillRow("s2", "Zebra Guard", "zebra", "guarantee"),
    ]);

    const result = await getGuaranteeSkills("agent-1");
    expect(result).toHaveLength(2);
    expect(result.every((s) => s.compositionLayer === "guarantee")).toBe(true);
  });

  it("returns empty array on error (never throws)", async () => {
    mockQueryRaw.mockRejectedValue(new Error("DB down"));
    const result = await getGuaranteeSkills("agent-1");
    expect(result).toEqual([]);
  });
});

describe("validateLayer", () => {
  it("accepts valid layers", () => {
    expect(validateLayer("guarantee")).toBe("guarantee");
    expect(validateLayer("enhancement")).toBe("enhancement");
    expect(validateLayer("execution")).toBe("execution");
  });

  it("defaults unknown values to execution", () => {
    expect(validateLayer("invalid")).toBe("execution");
    expect(validateLayer("")).toBe("execution");
    expect(validateLayer("GUARANTEE")).toBe("execution");
  });
});
