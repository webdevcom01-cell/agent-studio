import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockAuth = vi.hoisted(() => vi.fn());
const mockPrisma = vi.hoisted(() => ({
  agent: { findUnique: vi.fn() },
  kBSource: { create: vi.fn() },
}));

vi.mock("@/lib/api/auth-guard", () => ({
  requireAgentOwner: mockAuth,
  isAuthError: (r: unknown) => r instanceof Response,
}));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: () => ({ allowed: true, remaining: 9, retryAfterMs: 0 }),
}));
vi.mock("@/lib/knowledge/parsers", () => ({
  parseSource: vi.fn().mockResolvedValue("extracted text content"),
}));
vi.mock("@/lib/knowledge/ingest", () => ({
  ingestSource: vi.fn().mockResolvedValue(undefined),
}));

import { POST } from "../route";

const AGENT_ID = "clh1234567890abcdef12345";
const PARAMS = { params: Promise.resolve({ agentId: AGENT_ID }) };

function makeFile(
  name: string,
  type: string,
  sizeBytes: number = 100
): File {
  const content = new Uint8Array(sizeBytes);
  return new File([content], name, { type });
}

function makeRequest(file: File): NextRequest {
  const form = new FormData();
  form.append("file", file);
  return new NextRequest(
    `http://localhost:3000/api/agents/${AGENT_ID}/knowledge/sources/upload`,
    { method: "POST", body: form }
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue({ userId: "u1", agentId: AGENT_ID });
  mockPrisma.agent.findUnique.mockResolvedValue({
    knowledgeBase: { id: "kb1" },
  });
  mockPrisma.kBSource.create.mockResolvedValue({
    id: "src1",
    name: "test.pdf",
    type: "FILE",
    status: "PENDING",
  });
});

describe("POST /api/agents/[agentId]/knowledge/sources/upload", () => {
  it("accepts valid PDF with correct MIME type", async () => {
    const file = makeFile("document.pdf", "application/pdf");
    const res = await POST(makeRequest(file), PARAMS);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it("accepts valid DOCX with correct MIME type", async () => {
    const file = makeFile(
      "report.docx",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );
    const res = await POST(makeRequest(file), PARAMS);
    expect(res.status).toBe(201);
  });

  it("rejects file with mismatched MIME type (.pdf extension but text/html MIME)", async () => {
    const file = makeFile("fake.pdf", "text/html");
    const res = await POST(makeRequest(file), PARAMS);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("MIME type mismatch");
    expect(body.error).toContain("application/pdf");
    expect(body.error).toContain("text/html");
  });

  it("rejects file with mismatched MIME type (.docx extension but application/pdf MIME)", async () => {
    const file = makeFile("fake.docx", "application/pdf");
    const res = await POST(makeRequest(file), PARAMS);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("MIME type mismatch");
  });

  it("rejects zero-byte file", async () => {
    const file = makeFile("empty.pdf", "application/pdf", 0);
    const res = await POST(makeRequest(file), PARAMS);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Empty file");
  });

  it("rejects file exceeding 10MB limit", async () => {
    const file = makeFile(
      "huge.pdf",
      "application/pdf",
      11 * 1024 * 1024
    );
    const res = await POST(makeRequest(file), PARAMS);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("exceeds 10 MB limit");
  });

  it("rejects unsupported file extension", async () => {
    const file = makeFile("script.js", "application/javascript");
    const res = await POST(makeRequest(file), PARAMS);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Unsupported file type");
  });
});
