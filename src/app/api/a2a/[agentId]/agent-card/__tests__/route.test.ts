import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGenerateAgentCardV03 = vi.hoisted(() => vi.fn());

vi.mock("@/lib/a2a/card-generator", () => ({
  generateAgentCardV03: mockGenerateAgentCardV03,
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { GET } from "../route";
import { NextRequest } from "next/server";

function makeRequest(agentId = "agent-1"): NextRequest {
  return new NextRequest(`http://localhost:3000/api/a2a/${agentId}/agent-card`);
}

function makeParams(agentId = "agent-1") {
  return { params: Promise.resolve({ agentId }) };
}

const SAMPLE_CARD = {
  "@context": "https://schema.org" as const,
  "@type": "SoftwareAgent" as const,
  name: "Test Agent",
  description: "A test agent",
  url: "http://localhost:3000/api/agents/agent-1/a2a",
  version: "0.3",
  capabilities: { streaming: true, pushNotifications: false },
  skills: [
    {
      id: "chat",
      name: "Chat with Test Agent",
      description: "A test agent",
      inputModes: ["text"],
      outputModes: ["text"],
    },
  ],
  authentication: { schemes: ["none"] },
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/a2a/[agentId]/agent-card", () => {
  it("returns A2A v0.3 card for a public agent", async () => {
    mockGenerateAgentCardV03.mockResolvedValueOnce(SAMPLE_CARD);

    const res = await GET(makeRequest(), makeParams());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body["@context"]).toBe("https://schema.org");
    expect(body["@type"]).toBe("SoftwareAgent");
    expect(body.name).toBe("Test Agent");
    expect(body.version).toBe("0.3");
    expect(body.capabilities.streaming).toBe(true);
    expect(body.capabilities.pushNotifications).toBe(false);
    expect(body.authentication.schemes).toContain("none");
  });

  it("sets Cache-Control: public header", async () => {
    mockGenerateAgentCardV03.mockResolvedValueOnce(SAMPLE_CARD);

    const res = await GET(makeRequest(), makeParams());

    expect(res.headers.get("Cache-Control")).toContain("public");
  });

  it("returns 404 when agent not found", async () => {
    mockGenerateAgentCardV03.mockRejectedValueOnce(new Error("Agent not found"));

    const res = await GET(makeRequest("nonexistent"), makeParams("nonexistent"));
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toContain("not found");
  });

  it("returns 403 for private agent", async () => {
    mockGenerateAgentCardV03.mockRejectedValueOnce(new Error("Agent card not public"));

    const res = await GET(makeRequest("private-agent"), makeParams("private-agent"));
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error).toContain("not available");
  });

  it("returns 500 on unexpected error", async () => {
    mockGenerateAgentCardV03.mockRejectedValueOnce(new Error("DB connection failed"));

    const res = await GET(makeRequest(), makeParams());
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toBe("Internal server error");
  });

  it("includes skills array in the response", async () => {
    mockGenerateAgentCardV03.mockResolvedValueOnce({
      ...SAMPLE_CARD,
      skills: [
        { id: "skill-1", name: "Summarize", description: "Summarize text", inputModes: ["text"], outputModes: ["text"] },
        { id: "skill-2", name: "Extract", description: "Extract data", inputModes: ["text"], outputModes: ["text"] },
      ],
    });

    const res = await GET(makeRequest(), makeParams());
    const body = await res.json();

    expect(body.skills).toHaveLength(2);
    expect(body.skills[0].id).toBe("skill-1");
    expect(body.skills[1].id).toBe("skill-2");
  });
});
