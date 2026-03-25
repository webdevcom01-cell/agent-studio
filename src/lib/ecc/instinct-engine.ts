import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { recordMetric } from "@/lib/observability/metrics";

const PROMOTION_CONFIDENCE_THRESHOLD = 0.85;
const PROMOTION_FREQUENCY_THRESHOLD = 10;
const DECAY_INTERVAL_DAYS = 7;
const DECAY_AMOUNT = 0.05;
const MAX_INSTINCTS_PER_EVOLVE = 20;
const SIMILARITY_THRESHOLD = 0.7;

export interface InstinctSummary {
  id: string;
  name: string;
  description: string;
  confidence: number;
  frequency: number;
  agentId: string;
  promotedToSkillId: string | null;
}

export interface PromotionCandidate {
  instinct: InstinctSummary;
  skillSlug: string;
}

export interface ClusterGroup {
  representative: InstinctSummary;
  members: InstinctSummary[];
  mergedConfidence: number;
  mergedFrequency: number;
}

export interface EvolveResult {
  clustered: number;
  promoted: number;
  decayed: number;
  agentsProcessed: number;
}

export interface LifecycleStats {
  total: number;
  byConfidenceBucket: Record<string, number>;
  promotionReady: number;
  promoted: number;
  decaying: number;
  averageConfidence: number;
  averageFrequency: number;
}

/**
 * Returns instincts eligible for promotion:
 * confidence >= 0.85 AND frequency >= 10 AND not yet promoted.
 */
export async function getPromotionCandidates(
  agentId?: string
): Promise<PromotionCandidate[]> {
  const where: Record<string, unknown> = {
    confidence: { gte: PROMOTION_CONFIDENCE_THRESHOLD },
    frequency: { gte: PROMOTION_FREQUENCY_THRESHOLD },
    promotedToSkillId: null,
  };
  if (agentId) {
    where.agentId = agentId;
  }

  const instincts = await prisma.instinct.findMany({
    where,
    orderBy: { confidence: "desc" },
    take: MAX_INSTINCTS_PER_EVOLVE,
    select: {
      id: true,
      name: true,
      description: true,
      confidence: true,
      frequency: true,
      agentId: true,
      promotedToSkillId: true,
    },
  });

  return instincts.map((inst) => ({
    instinct: inst,
    skillSlug: buildSlug(inst.name),
  }));
}

export async function promoteInstinctToSkill(
  instinctId: string,
  skillContent: string
): Promise<{ skillId: string }> {
  const instinct = await prisma.instinct.findUniqueOrThrow({
    where: { id: instinctId },
  });

  if (instinct.promotedToSkillId) {
    return { skillId: instinct.promotedToSkillId };
  }

  const slug = buildSlug(instinct.name);

  const skill = await prisma.skill.upsert({
    where: { slug },
    create: {
      slug,
      name: instinct.name,
      description: instinct.description,
      content: skillContent,
      version: "1.0.0",
      category: "learned",
      eccOrigin: false,
      tags: ["instinct", "auto-generated"],
    },
    update: {
      description: instinct.description,
      content: skillContent,
      version: "1.0.0",
    },
  });

  await prisma.instinct.update({
    where: { id: instinctId },
    data: { promotedToSkillId: skill.id },
  });

  recordMetric("ecc.instinct.promotion", 1, "count", {
    agentId: instinct.agentId,
  });

  logger.info("Instinct promoted to skill", {
    instinctId,
    skillId: skill.id,
    slug,
    confidence: instinct.confidence,
    frequency: instinct.frequency,
  });

  return { skillId: skill.id };
}

/**
 * Decays confidence of inactive instincts by 0.05.
 * Targets instincts not updated in the last 7 days (weekly decay).
 */
export async function decayStaleInstincts(
  intervalDays: number = DECAY_INTERVAL_DAYS
): Promise<number> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - intervalDays);

  const stale = await prisma.instinct.findMany({
    where: {
      updatedAt: { lt: cutoff },
      promotedToSkillId: null,
      confidence: { gt: 0 },
    },
    select: { id: true, confidence: true },
  });

  let decayed = 0;
  for (const inst of stale) {
    const newConfidence = Math.max(0, inst.confidence - DECAY_AMOUNT);
    await prisma.instinct.update({
      where: { id: inst.id },
      data: { confidence: newConfidence },
    });
    decayed++;
  }

  if (decayed > 0) {
    logger.info("Decayed stale instincts", { count: decayed, intervalDays });
  }

  return decayed;
}

/**
 * Groups similar instincts by name/description similarity.
 * Uses simple token overlap (Jaccard similarity) — no embeddings needed.
 * Members of a cluster get their confidence and frequency merged into
 * the representative instinct.
 */
export function clusterSimilarInstincts(
  instincts: InstinctSummary[]
): ClusterGroup[] {
  if (instincts.length === 0) return [];

  const assigned = new Set<string>();
  const clusters: ClusterGroup[] = [];

  for (const inst of instincts) {
    if (assigned.has(inst.id)) continue;

    const members: InstinctSummary[] = [];
    assigned.add(inst.id);

    for (const other of instincts) {
      if (assigned.has(other.id)) continue;
      if (inst.id === other.id) continue;

      const sim = jaccardSimilarity(
        tokenize(`${inst.name} ${inst.description}`),
        tokenize(`${other.name} ${other.description}`)
      );

      if (sim >= SIMILARITY_THRESHOLD) {
        members.push(other);
        assigned.add(other.id);
      }
    }

    const allMembers = [inst, ...members];
    const mergedConfidence = Math.min(
      1.0,
      allMembers.reduce((sum, m) => sum + m.confidence, 0) / allMembers.length +
        members.length * 0.05
    );
    const mergedFrequency = allMembers.reduce((sum, m) => sum + m.frequency, 0);

    clusters.push({
      representative: inst,
      members,
      mergedConfidence,
      mergedFrequency,
    });
  }

  return clusters;
}

/**
 * Merges cluster members into the representative instinct in DB.
 * Updates representative's confidence and frequency, removes members.
 */
export async function mergeCluster(cluster: ClusterGroup): Promise<void> {
  if (cluster.members.length === 0) return;

  await prisma.instinct.update({
    where: { id: cluster.representative.id },
    data: {
      confidence: cluster.mergedConfidence,
      frequency: cluster.mergedFrequency,
    },
  });

  const memberIds = cluster.members.map((m) => m.id);
  await prisma.instinct.deleteMany({
    where: { id: { in: memberIds } },
  });

  logger.info("Merged instinct cluster", {
    representativeId: cluster.representative.id,
    mergedCount: cluster.members.length,
    newConfidence: cluster.mergedConfidence,
    newFrequency: cluster.mergedFrequency,
  });
}

/**
 * Full evolution pipeline for a single agent:
 * 1. Cluster similar instincts
 * 2. Merge clusters
 * 3. Check promotion candidates
 * (Promotion itself is handled by the caller with AI content generation)
 */
export async function evolveAgentInstincts(
  agentId: string
): Promise<{ clusters: ClusterGroup[]; candidates: PromotionCandidate[] }> {
  const instincts = await prisma.instinct.findMany({
    where: { agentId, promotedToSkillId: null },
    select: {
      id: true,
      name: true,
      description: true,
      confidence: true,
      frequency: true,
      agentId: true,
      promotedToSkillId: true,
    },
  });

  const clusters = clusterSimilarInstincts(instincts);

  for (const cluster of clusters) {
    if (cluster.members.length > 0) {
      await mergeCluster(cluster);
    }
  }

  const candidates = await getPromotionCandidates(agentId);

  return { clusters, candidates };
}

/**
 * Returns lifecycle statistics for instincts.
 */
export async function getLifecycleStats(
  agentId?: string
): Promise<LifecycleStats> {
  const where = agentId ? { agentId } : {};

  const instincts = await prisma.instinct.findMany({
    where,
    select: {
      confidence: true,
      frequency: true,
      promotedToSkillId: true,
      updatedAt: true,
    },
  });

  const total = instincts.length;
  if (total === 0) {
    return {
      total: 0,
      byConfidenceBucket: {},
      promotionReady: 0,
      promoted: 0,
      decaying: 0,
      averageConfidence: 0,
      averageFrequency: 0,
    };
  }

  const buckets: Record<string, number> = {
    "0.0-0.2": 0,
    "0.2-0.4": 0,
    "0.4-0.6": 0,
    "0.6-0.8": 0,
    "0.8-1.0": 0,
  };

  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - DECAY_INTERVAL_DAYS);

  let promoted = 0;
  let promotionReady = 0;
  let decaying = 0;
  let totalConfidence = 0;
  let totalFrequency = 0;

  for (const inst of instincts) {
    totalConfidence += inst.confidence;
    totalFrequency += inst.frequency;

    if (inst.promotedToSkillId) {
      promoted++;
    } else if (
      inst.confidence >= PROMOTION_CONFIDENCE_THRESHOLD &&
      inst.frequency >= PROMOTION_FREQUENCY_THRESHOLD
    ) {
      promotionReady++;
    }

    if (!inst.promotedToSkillId && inst.updatedAt < weekAgo && inst.confidence > 0) {
      decaying++;
    }

    if (inst.confidence < 0.2) buckets["0.0-0.2"]++;
    else if (inst.confidence < 0.4) buckets["0.2-0.4"]++;
    else if (inst.confidence < 0.6) buckets["0.4-0.6"]++;
    else if (inst.confidence < 0.8) buckets["0.6-0.8"]++;
    else buckets["0.8-1.0"]++;
  }

  return {
    total,
    byConfidenceBucket: buckets,
    promotionReady,
    promoted,
    decaying,
    averageConfidence: totalConfidence / total,
    averageFrequency: totalFrequency / total,
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────

function buildSlug(name: string): string {
  return `instinct-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
}

function tokenize(text: string): Set<string> {
  return new Set(
    text.toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter(Boolean)
  );
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}
