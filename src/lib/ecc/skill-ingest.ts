import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma";
import { generateEmbeddings } from "@/lib/knowledge/embeddings";
import { chunkText, estimateTokens } from "@/lib/knowledge/chunker";
import { logger } from "@/lib/logger";
import type { ParsedSkill, SkillIngestResult } from "./types";

const DEFAULT_BATCH_SIZE = 10;
const MAX_BATCH_SIZE = 50;
const BACKPRESSURE_THRESHOLD = 100;
const BACKPRESSURE_DELAY_MS = 500;

export interface VectorizeOptions {
  batchSize?: number;
}

export interface VectorizeResult {
  chunksCreated: number;
  skillsProcessed: number;
  batchSize: number;
  backpressurePauses: number;
}

export async function ingestSkills(
  skills: ParsedSkill[]
): Promise<SkillIngestResult> {
  const result: SkillIngestResult = {
    total: skills.length,
    created: 0,
    updated: 0,
    failed: 0,
    errors: [],
  };

  for (const skill of skills) {
    try {
      await upsertSkill(skill, result);
    } catch (err) {
      result.failed++;
      const message = err instanceof Error ? err.message : String(err);
      result.errors.push({ slug: skill.slug, error: message });
      logger.error("Failed to ingest skill", err, { slug: skill.slug });
    }
  }

  logger.info("Skill ingestion complete", {
    total: result.total,
    created: result.created,
    updated: result.updated,
    failed: result.failed,
  });

  return result;
}

async function upsertSkill(
  skill: ParsedSkill,
  result: SkillIngestResult
): Promise<void> {
  const { frontmatter, content, slug } = skill;

  const existing = await prisma.skill.findUnique({
    where: { slug },
    select: { id: true, version: true },
  });

  const skillVersion = frontmatter.version ?? "1.0.0";

  if (existing && existing.version === skillVersion) {
    result.updated++;
    return;
  }

  const data = {
    name: frontmatter.name,
    description: frontmatter.description,
    version: skillVersion,
    content,
    tags: frontmatter.tags ?? [],
    category: frontmatter.category ?? null,
    language: frontmatter.language ?? null,
    inputSchema: frontmatter.inputs
      ? (frontmatter.inputs as unknown as Prisma.InputJsonValue)
      : Prisma.JsonNull,
    outputSchema: frontmatter.outputs
      ? (frontmatter.outputs as unknown as Prisma.InputJsonValue)
      : Prisma.JsonNull,
    eccOrigin: true,
  };

  if (existing) {
    await prisma.skill.update({
      where: { slug },
      data,
    });
    result.updated++;
  } else {
    await prisma.skill.create({
      data: { ...data, slug },
    });
    result.created++;
  }
}

const ECC_VIRTUAL_AGENT_ID = "ecc-skills-virtual-agent";
const ECC_VIRTUAL_KB_ID = "ecc-skills-virtual-kb";
const ECC_VIRTUAL_SOURCE_ID = "ecc-skills-virtual-source";

async function ensureVirtualSource(): Promise<void> {
  const existing = await prisma.kBSource.findUnique({
    where: { id: ECC_VIRTUAL_SOURCE_ID },
    select: { id: true },
  });
  if (existing) return;

  await prisma.agent.upsert({
    where: { id: ECC_VIRTUAL_AGENT_ID },
    create: {
      id: ECC_VIRTUAL_AGENT_ID,
      name: "ECC Skills (System)",
      description: "Virtual agent for ECC skill vectorization",
      systemPrompt: "",
      model: "gpt-4.1-mini",
    },
    update: {},
  });

  await prisma.knowledgeBase.upsert({
    where: { id: ECC_VIRTUAL_KB_ID },
    create: {
      id: ECC_VIRTUAL_KB_ID,
      name: "ECC Skills KB",
      agentId: ECC_VIRTUAL_AGENT_ID,
    },
    update: {},
  });

  await prisma.kBSource.create({
    data: {
      id: ECC_VIRTUAL_SOURCE_ID,
      type: "TEXT",
      name: "ECC Skills Collection",
      status: "READY",
      knowledgeBaseId: ECC_VIRTUAL_KB_ID,
    },
  });
}

export async function vectorizeSkills(
  options?: VectorizeOptions
): Promise<VectorizeResult> {
  const batchSize = Math.min(
    Math.max(1, options?.batchSize ?? DEFAULT_BATCH_SIZE),
    MAX_BATCH_SIZE
  );

  await ensureVirtualSource();

  const skills = await prisma.skill.findMany({
    select: { id: true, name: true, description: true, content: true },
  });

  let totalChunks = 0;
  let pendingEmbeddings = 0;
  let backpressurePauses = 0;

  for (const skill of skills) {
    const fullText = `# ${skill.name}\n\n${skill.description}\n\n${skill.content}`;
    const chunks = chunkText(fullText, { maxTokens: 400, overlapPercent: 0.2 });

    if (chunks.length === 0) continue;

    for (let i = 0; i < chunks.length; i += batchSize) {
      // Backpressure: pause if too many embeddings are queued
      while (pendingEmbeddings >= BACKPRESSURE_THRESHOLD) {
        backpressurePauses++;
        logger.info("Vectorization backpressure — pausing", {
          pendingEmbeddings,
          threshold: BACKPRESSURE_THRESHOLD,
          pauses: backpressurePauses,
        });
        await new Promise((resolve) => setTimeout(resolve, BACKPRESSURE_DELAY_MS));
        pendingEmbeddings = Math.max(0, pendingEmbeddings - batchSize);
      }

      const batch = chunks.slice(i, i + batchSize);
      pendingEmbeddings += batch.length;

      const embeddings = await generateEmbeddings(batch);
      pendingEmbeddings -= batch.length;

      for (let j = 0; j < batch.length; j++) {
        const embeddingArray = embeddings[j];
        const vectorLiteral = `[${embeddingArray.join(",")}]`;

        await prisma.$executeRaw`
          INSERT INTO "KBChunk" (id, content, embedding, tokens, metadata, "sourceId", "createdAt")
          VALUES (
            ${`skill-${skill.id}-${i + j}`},
            ${batch[j]},
            ${vectorLiteral}::vector(1536),
            ${estimateTokens(batch[j])},
            ${JSON.stringify({ skillId: skill.id, skillName: skill.name, type: "ecc-skill" })}::jsonb,
            ${ECC_VIRTUAL_SOURCE_ID},
            NOW()
          )
          ON CONFLICT (id) DO UPDATE SET
            content = EXCLUDED.content,
            embedding = EXCLUDED.embedding,
            tokens = EXCLUDED.tokens,
            metadata = EXCLUDED.metadata
        `;
        totalChunks++;
      }
    }
  }

  logger.info("Skill vectorization complete", {
    skillsProcessed: skills.length,
    chunksCreated: totalChunks,
    batchSize,
    backpressurePauses,
  });

  return {
    chunksCreated: totalChunks,
    skillsProcessed: skills.length,
    batchSize,
    backpressurePauses,
  };
}
