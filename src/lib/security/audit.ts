/**
 * Audit Log — centralized compliance event tracking
 *
 * 2026 coverage (previously missing areas added):
 *   Agent CRUD           auditAgentCreate / auditAgentDelete
 *   KB operations        auditKBSourceAdd / auditKBSourceDelete / auditKBSearch
 *   MCP operations       auditMCPServerCreate / auditMCPServerDelete / auditMCPToolCall
 *   Webhooks             auditWebhookCreate / auditWebhookTrigger
 *   Org operations       auditOrgMemberAdd / auditOrgMemberRemove / auditOrgRoleChange
 *   Skill RBAC           auditSkillAccess / auditSkillAccessDenied
 *   API Keys             auditApiKeyCreate / auditApiKeyRevoke
 *   Executions           auditExecution
 */

import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

export type AuditAction =
  | "CREATE"
  | "UPDATE"
  | "DELETE"
  | "EXECUTE"
  | "ACCESS"
  | "ACCESS_DENIED"
  | "TRIGGER"
  | "REVOKE";

export interface AuditEntry {
  userId?: string;
  action: AuditAction;
  resourceType: string;
  resourceId: string;
  before?: unknown;
  after?: unknown;
  ipAddress?: string;
  userAgent?: string;
}

export interface RequestContext {
  ip?: string;
  userAgent?: string;
}

// ── Core writer ───────────────────────────────────────────────────────────────

export async function writeAuditLog(entry: AuditEntry): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: entry.userId ?? null,
        action: entry.action,
        resourceType: entry.resourceType,
        resourceId: entry.resourceId,
        before: entry.before ? JSON.parse(JSON.stringify(entry.before)) : undefined,
        after: entry.after ? JSON.parse(JSON.stringify(entry.after)) : undefined,
        ipAddress: entry.ipAddress ?? null,
        userAgent: entry.userAgent ?? null,
      },
    });
  } catch (err) {
    logger.error("Failed to write audit log", err, {
      action: entry.action,
      resourceType: entry.resourceType,
      resourceId: entry.resourceId,
    });
  }
}

// ── Agent ─────────────────────────────────────────────────────────────────────

export function auditAgentCreate(
  userId: string,
  agentId: string,
  agentData: unknown,
  req?: RequestContext,
): void {
  writeAuditLog({
    userId, action: "CREATE", resourceType: "Agent", resourceId: agentId,
    after: agentData, ipAddress: req?.ip, userAgent: req?.userAgent,
  }).catch(() => {});
}

export function auditAgentDelete(
  userId: string,
  agentId: string,
  agentData: unknown,
  req?: RequestContext,
): void {
  writeAuditLog({
    userId, action: "DELETE", resourceType: "Agent", resourceId: agentId,
    before: agentData, ipAddress: req?.ip, userAgent: req?.userAgent,
  }).catch(() => {});
}

// ── Knowledge Base ────────────────────────────────────────────────────────────

export function auditKBSourceAdd(
  userId: string,
  agentId: string,
  sourceId: string,
  sourceData: unknown,
  req?: RequestContext,
): void {
  writeAuditLog({
    userId, action: "CREATE", resourceType: "KBSource", resourceId: sourceId,
    after: { agentId, ...JSON.parse(JSON.stringify(sourceData ?? {})) },
    ipAddress: req?.ip, userAgent: req?.userAgent,
  }).catch(() => {});
}

export function auditKBSourceDelete(
  userId: string,
  agentId: string,
  sourceId: string,
  req?: RequestContext,
): void {
  writeAuditLog({
    userId, action: "DELETE", resourceType: "KBSource", resourceId: sourceId,
    before: { agentId }, ipAddress: req?.ip, userAgent: req?.userAgent,
  }).catch(() => {});
}

export function auditKBSearch(
  agentId: string,
  query: string,
  resultCount: number,
  userId?: string,
): void {
  writeAuditLog({
    userId, action: "ACCESS", resourceType: "KnowledgeBase", resourceId: agentId,
    after: { query: query.slice(0, 200), resultCount },
  }).catch(() => {});
}

// ── MCP Servers ───────────────────────────────────────────────────────────────

export function auditMCPServerCreate(
  userId: string,
  serverId: string,
  serverData: unknown,
  req?: RequestContext,
): void {
  writeAuditLog({
    userId, action: "CREATE", resourceType: "MCPServer", resourceId: serverId,
    after: serverData, ipAddress: req?.ip, userAgent: req?.userAgent,
  }).catch(() => {});
}

export function auditMCPServerDelete(
  userId: string,
  serverId: string,
  req?: RequestContext,
): void {
  writeAuditLog({
    userId, action: "DELETE", resourceType: "MCPServer", resourceId: serverId,
    ipAddress: req?.ip, userAgent: req?.userAgent,
  }).catch(() => {});
}

export function auditMCPToolCall(
  agentId: string,
  serverId: string,
  toolName: string,
  userId?: string,
): void {
  writeAuditLog({
    userId, action: "EXECUTE", resourceType: "MCPTool",
    resourceId: `${serverId}:${toolName}`, after: { agentId, toolName },
  }).catch(() => {});
}

// ── Webhooks ──────────────────────────────────────────────────────────────────

export function auditWebhookCreate(
  userId: string,
  webhookId: string,
  agentId: string,
  req?: RequestContext,
): void {
  writeAuditLog({
    userId, action: "CREATE", resourceType: "WebhookConfig", resourceId: webhookId,
    after: { agentId }, ipAddress: req?.ip, userAgent: req?.userAgent,
  }).catch(() => {});
}

export function auditWebhookTrigger(
  webhookId: string,
  agentId: string,
  eventType: string,
  executionId: string,
): void {
  writeAuditLog({
    action: "TRIGGER", resourceType: "WebhookConfig", resourceId: webhookId,
    after: { agentId, eventType, executionId },
  }).catch(() => {});
}

// ── Organization ──────────────────────────────────────────────────────────────

export function auditOrgMemberAdd(
  actorUserId: string,
  orgId: string,
  targetUserId: string,
  role: string,
  req?: RequestContext,
): void {
  writeAuditLog({
    userId: actorUserId, action: "CREATE", resourceType: "OrganizationMember",
    resourceId: `${orgId}:${targetUserId}`,
    after: { orgId, targetUserId, role }, ipAddress: req?.ip, userAgent: req?.userAgent,
  }).catch(() => {});
}

export function auditOrgMemberRemove(
  actorUserId: string,
  orgId: string,
  targetUserId: string,
  req?: RequestContext,
): void {
  writeAuditLog({
    userId: actorUserId, action: "DELETE", resourceType: "OrganizationMember",
    resourceId: `${orgId}:${targetUserId}`,
    before: { orgId, targetUserId }, ipAddress: req?.ip, userAgent: req?.userAgent,
  }).catch(() => {});
}

export function auditOrgRoleChange(
  actorUserId: string,
  orgId: string,
  targetUserId: string,
  oldRole: string,
  newRole: string,
  req?: RequestContext,
): void {
  writeAuditLog({
    userId: actorUserId, action: "UPDATE", resourceType: "OrganizationMember",
    resourceId: `${orgId}:${targetUserId}`,
    before: { role: oldRole }, after: { role: newRole },
    ipAddress: req?.ip, userAgent: req?.userAgent,
  }).catch(() => {});
}

// ── Skill RBAC ────────────────────────────────────────────────────────────────

export function auditSkillAccess(
  userId: string,
  skillId: string,
  agentId: string,
): void {
  writeAuditLog({
    userId, action: "ACCESS", resourceType: "Skill", resourceId: skillId,
    after: { agentId },
  }).catch(() => {});
}

// ── API Keys ──────────────────────────────────────────────────────────────────

export function auditApiKeyCreate(
  userId: string,
  keyId: string,
  scopes: string[],
): void {
  writeAuditLog({
    userId, action: "CREATE", resourceType: "ApiKey", resourceId: keyId,
    after: { scopes },
  }).catch(() => {});
}

export function auditApiKeyRevoke(
  userId: string,
  keyId: string,
): void {
  writeAuditLog({
    userId, action: "REVOKE", resourceType: "ApiKey", resourceId: keyId,
  }).catch(() => {});
}

// ── Executions ────────────────────────────────────────────────────────────────

export function auditExecution(
  agentId: string,
  executionId: string,
  status: string,
  userId?: string,
): void {
  writeAuditLog({
    userId, action: "EXECUTE", resourceType: "AgentExecution", resourceId: executionId,
    after: { agentId, status },
  }).catch(() => {});
}
