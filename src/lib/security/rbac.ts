/**
 * RBAC — Role-Based Access Control for Agent Skills
 *
 * 2026 enterprise standard:
 *  - ACCESS_HIERARCHY: READ < EXECUTE < ADMIN
 *  - checkSkillAccess()    — boolean check (non-blocking)
 *  - enforceSkillAccess()  — throws RBACError on denial (use in API routes & runtime)
 *  - withSkillAccess()     — async wrapper / decorator
 *  - listAccessibleSkills() — returns skills reachable at given level
 *  - grantSkillAccess() / revokeSkillAccess() / getAgentSkills() — CRUD
 */

import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { writeAuditLog } from "@/lib/security/audit";
import type { AccessLevel } from "@/generated/prisma";

// ── Hierarchy ────────────────────────────────────────────────────────────────

const ACCESS_HIERARCHY: Record<string, number> = {
  READ: 1,
  EXECUTE: 2,
  ADMIN: 3,
};

// ── Typed Error ──────────────────────────────────────────────────────────────

export class RBACError extends Error {
  readonly agentId: string;
  readonly skillId: string;
  readonly requiredLevel: AccessLevel;
  readonly grantedLevel: AccessLevel | null;

  constructor(
    agentId: string,
    skillId: string,
    requiredLevel: AccessLevel,
    grantedLevel: AccessLevel | null,
  ) {
    super(
      `Agent '${agentId}' requires ${requiredLevel} access to skill '${skillId}'` +
        (grantedLevel ? `, but only has ${grantedLevel}` : " but has no access"),
    );
    this.name = "RBACError";
    this.agentId = agentId;
    this.skillId = skillId;
    this.requiredLevel = requiredLevel;
    this.grantedLevel = grantedLevel;
  }
}

// ── Core check — boolean, non-blocking ───────────────────────────────────────

export async function checkSkillAccess(
  agentId: string,
  skillId: string,
  requiredLevel: AccessLevel,
): Promise<boolean> {
  const permission = await prisma.agentSkillPermission.findUnique({
    where: { agentId_skillId: { agentId, skillId } },
    select: { accessLevel: true },
  });

  if (!permission) return false;

  const grantedRank = ACCESS_HIERARCHY[permission.accessLevel] ?? 0;
  const requiredRank = ACCESS_HIERARCHY[requiredLevel] ?? 0;

  return grantedRank >= requiredRank;
}

// ── Enforcement — throws RBACError on denial ─────────────────────────────────
// Use in API route handlers and runtime node handlers.

export async function enforceSkillAccess(
  agentId: string,
  skillId: string,
  requiredLevel: AccessLevel,
  userId?: string,
): Promise<void> {
  const permission = await prisma.agentSkillPermission.findUnique({
    where: { agentId_skillId: { agentId, skillId } },
    select: { accessLevel: true },
  });

  const grantedLevel = (permission?.accessLevel ?? null) as AccessLevel | null;
  const grantedRank = grantedLevel ? (ACCESS_HIERARCHY[grantedLevel] ?? 0) : 0;
  const requiredRank = ACCESS_HIERARCHY[requiredLevel] ?? 0;

  if (grantedRank < requiredRank) {
    logger.warn("RBAC denial", { agentId, skillId, requiredLevel, grantedLevel, userId });

    // Audit the denial for compliance — fire-and-forget
    writeAuditLog({
      userId,
      action: "ACCESS_DENIED",
      resourceType: "Skill",
      resourceId: skillId,
      after: { agentId, requiredLevel, grantedLevel },
    }).catch(() => {});

    throw new RBACError(agentId, skillId, requiredLevel, grantedLevel);
  }

  // Audit successful access
  writeAuditLog({
    userId,
    action: "ACCESS",
    resourceType: "Skill",
    resourceId: skillId,
    after: { agentId, grantedLevel },
  }).catch(() => {});
}

// ── Async wrapper / decorator ────────────────────────────────────────────────
// Wraps any async function with a RBAC pre-check.
// Throws RBACError before the wrapped fn is called.

export async function withSkillAccess<T>(
  agentId: string,
  skillId: string,
  requiredLevel: AccessLevel,
  fn: () => Promise<T>,
  userId?: string,
): Promise<T> {
  await enforceSkillAccess(agentId, skillId, requiredLevel, userId);
  return fn();
}

// ── List accessible skills for an agent ──────────────────────────────────────

export async function listAccessibleSkills(
  agentId: string,
  minimumLevel: AccessLevel = "READ",
): Promise<{ skillId: string; accessLevel: AccessLevel }[]> {
  const requiredRank = ACCESS_HIERARCHY[minimumLevel] ?? 1;

  const permissions = await prisma.agentSkillPermission.findMany({
    where: { agentId },
    select: { skillId: true, accessLevel: true },
  });

  return permissions.filter(
    (p) => (ACCESS_HIERARCHY[p.accessLevel] ?? 0) >= requiredRank,
  );
}

// ── CRUD helpers ─────────────────────────────────────────────────────────────

export async function grantSkillAccess(
  agentId: string,
  skillId: string,
  level: AccessLevel,
  grantedByUserId?: string,
): Promise<void> {
  await prisma.agentSkillPermission.upsert({
    where: { agentId_skillId: { agentId, skillId } },
    create: { agentId, skillId, accessLevel: level },
    update: { accessLevel: level },
  });

  writeAuditLog({
    userId: grantedByUserId,
    action: "CREATE",
    resourceType: "AgentSkillPermission",
    resourceId: `${agentId}:${skillId}`,
    after: { agentId, skillId, accessLevel: level },
  }).catch(() => {});
}

export async function revokeSkillAccess(
  agentId: string,
  skillId: string,
  revokedByUserId?: string,
): Promise<void> {
  await prisma.agentSkillPermission.deleteMany({
    where: { agentId, skillId },
  });

  writeAuditLog({
    userId: revokedByUserId,
    action: "DELETE",
    resourceType: "AgentSkillPermission",
    resourceId: `${agentId}:${skillId}`,
    before: { agentId, skillId },
  }).catch(() => {});
}

export async function getAgentSkills(
  agentId: string,
): Promise<{ skillId: string; accessLevel: AccessLevel }[]> {
  const permissions = await prisma.agentSkillPermission.findMany({
    where: { agentId },
    select: { skillId: true, accessLevel: true },
  });
  return permissions;
}
