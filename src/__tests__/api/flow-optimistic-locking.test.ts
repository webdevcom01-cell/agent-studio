/**
 * Tests for the optimistic locking feature on the flow GET / PUT route.
 *
 * Requires: pnpm db:push && pnpm db:generate after the lockVersion schema change.
 * These tests use mocks so they run independently of the DB migration.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks (vi.hoisted so they're available before module imports) ─────────────

const mockRequireAgentOwner = vi.hoisted(() => vi.fn());
const mockIsAuthError = vi.hoisted(() => vi.fn(() => false));

const mockPrisma = vi.hoisted(() => ({
  flow: {
    findUnique: vi.fn(),
    upsert: vi.fn(),
  },
  $transaction: vi.fn(),
  $queryRaw: vi.fn(),
  $executeRaw: vi.fn(),
}));

const mockVersionService = vi.hoisted(() => ({
  VersionService: {
    createVersion: vi.fn().mockResolvedValue({ id: "v1", version: 1 }),
  },
}));

vi.mock("@/lib/api/auth-guard", () => ({
  requireAgentOwner: mockRequireAgentOwner,
  isAuthError: mockIsAuthError,
}));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/versioning/version-service", () => mockVersionService);
vi.mock("@/lib/a2a/card-generator", () => ({
  upsertAgentCard: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@/lib/observability/metrics", () => ({
  recordMetric: vi.fn(),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

const AGENT_ID = "agent-lock-test";
const FLOW_ID = "flow-lock-test";
const USER_ID = "user-1";

function makeRequest(
  url: string,
  method: string,
  body?: Record<string, unknown>
): NextRequest {
  const req = new NextRequest(`http://localhost${url}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return req;
}

const validContent = {
  nodes: [
    { id: "n1", type: "message", position: { x: 0, y: 0 }, data: { message: "hi" } },
  ],
  edges: [],
  variables: [],
};

// Simulate auth success — requireAgentOwner returns the userId + agentId
function setupAuth() {
  mockRequireAgentOwner.mockResolvedValue({ userId: USER_ID, agentId: AGENT_ID });
  mockIsAuthError.mockReturnValue(false);

  mockPrisma.flow.findUnique.mockResolvedValue({
    id: FLOW_ID,
    agentId: AGENT_ID,
    name: "Main Flow",
    content: validContent,
    lockVersion: 5,
    activeVersionId: null,
    versions: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

// Simulate the $transaction wrapping in the PUT route
function setupTransaction() {
  mockPrisma.$transaction.mockImplementation(
    async (fn: (tx: typeof mockPrisma) => Promise<unknown>) => fn(mockPrisma)
  );
  mockPrisma.flow.upsert.mockResolvedValue({
    id: FLOW_ID,
    agentId: AGENT_ID,
    name: "Main Flow",
    content: validContent,
    lockVersion: 5,
    activeVersionId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("GET /api/agents/[agentId]/flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupAuth();
  });

  it("returns lockVersion in the response", async () => {
    // $queryRaw returns the lockVersion for the flow
    mockPrisma.$queryRaw.mockResolvedValue([{ lockVersion: 5 }]);

    const { GET } = await import(
      "@/app/api/agents/[agentId]/flow/route"
    );
    const req = makeRequest(`/api/agents/${AGENT_ID}/flow`, "GET");
    const res = await GET(req, { params: Promise.resolve({ agentId: AGENT_ID }) });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.lockVersion).toBe(5);
  });

  it("returns lockVersion: 1 when the flow has no lockVersion column yet", async () => {
    // Simulate old DB where lockVersion column doesn't exist yet (null from raw query)
    mockPrisma.$queryRaw.mockResolvedValue([]);

    const { GET } = await import(
      "@/app/api/agents/[agentId]/flow/route"
    );
    const req = makeRequest(`/api/agents/${AGENT_ID}/flow`, "GET");
    const res = await GET(req, { params: Promise.resolve({ agentId: AGENT_ID }) });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.lockVersion).toBe(1); // fallback default
  });
});

describe("PUT /api/agents/[agentId]/flow — optimistic locking", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupAuth();
    setupTransaction();
  });

  it("accepts save without clientLockVersion (backward compat)", async () => {
    // No lockVersion check needed when client doesn't send one
    mockPrisma.$queryRaw.mockResolvedValue([{ lockVersion: 6 }]);
    mockPrisma.$executeRaw.mockResolvedValue(1);

    const { PUT } = await import(
      "@/app/api/agents/[agentId]/flow/route"
    );
    const req = makeRequest(`/api/agents/${AGENT_ID}/flow`, "PUT", {
      content: validContent,
      // No clientLockVersion — old client / embed widget
    });
    const res = await PUT(req, { params: Promise.resolve({ agentId: AGENT_ID }) });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
  });

  it("accepts save when clientLockVersion matches server lockVersion", async () => {
    // First $queryRaw call = conflict check (returns same version as client sends)
    // Second $queryRaw call = read new lockVersion after increment
    mockPrisma.$queryRaw
      .mockResolvedValueOnce([{ lockVersion: 5 }])  // conflict check: server = 5
      .mockResolvedValueOnce([{ lockVersion: 6 }]); // after increment: new = 6
    mockPrisma.$executeRaw.mockResolvedValue(1);

    const { PUT } = await import(
      "@/app/api/agents/[agentId]/flow/route"
    );
    const req = makeRequest(`/api/agents/${AGENT_ID}/flow`, "PUT", {
      content: validContent,
      clientLockVersion: 5, // matches server
    });
    const res = await PUT(req, { params: Promise.resolve({ agentId: AGENT_ID }) });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.lockVersion).toBe(6); // incremented
  });

  it("returns 409 when clientLockVersion does not match server lockVersion", async () => {
    // Server has lockVersion 7 but client sends 5 — stale client
    mockPrisma.$queryRaw.mockResolvedValueOnce([{ lockVersion: 7 }]); // conflict check

    const { PUT } = await import(
      "@/app/api/agents/[agentId]/flow/route"
    );
    const req = makeRequest(`/api/agents/${AGENT_ID}/flow`, "PUT", {
      content: validContent,
      clientLockVersion: 5, // stale
    });
    const res = await PUT(req, { params: Promise.resolve({ agentId: AGENT_ID }) });
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.success).toBe(false);
    expect(json.error).toContain("modified in another session");
    expect(json.serverLockVersion).toBe(7);
  });

  it("returns incremented lockVersion in the success response", async () => {
    mockPrisma.$queryRaw
      .mockResolvedValueOnce([{ lockVersion: 3 }])  // conflict check
      .mockResolvedValueOnce([{ lockVersion: 4 }]); // after increment
    mockPrisma.$executeRaw.mockResolvedValue(1);

    const { PUT } = await import(
      "@/app/api/agents/[agentId]/flow/route"
    );
    const req = makeRequest(`/api/agents/${AGENT_ID}/flow`, "PUT", {
      content: validContent,
      clientLockVersion: 3,
    });
    const res = await PUT(req, { params: Promise.resolve({ agentId: AGENT_ID }) });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.lockVersion).toBe(4);
  });

  it("allows first-ever save when no existing flow (no lockVersion in DB)", async () => {
    // Flow doesn't exist yet — $queryRaw returns empty (no lockVersion to check against)
    mockPrisma.$queryRaw
      .mockResolvedValueOnce([])               // conflict check: no row exists
      .mockResolvedValueOnce([{ lockVersion: 2 }]); // after increment on newly created row
    mockPrisma.$executeRaw.mockResolvedValue(1);

    const { PUT } = await import(
      "@/app/api/agents/[agentId]/flow/route"
    );
    const req = makeRequest(`/api/agents/${AGENT_ID}/flow`, "PUT", {
      content: validContent,
      clientLockVersion: 1, // client might send 1 on first save
    });
    const res = await PUT(req, { params: Promise.resolve({ agentId: AGENT_ID }) });
    const json = await res.json();

    // No row in DB → skip conflict check → create flow → return success
    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
  });
});
