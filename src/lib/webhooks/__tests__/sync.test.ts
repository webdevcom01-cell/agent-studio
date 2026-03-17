import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock("@/lib/prisma", () => {
  const mockFindMany = vi.fn();
  const mockCreate = vi.fn();
  const mockUpdate = vi.fn();
  return {
    prisma: {
      webhookConfig: {
        findMany: mockFindMany,
        create: mockCreate,
        update: mockUpdate,
      },
    },
  };
});

vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("../verify", () => ({
  generateWebhookSecret: vi.fn(() => "test-generated-secret-43chars-xxxxxxxxxxxxx"),
}));

import { syncWebhooksFromFlow } from "../sync";
import { prisma } from "@/lib/prisma";
import type { FlowContent } from "@/types";

// ── Helpers ────────────────────────────────────────────────────────────────────

const AGENT_ID = "agent-sync-test";

function makeFlowContent(webhookNodes: Array<{ id: string; label?: string }>): FlowContent {
  return {
    nodes: webhookNodes.map(({ id, label }) => ({
      id,
      type: "webhook_trigger",
      position: { x: 0, y: 0 },
      data: {
        label: label ?? "Webhook Trigger",
        outputVariable: "webhook_payload",
      },
    })),
    edges: [],
    variables: [],
  };
}

function makeExistingWebhook(overrides: Record<string, unknown> = {}) {
  return {
    id: "wh-existing-001",
    nodeId: "node-wh-1",
    name: "Webhook Trigger",
    enabled: true,
    ...overrides,
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("syncWebhooksFromFlow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.webhookConfig.create).mockResolvedValue({} as never);
    vi.mocked(prisma.webhookConfig.update).mockResolvedValue({} as never);
  });

  describe("creating webhooks on first deploy", () => {
    it("creates a WebhookConfig for each webhook_trigger node", async () => {
      vi.mocked(prisma.webhookConfig.findMany).mockResolvedValue([]);

      const flow = makeFlowContent([
        { id: "node-wh-1", label: "GitHub Events" },
        { id: "node-wh-2", label: "Stripe Events" },
      ]);

      const result = await syncWebhooksFromFlow(AGENT_ID, flow);

      expect(result.created).toBe(2);
      expect(result.updated).toBe(0);
      expect(result.disabled).toBe(0);
      expect(prisma.webhookConfig.create).toHaveBeenCalledTimes(2);
    });

    it("creates webhook with correct agentId, nodeId, name, secret", async () => {
      vi.mocked(prisma.webhookConfig.findMany).mockResolvedValue([]);

      const flow = makeFlowContent([{ id: "node-wh-1", label: "My Webhook" }]);
      await syncWebhooksFromFlow(AGENT_ID, flow);

      const createArg = vi.mocked(prisma.webhookConfig.create).mock.calls[0][0];
      expect(createArg.data.agentId).toBe(AGENT_ID);
      expect(createArg.data.nodeId).toBe("node-wh-1");
      expect(createArg.data.name).toBe("My Webhook");
      expect(createArg.data.secret).toBe("test-generated-secret-43chars-xxxxxxxxxxxxx");
      expect(createArg.data.enabled).toBe(true);
    });

    it("does nothing when flow has no webhook_trigger nodes", async () => {
      vi.mocked(prisma.webhookConfig.findMany).mockResolvedValue([]);

      const emptyFlow: FlowContent = {
        nodes: [
          { id: "msg-1", type: "message", position: { x: 0, y: 0 }, data: { label: "Hello" } },
        ],
        edges: [],
        variables: [],
      };

      const result = await syncWebhooksFromFlow(AGENT_ID, emptyFlow);

      expect(result.created).toBe(0);
      expect(result.updated).toBe(0);
      expect(result.disabled).toBe(0);
      expect(prisma.webhookConfig.create).not.toHaveBeenCalled();
    });
  });

  describe("updating existing webhooks", () => {
    it("updates the name when node label changes", async () => {
      vi.mocked(prisma.webhookConfig.findMany).mockResolvedValue([
        makeExistingWebhook({ nodeId: "node-wh-1", name: "Old Name" }) as never,
      ]);

      const flow = makeFlowContent([{ id: "node-wh-1", label: "New Name" }]);
      const result = await syncWebhooksFromFlow(AGENT_ID, flow);

      expect(result.updated).toBe(1);
      expect(prisma.webhookConfig.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "wh-existing-001" },
          data: { name: "New Name" },
        }),
      );
    });

    it("does not update when label is unchanged", async () => {
      vi.mocked(prisma.webhookConfig.findMany).mockResolvedValue([
        makeExistingWebhook({ nodeId: "node-wh-1", name: "Webhook Trigger" }) as never,
      ]);

      const flow = makeFlowContent([{ id: "node-wh-1", label: "Webhook Trigger" }]);
      const result = await syncWebhooksFromFlow(AGENT_ID, flow);

      expect(result.updated).toBe(0);
      expect(prisma.webhookConfig.update).not.toHaveBeenCalled();
    });

    it("never overwrites the secret on update", async () => {
      vi.mocked(prisma.webhookConfig.findMany).mockResolvedValue([
        makeExistingWebhook({ nodeId: "node-wh-1", name: "Old Name" }) as never,
      ]);

      const flow = makeFlowContent([{ id: "node-wh-1", label: "New Name" }]);
      await syncWebhooksFromFlow(AGENT_ID, flow);

      const updateArg = vi.mocked(prisma.webhookConfig.update).mock.calls[0][0];
      expect((updateArg.data as Record<string, unknown>).secret).toBeUndefined();
    });
  });

  describe("disabling removed webhooks", () => {
    it("disables webhooks whose node was removed from the flow", async () => {
      vi.mocked(prisma.webhookConfig.findMany).mockResolvedValue([
        makeExistingWebhook({ nodeId: "node-wh-1", enabled: true }) as never,
        makeExistingWebhook({
          id: "wh-existing-002",
          nodeId: "node-wh-2",
          enabled: true,
        }) as never,
      ]);

      // Only node-wh-1 survives; node-wh-2 was removed from the flow
      const flow = makeFlowContent([{ id: "node-wh-1" }]);
      const result = await syncWebhooksFromFlow(AGENT_ID, flow);

      expect(result.disabled).toBe(1);
      expect(prisma.webhookConfig.update).toHaveBeenCalledWith({
        where: { id: "wh-existing-002" },
        data: { enabled: false },
      });
    });

    it("does not try to disable already-disabled webhooks", async () => {
      vi.mocked(prisma.webhookConfig.findMany).mockResolvedValue([
        makeExistingWebhook({ nodeId: "node-wh-1", enabled: false }) as never,
      ]);

      // node-wh-1 is NOT in the flow
      const flow = makeFlowContent([]);
      const result = await syncWebhooksFromFlow(AGENT_ID, flow);

      expect(result.disabled).toBe(0);
      expect(prisma.webhookConfig.update).not.toHaveBeenCalled();
    });
  });

  describe("error handling", () => {
    it("handles create failure gracefully and continues", async () => {
      vi.mocked(prisma.webhookConfig.findMany).mockResolvedValue([]);
      vi.mocked(prisma.webhookConfig.create)
        .mockRejectedValueOnce(new Error("unique constraint")) // node-wh-1 fails
        .mockResolvedValueOnce({} as never); // node-wh-2 succeeds

      const flow = makeFlowContent([
        { id: "node-wh-1" },
        { id: "node-wh-2" },
      ]);

      // Should not throw
      const result = await syncWebhooksFromFlow(AGENT_ID, flow);

      // Both attempted; one succeeded (the created count only increments on success)
      expect(result.created).toBe(1);
    });

    it("handles disable failure gracefully and continues", async () => {
      vi.mocked(prisma.webhookConfig.findMany).mockResolvedValue([
        makeExistingWebhook({
          id: "wh-001",
          nodeId: "node-wh-1",
          enabled: true,
        }) as never,
        makeExistingWebhook({
          id: "wh-002",
          nodeId: "node-wh-2",
          enabled: true,
        }) as never,
      ]);
      vi.mocked(prisma.webhookConfig.update)
        .mockRejectedValueOnce(new Error("DB error"))
        .mockResolvedValueOnce({} as never);

      // Both nodes removed from flow
      const flow = makeFlowContent([]);
      const result = await syncWebhooksFromFlow(AGENT_ID, flow);

      // First disable failed, second succeeded
      expect(result.disabled).toBe(1);
    });
  });

  describe("idempotency", () => {
    it("is idempotent — running twice produces same result", async () => {
      vi.mocked(prisma.webhookConfig.findMany).mockResolvedValue([]);

      const flow = makeFlowContent([{ id: "node-wh-1" }]);

      // First run
      const r1 = await syncWebhooksFromFlow(AGENT_ID, flow);
      expect(r1.created).toBe(1);

      // Second run — simulate the DB now has the created entry
      vi.mocked(prisma.webhookConfig.findMany).mockResolvedValue([
        makeExistingWebhook({ nodeId: "node-wh-1", name: "Webhook Trigger" }) as never,
      ]);

      const r2 = await syncWebhooksFromFlow(AGENT_ID, flow);
      expect(r2.created).toBe(0);
      expect(r2.updated).toBe(0);
      expect(r2.disabled).toBe(0);
    });
  });
});
