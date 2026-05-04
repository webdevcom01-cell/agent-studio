import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockAgentFindUnique,
  mockFlowCreate,
  mockMCPServerCreate,
  mockAgentMCPServerCreate,
  mockHeartbeatConfigCreate,
  mockGoalCreate,
  mockAgentGoalLinkCreate,
  mockAgentCreate,
} = vi.hoisted(() => ({
  mockAgentFindUnique: vi.fn(),
  mockFlowCreate: vi.fn(),
  mockMCPServerCreate: vi.fn(),
  mockAgentMCPServerCreate: vi.fn(),
  mockHeartbeatConfigCreate: vi.fn(),
  mockGoalCreate: vi.fn(),
  mockAgentGoalLinkCreate: vi.fn(),
  mockAgentCreate: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    agent: { findUnique: mockAgentFindUnique, create: mockAgentCreate },
    flow: { create: mockFlowCreate },
    mCPServer: { create: mockMCPServerCreate },
    agentMCPServer: { create: mockAgentMCPServerCreate },
    heartbeatConfig: { create: mockHeartbeatConfigCreate },
    goal: { create: mockGoalCreate },
    agentGoalLink: { create: mockAgentGoalLinkCreate },
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { createHash } from "node:crypto";
import {
  scrubSecrets,
  validateTemplatePayload,
  exportTemplate,
  importTemplate,
} from "../template-engine";
import type { TemplatePayload } from "../template-engine";

// ── scrubSecrets ─────────────────────────────────────────────────────────────

describe("scrubSecrets", () => {
  it("removes strings matching API key pattern", () => {
    expect(scrubSecrets("sk-abc12345678")).toBe("{API_KEY_REDACTED}");
    expect(scrubSecrets("key-abc12345678")).toBe("{API_KEY_REDACTED}");
    expect(scrubSecrets("pk_abc12345678")).toBe("{API_KEY_REDACTED}");
  });

  it("replaces URLs with {URL_REDACTED} (except safe domains)", () => {
    expect(scrubSecrets("connect to https://my-backend.railway.app/api")).toBe(
      "connect to {URL_REDACTED}",
    );
    expect(scrubSecrets("see https://anthropic.com/docs")).toBe(
      "see https://anthropic.com/docs",
    );
    expect(scrubSecrets("endpoint: https://api.openai.com/v1")).toBe(
      "endpoint: https://api.openai.com/v1",
    );
    expect(scrubSecrets("deploy at https://my-app.vercel.app")).toBe(
      "deploy at https://my-app.vercel.app",
    );
  });

  it("handles nested objects recursively", () => {
    const input = {
      key: "sk-secret12345",
      nested: {
        url: "https://private.example.com",
        safe: "https://openai.com/v1",
      },
    };
    const result = scrubSecrets(input) as Record<string, unknown>;
    expect(result.key).toBe("{API_KEY_REDACTED}");
    const nested = result.nested as Record<string, unknown>;
    expect(nested.url).toBe("{URL_REDACTED}");
    expect(nested.safe).toBe("https://openai.com/v1");
  });

  it("handles arrays recursively", () => {
    const result = scrubSecrets(["sk-secret12345", "normal text", "https://private.io"]) as string[];
    expect(result[0]).toBe("{API_KEY_REDACTED}");
    expect(result[1]).toBe("normal text");
    expect(result[2]).toBe("{URL_REDACTED}");
  });

  it("leaves safe values unchanged (numbers, booleans, null)", () => {
    expect(scrubSecrets(42)).toBe(42);
    expect(scrubSecrets(true)).toBe(true);
    expect(scrubSecrets(null)).toBeNull();
  });
});

// ── validateTemplatePayload ──────────────────────────────────────────────────

describe("validateTemplatePayload", () => {
  const validPayload: TemplatePayload = {
    version: "1.0",
    exportedAt: new Date().toISOString(),
    sourceOrganizationId: "org-abcd",
    agent: { name: "Test Agent", description: null, systemPrompt: null, modelId: null, maxTokens: null, temperature: 0.7, tags: [] },
    flows: [],
    mcpServers: [],
    goals: [],
  };

  it("returns valid=true for correct payload", () => {
    const result = validateTemplatePayload(validPayload);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("returns errors when required fields missing", () => {
    const result = validateTemplatePayload({ version: "1.0" });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some((e) => e.includes("exportedAt"))).toBe(true);
  });

  it("returns error for non-object payload", () => {
    const result = validateTemplatePayload("not an object");
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("object");
  });

  it("returns error when agent.name is missing", () => {
    const bad = { ...validPayload, agent: { ...validPayload.agent, name: "" } };
    const result = validateTemplatePayload(bad);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("agent.name"))).toBe(true);
  });

  it("returns errors when array fields are missing", () => {
    const bad = { ...validPayload, flows: undefined, goals: undefined };
    const result = validateTemplatePayload(bad);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("flows"))).toBe(true);
    expect(result.errors.some((e) => e.includes("goals"))).toBe(true);
  });
});

// ── exportTemplate ───────────────────────────────────────────────────────────

describe("exportTemplate", () => {
  const agentRow = {
    id: "agent-1",
    name: "My Agent",
    description: "An agent",
    systemPrompt: "You are helpful. Reach me at https://internal.company.com/webhook",
    model: "deepseek-chat",
    temperature: 0.7,
    tags: ["sales"],
    flow: {
      id: "flow-1",
      name: "Main Flow",
      content: { nodes: [{ data: { apiKey: "sk-realkey12345678" } }], edges: [] },
    },
    mcpServers: [
      {
        mcpServer: { id: "mcp-1", name: "My MCP Tool", url: "https://private-mcp.railway.app/mcp" },
      },
    ],
    heartbeatConfig: {
      cronExpression: "0 * * * *",
      timezone: "UTC",
      systemPrompt: null,
      maxContextItems: 50,
    },
    goalLinks: [
      {
        goal: {
          id: "goal-1",
          title: "Increase revenue",
          description: null,
          successMetric: "ARR > $1M",
          priority: 80,
          status: "ACTIVE",
        },
      },
    ],
  };

  beforeEach(() => {
    mockAgentFindUnique.mockResolvedValue(agentRow);
  });

  it("calls prisma to load agent + flows + mcpServers", async () => {
    await exportTemplate("agent-1", "org-1234567890");
    expect(mockAgentFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "agent-1" } }),
    );
  });

  it("returns scrubbed payload — no real URLs, no API keys", async () => {
    const { payload } = await exportTemplate("agent-1", "org-1234567890");

    expect(payload.agent.systemPrompt).not.toContain("internal.company.com");
    expect(payload.agent.systemPrompt).toContain("{URL_REDACTED}");
    expect(JSON.stringify(payload.flows)).not.toContain("sk-realkey12345678");
    expect(JSON.stringify(payload.flows)).toContain("{API_KEY_REDACTED}");
    expect(payload.mcpServers[0].url).toBe("${MCP_SERVER_MY_MCP_TOOL_URL}");
  });

  it("computes checksum correctly", async () => {
    const { checksum } = await exportTemplate("agent-1", "org-1234567890");
    expect(typeof checksum).toBe("string");
    expect(checksum).toHaveLength(64); // SHA-256 hex
    // Deterministic: same payload → same checksum
    const { checksum: checksum2 } = await exportTemplate("agent-1", "org-1234567890");
    expect(checksum).toBe(checksum2);
  });

  it("includes heartbeat config and goals in payload", async () => {
    const { payload } = await exportTemplate("agent-1", "org-1234567890");
    expect(payload.heartbeatConfig?.cronExpression).toBe("0 * * * *");
    expect(payload.goals).toHaveLength(1);
    expect(payload.goals[0].title).toBe("Increase revenue");
  });

  it("throws when agent not found", async () => {
    mockAgentFindUnique.mockResolvedValue(null);
    await expect(exportTemplate("nonexistent", "org-1")).rejects.toThrow("not found");
  });
});

// ── importTemplate ───────────────────────────────────────────────────────────

describe("importTemplate", () => {
  const validPayload: TemplatePayload = {
    version: "1.0",
    exportedAt: "2026-01-01T00:00:00.000Z",
    sourceOrganizationId: "org-abcd",
    agent: {
      name: "Imported Agent",
      description: null,
      systemPrompt: "You are helpful.",
      modelId: "deepseek-chat",
      maxTokens: null,
      temperature: 0.7,
      tags: [],
    },
    flows: [{ name: "Main Flow", description: null, definition: { nodes: [], edges: [] } }],
    mcpServers: [{ name: "My Tool", url: "${MCP_SERVER_MY_TOOL_URL}", description: null }],
    goals: [{ title: "Grow revenue", description: null, successMetric: null, priority: 70 }],
  };

  function makeChecksum(p: TemplatePayload): string {
    const canonical = JSON.stringify(p, Object.keys(p).sort());
    return createHash("sha256").update(canonical).digest("hex");
  }

  beforeEach(() => {
    mockAgentCreate.mockResolvedValue({ id: "new-agent-1" });
    mockFlowCreate.mockResolvedValue({ id: "new-flow-1" });
    mockMCPServerCreate.mockResolvedValue({ id: "new-mcp-1" });
    mockAgentMCPServerCreate.mockResolvedValue({});
    mockGoalCreate.mockResolvedValue({ id: "new-goal-1" });
    mockAgentGoalLinkCreate.mockResolvedValue({});
  });

  it("throws when checksum mismatch", async () => {
    await expect(importTemplate(validPayload, "bad-checksum", "org-new")).rejects.toThrow(
      "checksum mismatch",
    );
  });

  it("creates agent + flows in DB with new IDs", async () => {
    const checksum = makeChecksum(validPayload);
    const result = await importTemplate(validPayload, checksum, "org-new");

    expect(mockAgentCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: "Imported Agent",
          organizationId: "org-new",
        }),
      }),
    );
    expect(mockFlowCreate).toHaveBeenCalledOnce();
    expect(result.agentId).toBe("new-agent-1");
    expect(result.flowIds).toEqual(["new-flow-1"]);
  });

  it("returns warnings for placeholder values in MCP server URLs", async () => {
    const checksum = makeChecksum(validPayload);
    const result = await importTemplate(validPayload, checksum, "org-new");

    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain("placeholder URL");
    expect(result.warnings[0]).toContain("My Tool");
  });

  it("returns no warnings when MCP server URL is a real URL", async () => {
    const payloadWithRealUrl = {
      ...validPayload,
      mcpServers: [{ name: "Real Tool", url: "https://mcp.example.com", description: null }],
    };
    const checksum = makeChecksum(payloadWithRealUrl);
    const result = await importTemplate(payloadWithRealUrl, checksum, "org-new");
    expect(result.warnings).toHaveLength(0);
  });
});
