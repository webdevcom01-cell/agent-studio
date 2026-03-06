import { describe, it, expect } from "vitest";
import { agentExportSchema } from "../agent-export";

function validExport() {
  return {
    version: 1,
    exportedAt: "2026-03-06T12:00:00.000Z",
    agent: {
      name: "Test Agent",
      description: "A test agent",
      systemPrompt: "You are helpful.",
      model: "deepseek-chat",
    },
    flow: {
      nodes: [
        {
          id: "start",
          type: "ai_response",
          position: { x: 0, y: 0 },
          data: { label: "AI Response" },
        },
      ],
      edges: [],
      variables: [],
    },
  };
}

describe("agentExportSchema", () => {
  it("accepts valid export data", () => {
    const result = agentExportSchema.safeParse(validExport());
    expect(result.success).toBe(true);
  });

  it("rejects version 2", () => {
    const data = { ...validExport(), version: 2 };
    const result = agentExportSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it("rejects version as string", () => {
    const data = { ...validExport(), version: "1" };
    const result = agentExportSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it("rejects missing version", () => {
    const data = validExport();
    const result = agentExportSchema.safeParse({
      exportedAt: data.exportedAt,
      agent: data.agent,
      flow: data.flow,
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing agent name", () => {
    const data = validExport();
    data.agent.name = "";
    const result = agentExportSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it("rejects missing flow", () => {
    const data = validExport();
    const result = agentExportSchema.safeParse({
      version: data.version,
      exportedAt: data.exportedAt,
      agent: data.agent,
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid exportedAt format", () => {
    const data = { ...validExport(), exportedAt: "not-a-date" };
    const result = agentExportSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it("accepts flow with edges and variables", () => {
    const data = {
      ...validExport(),
      flow: {
        nodes: validExport().flow.nodes,
        edges: [
          { id: "e1", source: "start", target: "end", label: "next" },
        ],
        variables: [
          { name: "userName", type: "string" as const, default: "" },
        ],
      },
    };
    const result = agentExportSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it("rejects node with missing position", () => {
    const data = validExport();
    (data.flow.nodes[0] as Record<string, unknown>).position = undefined;
    const result = agentExportSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it("rejects completely empty object", () => {
    const result = agentExportSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});
