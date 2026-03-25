import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockAuth = vi.hoisted(() => vi.fn());
const mockPrisma = vi.hoisted(() => ({
  agent: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  flow: {
    findUnique: vi.fn(),
    upsert: vi.fn(),
  },
  flowVersion: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
  },
  kBSource: {
    findMany: vi.fn(),
    count: vi.fn(),
  },
  $transaction: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: mockAuth }));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/a2a/card-generator", () => ({
  upsertAgentCard: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/versioning/version-service", () => ({
  VersionService: {
    createVersion: vi.fn().mockResolvedValue({ id: "v1", version: 1 }),
    listVersions: vi.fn().mockResolvedValue([]),
  },
}));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@/lib/knowledge/ingest", () => ({
  ingestSource: vi.fn().mockResolvedValue(undefined),
  deleteSourceChunks: vi.fn().mockResolvedValue(undefined),
}));

function makeRequest(
  url: string,
  method: string,
  body?: Record<string, unknown>
): NextRequest {
  const options: { method: string; body?: string; headers?: Record<string, string> } = { method };
  if (body) {
    options.body = JSON.stringify(body);
    options.headers = { "Content-Type": "application/json" };
  }
  return new NextRequest(new URL(url, "http://localhost:3000"), options);
}

const AGENT_ID = "clh1234567890abcdef12345";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Auth Security - Unauthenticated Access", () => {
  beforeEach(() => {
    mockAuth.mockResolvedValue(null);
  });

  it("GET /api/agents/[agentId] returns 401", async () => {
    const { GET } = await import(
      "@/app/api/agents/[agentId]/route"
    );
    const req = makeRequest("/api/agents/agent1", "GET");
    const res = await GET(req, { params: Promise.resolve({ agentId: AGENT_ID }) });
    expect(res.status).toBe(401);
  });

  it("PATCH /api/agents/[agentId] returns 401", async () => {
    const { PATCH } = await import(
      "@/app/api/agents/[agentId]/route"
    );
    const req = makeRequest("/api/agents/agent1", "PATCH", { name: "new" });
    const res = await PATCH(req, { params: Promise.resolve({ agentId: AGENT_ID }) });
    expect(res.status).toBe(401);
  });

  it("DELETE /api/agents/[agentId] returns 401", async () => {
    const { DELETE } = await import(
      "@/app/api/agents/[agentId]/route"
    );
    const req = makeRequest("/api/agents/agent1", "DELETE");
    const res = await DELETE(req, { params: Promise.resolve({ agentId: AGENT_ID }) });
    expect(res.status).toBe(401);
  });

  it("GET /api/agents/[agentId]/flow returns 401", async () => {
    const { GET } = await import(
      "@/app/api/agents/[agentId]/flow/route"
    );
    const req = makeRequest("/api/agents/agent1/flow", "GET");
    const res = await GET(req, { params: Promise.resolve({ agentId: AGENT_ID }) });
    expect(res.status).toBe(401);
  });

  it("PUT /api/agents/[agentId]/flow returns 401", async () => {
    const { PUT } = await import(
      "@/app/api/agents/[agentId]/flow/route"
    );
    const req = makeRequest("/api/agents/agent1/flow", "PUT", {
      content: { nodes: [], edges: [] },
    });
    const res = await PUT(req, { params: Promise.resolve({ agentId: AGENT_ID }) });
    expect(res.status).toBe(401);
  });

  it("GET /api/agents/[agentId]/knowledge/sources returns 401", async () => {
    const { GET } = await import(
      "@/app/api/agents/[agentId]/knowledge/sources/route"
    );
    const req = makeRequest("/api/agents/agent1/knowledge/sources", "GET");
    const res = await GET(req, { params: Promise.resolve({ agentId: AGENT_ID }) });
    expect(res.status).toBe(401);
  });

  it("GET /api/agents/[agentId]/export returns 401", async () => {
    const { GET } = await import(
      "@/app/api/agents/[agentId]/export/route"
    );
    const req = makeRequest("/api/agents/agent1/export", "GET");
    const res = await GET(req, { params: Promise.resolve({ agentId: AGENT_ID }) });
    expect(res.status).toBe(401);
  });

  it("GET /api/agents/[agentId]/flow/versions returns 401", async () => {
    const { GET } = await import(
      "@/app/api/agents/[agentId]/flow/versions/route"
    );
    const req = makeRequest("/api/agents/agent1/flow/versions", "GET");
    const res = await GET(req, { params: Promise.resolve({ agentId: AGENT_ID }) });
    expect(res.status).toBe(401);
  });
});

describe("Auth Security - Wrong User Access (403)", () => {
  beforeEach(() => {
    mockAuth.mockResolvedValue({ user: { id: "attacker" } });
    mockPrisma.agent.findUnique.mockResolvedValue({ userId: "victim" });
  });

  it("GET /api/agents/[agentId] returns 403 for wrong user", async () => {
    const { GET } = await import(
      "@/app/api/agents/[agentId]/route"
    );
    const req = makeRequest("/api/agents/agent1", "GET");
    const res = await GET(req, { params: Promise.resolve({ agentId: AGENT_ID }) });
    expect(res.status).toBe(403);
  });

  it("DELETE /api/agents/[agentId] returns 403 for wrong user", async () => {
    const { DELETE } = await import(
      "@/app/api/agents/[agentId]/route"
    );
    const req = makeRequest("/api/agents/agent1", "DELETE");
    const res = await DELETE(req, { params: Promise.resolve({ agentId: AGENT_ID }) });
    expect(res.status).toBe(403);
  });

  it("PUT /api/agents/[agentId]/flow returns 403 for wrong user", async () => {
    const { PUT } = await import(
      "@/app/api/agents/[agentId]/flow/route"
    );
    const req = makeRequest("/api/agents/agent1/flow", "PUT", {
      content: { nodes: [], edges: [] },
    });
    const res = await PUT(req, { params: Promise.resolve({ agentId: AGENT_ID }) });
    expect(res.status).toBe(403);
  });
});

describe("Auth Security - Unowned Agent Access (allowed)", () => {
  it("GET /api/agents/[agentId] allows access to unowned agent", async () => {
    mockAuth.mockResolvedValue({ user: { id: "user1" } });

    const agentData = {
      id: AGENT_ID,
      userId: null,
      flow: null,
      knowledgeBase: null,
      _count: { conversations: 0 },
    };
    mockPrisma.agent.findUnique
      .mockResolvedValueOnce({ userId: null })
      .mockResolvedValueOnce(agentData);

    const { GET } = await import(
      "@/app/api/agents/[agentId]/route"
    );

    const req = makeRequest("/api/agents/agent1", "GET");
    const res = await GET(req, { params: Promise.resolve({ agentId: AGENT_ID }) });
    expect(res.status).toBe(200);
  });
});
