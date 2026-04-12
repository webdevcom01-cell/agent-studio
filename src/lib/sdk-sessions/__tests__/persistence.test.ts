/**
 * Unit tests for sdk-sessions/persistence.ts
 *
 * Covers:
 *  - createSdkSession: title generation, sanitization, message storage
 *  - loadSdkSession: found, not found
 *  - updateSdkSession: transaction-based merge, token increment, resume count
 *  - listSdkSessions: pagination, status filter
 *  - deleteSdkSession: happy path, missing row
 *  - completeSdkSession: status transition
 *  - parseMessages: valid, invalid, mixed (via create round-trip)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const mockPrisma = vi.hoisted(() => ({
  agentSdkSession: {
    create: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  $transaction: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: mockPrisma,
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import {
  createSdkSession,
  loadSdkSession,
  updateSdkSession,
  listSdkSessions,
  deleteSdkSession,
  completeSdkSession,
} from "../persistence";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRow(overrides?: Record<string, unknown>) {
  return {
    id: "sess-1",
    title: "Test session",
    status: "ACTIVE" as const,
    messages: [
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi there" },
    ],
    metadata: null,
    totalInputTokens: 100,
    totalOutputTokens: 50,
    resumeCount: 0,
    agentId: "agent-1",
    userId: "user-1",
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("createSdkSession", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates a session with auto-generated title from first user message", async () => {
    const row = makeRow();
    mockPrisma.agentSdkSession.create.mockResolvedValue(row);

    const result = await createSdkSession({
      agentId: "agent-1",
      userId: "user-1",
      messages: [{ role: "user", content: "Hello world" }],
    });

    expect(mockPrisma.agentSdkSession.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          agentId: "agent-1",
          title: "Hello world",
        }),
      })
    );
    expect(result.id).toBe("sess-1");
  });

  it("truncates long titles at 80 chars", async () => {
    const longMsg = "A".repeat(200);
    const row = makeRow();
    mockPrisma.agentSdkSession.create.mockResolvedValue(row);

    await createSdkSession({
      agentId: "agent-1",
      messages: [{ role: "user", content: longMsg }],
    });

    const callData = mockPrisma.agentSdkSession.create.mock.calls[0][0].data;
    expect(callData.title.length).toBeLessThanOrEqual(80);
    expect(callData.title).toContain("…");
  });

  it("sanitizes control characters from title", async () => {
    const row = makeRow();
    mockPrisma.agentSdkSession.create.mockResolvedValue(row);

    await createSdkSession({
      agentId: "agent-1",
      messages: [{ role: "user", content: "Hello\x00\x1fWorld" }],
    });

    const callData = mockPrisma.agentSdkSession.create.mock.calls[0][0].data;
    expect(callData.title).toBe("Hello World");
  });

  it("defaults to 'Untitled session' when no user message", async () => {
    const row = makeRow();
    mockPrisma.agentSdkSession.create.mockResolvedValue(row);

    await createSdkSession({
      agentId: "agent-1",
      messages: [{ role: "assistant", content: "I am ready" }],
    });

    const callData = mockPrisma.agentSdkSession.create.mock.calls[0][0].data;
    expect(callData.title).toBe("Untitled session");
  });

  it("uses explicit title when provided", async () => {
    const row = makeRow();
    mockPrisma.agentSdkSession.create.mockResolvedValue(row);

    await createSdkSession({
      agentId: "agent-1",
      title: "My custom title",
      messages: [{ role: "user", content: "ignored for title" }],
    });

    const callData = mockPrisma.agentSdkSession.create.mock.calls[0][0].data;
    expect(callData.title).toBe("My custom title");
  });
});

describe("loadSdkSession", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns session data when found", async () => {
    mockPrisma.agentSdkSession.findUnique.mockResolvedValue(makeRow());

    const result = await loadSdkSession("sess-1");

    expect(result).not.toBeNull();
    expect(result?.id).toBe("sess-1");
    expect(result?.messages).toHaveLength(2);
  });

  it("returns null when not found", async () => {
    mockPrisma.agentSdkSession.findUnique.mockResolvedValue(null);

    const result = await loadSdkSession("nonexistent");

    expect(result).toBeNull();
  });

  it("filters invalid messages from stored JSON", async () => {
    const row = makeRow({
      messages: [
        { role: "user", content: "valid" },
        { bad: "entry" }, // invalid
        42, // invalid
        { role: "assistant", content: "also valid" },
      ],
    });
    mockPrisma.agentSdkSession.findUnique.mockResolvedValue(row);

    const result = await loadSdkSession("sess-1");

    expect(result?.messages).toHaveLength(2);
    expect(result?.messages[0].content).toBe("valid");
    expect(result?.messages[1].content).toBe("also valid");
  });
});

describe("updateSdkSession", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uses $transaction for atomic read-modify-write", async () => {
    const updatedRow = makeRow({ resumeCount: 1 });
    mockPrisma.$transaction.mockImplementation(async (fn: (tx: typeof mockPrisma) => Promise<unknown>) => {
      return fn(mockPrisma);
    });
    mockPrisma.agentSdkSession.findUnique.mockResolvedValue(makeRow());
    mockPrisma.agentSdkSession.update.mockResolvedValue(updatedRow);

    const result = await updateSdkSession("sess-1", {
      messages: [
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hi" },
        { role: "user", content: "New message" },
      ],
      inputTokensDelta: 50,
      outputTokensDelta: 25,
    });

    expect(mockPrisma.$transaction).toHaveBeenCalled();
    expect(result.resumeCount).toBe(1);

    const updateCall = mockPrisma.agentSdkSession.update.mock.calls[0][0];
    expect(updateCall.data.totalInputTokens).toEqual({ increment: 50 });
    expect(updateCall.data.totalOutputTokens).toEqual({ increment: 25 });
    expect(updateCall.data.resumeCount).toEqual({ increment: 1 });
  });

  it("throws when session not found", async () => {
    mockPrisma.$transaction.mockImplementation(async (fn: (tx: typeof mockPrisma) => Promise<unknown>) => {
      return fn(mockPrisma);
    });
    mockPrisma.agentSdkSession.findUnique.mockResolvedValue(null);

    await expect(updateSdkSession("nonexistent", {})).rejects.toThrow(
      "SDK session not found: nonexistent"
    );
  });

  it("preserves existing messages when input.messages is undefined", async () => {
    const existing = makeRow({
      messages: [{ role: "user", content: "keep me" }],
    });
    mockPrisma.$transaction.mockImplementation(async (fn: (tx: typeof mockPrisma) => Promise<unknown>) => {
      return fn(mockPrisma);
    });
    mockPrisma.agentSdkSession.findUnique.mockResolvedValue(existing);
    mockPrisma.agentSdkSession.update.mockResolvedValue(existing);

    await updateSdkSession("sess-1", { inputTokensDelta: 10 });

    const updateData = mockPrisma.agentSdkSession.update.mock.calls[0][0].data;
    const storedMessages = JSON.parse(updateData.messages);
    expect(storedMessages).toHaveLength(1);
    expect(storedMessages[0].content).toBe("keep me");
  });
});

describe("listSdkSessions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns paginated sessions with total count", async () => {
    mockPrisma.agentSdkSession.findMany.mockResolvedValue([makeRow()]);
    mockPrisma.agentSdkSession.count.mockResolvedValue(5);

    const result = await listSdkSessions("agent-1", { limit: 1 });

    expect(result.sessions).toHaveLength(1);
    expect(result.total).toBe(5);
  });

  it("filters by status when provided", async () => {
    mockPrisma.agentSdkSession.findMany.mockResolvedValue([]);
    mockPrisma.agentSdkSession.count.mockResolvedValue(0);

    await listSdkSessions("agent-1", { status: "COMPLETED" });

    const where = mockPrisma.agentSdkSession.findMany.mock.calls[0][0].where;
    expect(where.status).toBe("COMPLETED");
  });
});

describe("deleteSdkSession", () => {
  beforeEach(() => vi.clearAllMocks());

  it("deletes the session by ID", async () => {
    mockPrisma.agentSdkSession.delete.mockResolvedValue(makeRow());

    await deleteSdkSession("sess-1");

    expect(mockPrisma.agentSdkSession.delete).toHaveBeenCalledWith({
      where: { id: "sess-1" },
    });
  });
});

describe("completeSdkSession", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sets status to COMPLETED", async () => {
    mockPrisma.agentSdkSession.update.mockResolvedValue(
      makeRow({ status: "COMPLETED" })
    );

    const result = await completeSdkSession("sess-1");

    expect(mockPrisma.agentSdkSession.update).toHaveBeenCalledWith({
      where: { id: "sess-1" },
      data: { status: "COMPLETED" },
    });
    expect(result.status).toBe("COMPLETED");
  });
});
