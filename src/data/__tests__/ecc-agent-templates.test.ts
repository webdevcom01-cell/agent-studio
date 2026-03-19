import { describe, it, expect } from "vitest";
import { z } from "zod";
import eccTemplateData from "../ecc-agent-templates.json";

const MODEL_TIERS = ["opus", "sonnet", "haiku"] as const;

const EccTemplateSchema = z.object({
  id: z.string().regex(/^ecc-/),
  name: z.string().min(1).max(100),
  description: z.string().min(10).max(500),
  category: z.literal("developer-agents"),
  emoji: z.string().min(1),
  color: z.literal("fuchsia"),
  vibe: z.string().min(1).max(200),
  modelTier: z.enum(MODEL_TIERS),
  systemPrompt: z.string().min(50),
});

const EccTemplateDataSchema = z.object({
  version: z.literal(1),
  generatedAt: z.string().datetime(),
  total: z.number().int().positive(),
  source: z.literal("everything-claude-code"),
  categories: z.array(z.string()),
  templates: z.array(EccTemplateSchema),
});

describe("ecc-agent-templates.json", () => {
  it("passes full schema validation", () => {
    const result = EccTemplateDataSchema.safeParse(eccTemplateData);
    if (!result.success) {
      throw new Error(
        `Schema validation failed:\n${result.error.issues
          .map((i) => `  ${i.path.join(".")}: ${i.message}`)
          .join("\n")}`
      );
    }
  });

  it("contains exactly 29 templates (25 agents + 4 pipelines)", () => {
    expect(eccTemplateData.templates).toHaveLength(29);
    expect(eccTemplateData.total).toBe(29);
  });

  it("has unique template IDs", () => {
    const ids = eccTemplateData.templates.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has unique template names", () => {
    const names = eccTemplateData.templates.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("all IDs are prefixed with ecc-", () => {
    for (const t of eccTemplateData.templates) {
      expect(t.id).toMatch(/^ecc-/);
    }
  });

  it("all templates belong to developer-agents category", () => {
    for (const t of eccTemplateData.templates) {
      expect(t.category).toBe("developer-agents");
    }
  });

  it("has correct model tier distribution", () => {
    const tiers = eccTemplateData.templates.reduce(
      (acc, t) => {
        acc[t.modelTier] = (acc[t.modelTier] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    expect(tiers.opus).toBeGreaterThanOrEqual(3);
    expect(tiers.sonnet).toBeGreaterThanOrEqual(5);
    expect(tiers.haiku).toBeGreaterThanOrEqual(5);
  });

  it("system prompts are non-trivial (>100 chars)", () => {
    for (const t of eccTemplateData.templates) {
      expect(t.systemPrompt.length).toBeGreaterThan(100);
    }
  });

  it("includes key ECC agents", () => {
    const ids = new Set(eccTemplateData.templates.map((t) => t.id));
    const required = [
      "ecc-planner",
      "ecc-architect",
      "ecc-code-reviewer",
      "ecc-tdd-guide",
      "ecc-security-reviewer",
      "ecc-meta-orchestrator",
    ];
    for (const id of required) {
      expect(ids).toContain(id);
    }
  });

  it("snapshots template IDs and model tiers", () => {
    const snapshot = eccTemplateData.templates.map((t) => ({
      id: t.id,
      modelTier: t.modelTier,
    }));
    expect(snapshot).toMatchSnapshot();
  });
});
