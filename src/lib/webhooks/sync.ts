/**
 * syncWebhooksFromFlow
 *
 * Called automatically after a flow is deployed. Scans the deployed FlowContent
 * for `webhook_trigger` nodes and keeps the WebhookConfig table in sync:
 *
 *   • UPSERT  — creates or updates a WebhookConfig for each webhook_trigger node
 *               (matched by agentId + nodeId via @@unique([agentId, nodeId]))
 *   • DISABLE — disables webhook configs whose nodeId no longer exists in the flow
 *               (soft-delete: keeps execution history, just sets enabled=false)
 *
 * WebhookConfigs created manually via API (nodeId = null) are never touched.
 */

import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { generateWebhookSecret, encryptWebhookSecret } from "./verify";
import type { FlowContent } from "@/types";

// ─── Types ────────────────────────────────────────────────────────────────────

interface WebhookNodeData {
  label?: string;
  outputVariable?: string;
  eventTypeVariable?: string;
}

interface SyncResult {
  created: number;
  updated: number;
  disabled: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseNodeData(raw: unknown): WebhookNodeData {
  if (!raw || typeof raw !== "object") return {};
  return raw as WebhookNodeData;
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Sync WebhookConfig records for an agent based on the deployed flow content.
 * Must run after the deploy transaction commits so it never blocks the response.
 */
export async function syncWebhooksFromFlow(
  agentId: string,
  flowContent: FlowContent,
): Promise<SyncResult> {
  const result: SyncResult = { created: 0, updated: 0, disabled: 0 };

  // ── Find all webhook_trigger nodes ─────────────────────────────────────────
  const webhookNodes = flowContent.nodes.filter(
    (n) => n.type === "webhook_trigger",
  );

  // ── Load existing node-linked webhook configs ───────────────────────────────
  const existing = await prisma.webhookConfig.findMany({
    where: { agentId, nodeId: { not: null } },
    select: {
      id: true,
      nodeId: true,
      name: true,
      enabled: true,
    },
  });

  const existingByNodeId = new Map(
    existing
      .filter((w) => w.nodeId != null)
      .map((w) => [w.nodeId as string, w]),
  );

  const processedNodeIds = new Set<string>();

  // ── Upsert each webhook_trigger node ───────────────────────────────────────
  for (const node of webhookNodes) {
    const nodeId = node.id;
    const nodeData = parseNodeData(node.data);
    const name = nodeData.label || "Webhook Trigger";

    processedNodeIds.add(nodeId);
    const existingRecord = existingByNodeId.get(nodeId);

    if (!existingRecord) {
      // CREATE — generate a fresh secret on first deploy
      try {
        const plaintextSecret = generateWebhookSecret();
        const { encrypted, isEncrypted } = encryptWebhookSecret(plaintextSecret);
        await prisma.webhookConfig.create({
          data: {
            agentId,
            nodeId,
            name,
            secret: encrypted,
            secretEncrypted: isEncrypted,
            enabled: true,
            bodyMappings: [],
            headerMappings: [],
          },
        });
        result.created++;
        logger.info("webhook_sync_created", { agentId, nodeId, name });
      } catch (err) {
        // Handle potential race: another deploy created it concurrently.
        // @@unique([agentId, nodeId]) means we can safely ignore duplicate errors.
        logger.warn("webhook_sync_create_failed", { agentId, nodeId, err });
      }
    } else {
      // UPDATE — only sync the name if it changed; never overwrite the secret
      if (existingRecord.name !== name) {
        try {
          await prisma.webhookConfig.update({
            where: { id: existingRecord.id },
            data: { name },
          });
          result.updated++;
          logger.info("webhook_sync_updated", { agentId, nodeId, name });
        } catch (err) {
          logger.warn("webhook_sync_update_failed", { agentId, nodeId, err });
        }
      }
    }
  }

  // ── Disable node-linked webhooks whose node was removed ────────────────────
  for (const [nodeId, record] of existingByNodeId) {
    if (!processedNodeIds.has(nodeId) && record.enabled) {
      try {
        await prisma.webhookConfig.update({
          where: { id: record.id },
          data: { enabled: false },
        });
        result.disabled++;
        logger.info("webhook_sync_disabled", { agentId, nodeId });
      } catch (err) {
        logger.warn("webhook_sync_disable_failed", { agentId, nodeId, err });
      }
    }
  }

  logger.info("webhook_sync_complete", { agentId, ...result });
  return result;
}
