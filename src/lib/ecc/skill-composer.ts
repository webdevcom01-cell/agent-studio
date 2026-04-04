import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma";
import { logger } from "@/lib/logger";

/**
 * 3-Layer Skill Composition System
 *
 * Layer ordering:
 * 1. GUARANTEE — always runs first (security-check, guardrails, pii-detector)
 * 2. ENHANCEMENT — runs after guarantee (performance-monitor, mem-check)
 * 3. EXECUTION — primary task skill (autopilot, ralph, team)
 *
 * Within each layer, skills are ordered by name (deterministic).
 */

export type CompositionLayer = "guarantee" | "enhancement" | "execution";

const LAYER_ORDER: CompositionLayer[] = ["guarantee", "enhancement", "execution"];

interface ComposedSkill {
  id: string;
  name: string;
  slug: string;
  compositionLayer: CompositionLayer;
  content: string;
  description: string;
}

// Raw query row type for skill data joined with compositionLayer
interface SkillRow {
  id: string;
  name: string;
  slug: string;
  compositionLayer: string;
  content: string;
  description: string;
}

/**
 * Build an ordered skill pipeline for an agent.
 *
 * Returns skills in composition order:
 *   guarantee → enhancement → execution
 *
 * If `taskSkillId` is provided, it's included in the execution layer
 * (even if the agent doesn't have explicit permission — the caller
 * requested it directly).
 */
export async function composeSkillPipeline(
  agentId: string,
  taskSkillId?: string,
): Promise<ComposedSkill[]> {
  try {
    // compositionLayer is in schema.prisma + DB but not in generated types yet
    // (pnpm db:generate is blocked in this environment due to 403 on binary fetch).
    // Fetched via raw query until types are regenerated.
    const rows = await prisma.$queryRaw<SkillRow[]>(
      Prisma.sql`
        SELECT s.id, s.name, s.slug, s."compositionLayer", s.content, s.description
        FROM "Skill" s
        INNER JOIN "AgentSkillPermission" asp ON asp."skillId" = s.id
        WHERE asp."agentId" = ${agentId}
      `,
    );

    const skillMap = new Map<string, ComposedSkill>();

    for (const s of rows) {
      const layer = validateLayer(s.compositionLayer);
      skillMap.set(s.id, {
        id: s.id,
        name: s.name,
        slug: s.slug,
        compositionLayer: layer,
        content: s.content,
        description: s.description,
      });
    }

    // If a specific task skill was requested and not already included, load it
    if (taskSkillId && !skillMap.has(taskSkillId)) {
      const taskRows = await prisma.$queryRaw<SkillRow[]>(
        Prisma.sql`
          SELECT id, name, slug, "compositionLayer", content, description
          FROM "Skill"
          WHERE id = ${taskSkillId}
          LIMIT 1
        `,
      );
      if (taskRows[0]) {
        const ts = taskRows[0];
        skillMap.set(ts.id, {
          ...ts,
          compositionLayer: validateLayer(ts.compositionLayer),
        });
      }
    }

    // Sort by layer order, then by name within each layer
    const skills = Array.from(skillMap.values());
    skills.sort((a, b) => {
      const layerDiff = LAYER_ORDER.indexOf(a.compositionLayer) - LAYER_ORDER.indexOf(b.compositionLayer);
      if (layerDiff !== 0) return layerDiff;
      return a.name.localeCompare(b.name);
    });

    return skills;
  } catch (error) {
    logger.error("Failed to compose skill pipeline", { agentId, taskSkillId, error });
    return [];
  }
}

/**
 * Format a composed skill pipeline as system prompt text.
 *
 * Produces a structured block:
 * ```
 * <skill_pipeline>
 * <guarantee_layer>
 * [GUARANTEE: security-check] Security scanning instructions...
 * </guarantee_layer>
 * <enhancement_layer>
 * [ENHANCEMENT: perf-monitor] Performance monitoring...
 * </enhancement_layer>
 * <execution_layer>
 * [EXECUTION: task-skill] Main task instructions...
 * </execution_layer>
 * </skill_pipeline>
 * ```
 */
export function formatSkillPipelineForPrompt(skills: ComposedSkill[]): string {
  if (skills.length === 0) return "";

  const sections: string[] = ["<skill_pipeline>"];

  for (const layer of LAYER_ORDER) {
    const layerSkills = skills.filter((s) => s.compositionLayer === layer);
    if (layerSkills.length === 0) continue;

    sections.push(`<${layer}_layer>`);
    for (const skill of layerSkills) {
      // Truncate content to avoid overwhelming the prompt
      const truncatedContent = skill.content.length > 2000
        ? skill.content.slice(0, 1997) + "..."
        : skill.content;
      sections.push(`[${layer.toUpperCase()}: ${skill.slug}] ${truncatedContent}`);
    }
    sections.push(`</${layer}_layer>`);
  }

  sections.push("</skill_pipeline>");
  return sections.join("\n");
}

/**
 * Get only guarantee-layer skills for an agent.
 * Lightweight call for safety-critical paths.
 */
export async function getGuaranteeSkills(agentId: string): Promise<ComposedSkill[]> {
  try {
    // Raw query for guarantee skills — compositionLayer not in generated types
    const rows = await prisma.$queryRaw<SkillRow[]>(
      Prisma.sql`
        SELECT s.id, s.name, s.slug, s."compositionLayer", s.content, s.description
        FROM "Skill" s
        INNER JOIN "AgentSkillPermission" asp ON asp."skillId" = s.id
        WHERE asp."agentId" = ${agentId}
          AND s."compositionLayer" = 'guarantee'
        ORDER BY s.name ASC
      `,
    );

    return rows.map((s) => ({
      ...s,
      compositionLayer: "guarantee" as CompositionLayer,
    }));
  } catch (error) {
    logger.warn("Failed to load guarantee skills", { agentId, error });
    return [];
  }
}

export function validateLayer(raw: string): CompositionLayer {
  if (raw === "guarantee" || raw === "enhancement" || raw === "execution") {
    return raw;
  }
  return "execution";
}
