import { describe, it, expect, vi, beforeEach } from "vitest";

const mockListPublicAgentCards = vi.hoisted(() => vi.fn());

vi.mock("@/lib/a2a/card-generator", () => ({
  listPublicAgentCards: mockListPublicAgentCards,
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { GET } from "../route";
import { NextRequest } from "next/server";

function makeRequest(): NextRequest {
  return new NextRequest("http://localhost:3000/.well-known/agent-cards");
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /.well-known/agent-cards", () => {
  it("returns list of public agent cards", async () => {
    mockListPublicAgentCards.mockResolvedValueOnce([
      {
        name: "Agent One",
        description: "First agent",
        cardUrl: "http://localhost:3000/api/a2a/agent-1/agent-card",
      },
      {
        name: "Agent Two",
        description: "Second agent",
        cardUrl: "http://localhost:3000/api/a2a/agent-2/agent-card",
      },
    ]);

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.agents).toHaveLength(2);
    expect(body.count).toBe(2);
    expect(body.agents[0].name).toBe("Agent One");
    expect(body.agents[0].cardUrl).toContain("/api/a2a/agent-1/agent-card");
  });

  it("returns empty list when no public agents exist", async () => {
    mockListPublicAgentCards.mockResolvedValueOnce([]);

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.agents).toHaveLength(0);
    expect(body.count).toBe(0);
  });

  it("sets Cache-Control: public header", async () => {
    mockListPublicAgentCards.mockResolvedValueOnce([]);

    const res = await GET(makeRequest());

    expect(res.headers.get("Cache-Control")).toContain("public");
  });

  it("returns 500 on unexpected error", async () => {
    mockListPublicAgentCards.mockRejectedValueOnce(new Error("DB error"));

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toBe("Internal server error");
  });

  it("passes base URL to listPublicAgentCards", async () => {
    mockListPublicAgentCards.mockResolvedValueOnce([]);

    await GET(makeRequest());

    expect(mockListPublicAgentCards).toHaveBeenCalledWith("http://localhost:3000");
  });
});
