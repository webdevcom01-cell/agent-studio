import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { Prisma } from "@/generated/prisma";
import type { ApprovalPolicy, PolicyDecision } from "@/generated/prisma";

export interface PolicyCheckResult {
  requiresApproval: boolean;
  policy: ApprovalPolicy | null;
}

export interface RequestApprovalResult {
  decision: PolicyDecision;
  alreadyPending: boolean;
}

export interface ResolveDecisionResult {
  decision: PolicyDecision;
}

export interface ProcessTimeoutsResult {
  processed: number;
  approved: number;
  rejected: number;
}

/**
 * Returns the first active policy matching the given action for the agent.
 * Pattern matching: exact match OR wildcard "*".
 */
export async function checkPolicies(
  agentId: string,
  action: string,
): Promise<PolicyCheckResult> {
  try {
    const policy = await prisma.approvalPolicy.findFirst({
      where: {
        agentId,
        isActive: true,
        actionPattern: { in: [action, "*"] },
      },
      orderBy: { actionPattern: "asc" }, // exact match (non-"*") sorts before "*"
    });

    return { requiresApproval: policy !== null, policy };
  } catch (error) {
    logger.warn("checkPolicies: DB error — failing open (no approval required)", { agentId, action, error });
    return { requiresApproval: false, policy: null };
  }
}

/**
 * Creates a PENDING PolicyDecision for the given policy and action.
 * Returns any existing PENDING decision for the same agent+action rather than
 * creating a duplicate.
 */
export async function requestApproval(
  policyId: string,
  agentId: string,
  organizationId: string,
  action: string,
  context?: Record<string, unknown>,
): Promise<RequestApprovalResult> {
  const existing = await prisma.policyDecision.findFirst({
    where: { policyId, agentId, action, status: "PENDING" },
  });

  if (existing) {
    return { decision: existing, alreadyPending: true };
  }

  const policy = await prisma.approvalPolicy.findUnique({ where: { id: policyId } });
  if (!policy) {
    throw new Error(`ApprovalPolicy ${policyId} not found`);
  }

  const expiresAt =
    policy.timeoutSeconds != null
      ? new Date(Date.now() + policy.timeoutSeconds * 1000)
      : null;

  const decision = await prisma.policyDecision.create({
    data: {
      policyId,
      agentId,
      organizationId,
      action,
      context: context !== undefined ? (context as Prisma.InputJsonValue) : Prisma.JsonNull,
      status: "PENDING",
      expiresAt,
    },
  });

  logger.info("Approval requested", { decisionId: decision.id, agentId, action, policyId });

  return { decision, alreadyPending: false };
}

/**
 * Resolves a PENDING decision as APPROVED or REJECTED.
 * Throws if the decision is not found or not in PENDING state.
 */
export async function resolveDecision(
  decisionId: string,
  resolution: "APPROVED" | "REJECTED",
  resolvedBy: string,
  resolverNote?: string,
): Promise<ResolveDecisionResult> {
  const existing = await prisma.policyDecision.findUnique({ where: { id: decisionId } });
  if (!existing) throw new Error(`PolicyDecision ${decisionId} not found`);
  if (existing.status !== "PENDING") {
    throw new Error(`PolicyDecision ${decisionId} is already ${existing.status}`);
  }

  const decision = await prisma.policyDecision.update({
    where: { id: decisionId },
    data: {
      status: resolution,
      resolvedBy,
      resolvedAt: new Date(),
      resolverNote: resolverNote ?? null,
    },
  });

  logger.info("Decision resolved", { decisionId, resolution, resolvedBy });

  return { decision };
}

/**
 * Finds all PENDING decisions whose expiresAt is in the past and resolves them
 * according to each policy's timeoutApprove flag.
 */
export async function processTimeouts(): Promise<ProcessTimeoutsResult> {
  const expired = await prisma.policyDecision.findMany({
    where: { status: "PENDING", expiresAt: { lt: new Date() } },
    include: { policy: { select: { timeoutApprove: true } } },
  });

  let approved = 0;
  let rejected = 0;

  await Promise.all(
    expired.map(async (d) => {
      const resolution = d.policy.timeoutApprove ? "APPROVED" : "REJECTED";
      // Auto-resolved decisions are identifiable by resolvedAt IS NOT NULL with no resolvedBy
      await prisma.policyDecision.update({
        where: { id: d.id },
        data: { status: resolution, resolvedAt: new Date() },
      });
      if (d.policy.timeoutApprove) {
        approved++;
      } else {
        rejected++;
      }
      logger.info("Decision timed out", { decisionId: d.id, resolution });
    }),
  );

  return { processed: expired.length, approved, rejected };
}

/**
 * Polls until a decision is no longer PENDING, then returns the final status.
 * Used by handlers that need to block until approval is granted or denied.
 * Max wait: maxWaitMs (default 5 min). Polls every pollIntervalMs (default 3s).
 */
export async function waitForDecision(
  decisionId: string,
  maxWaitMs = 300_000,
  pollIntervalMs = 3_000,
): Promise<PolicyDecision> {
  const deadline = Date.now() + maxWaitMs;

  while (Date.now() < deadline) {
    const decision = await prisma.policyDecision.findUnique({ where: { id: decisionId } });
    if (!decision) throw new Error(`PolicyDecision ${decisionId} not found`);
    if (decision.status !== "PENDING") return decision;

    await new Promise<void>((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  throw new Error(`waitForDecision timed out after ${maxWaitMs}ms for decision ${decisionId}`);
}
