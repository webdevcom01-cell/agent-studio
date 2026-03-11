import { describe, it, expect, vi, beforeEach } from "vitest";
import { emailSendHandler } from "../email-send-handler";
import type { RuntimeContext } from "../../types";
import type { FlowNode } from "@/types";

vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

function makeNode(overrides: Partial<FlowNode["data"]> = {}): FlowNode {
  return {
    id: "email-1",
    type: "email_send",
    position: { x: 0, y: 0 },
    data: {
      label: "Email Send",
      to: "test@example.com",
      subject: "Hello",
      body: "World",
      fromName: "Agent Studio",
      replyTo: "",
      webhookUrl: "",
      isHtml: false,
      outputVariable: "email_result",
      ...overrides,
    },
  };
}

function makeContext(overrides: Partial<RuntimeContext> = {}): RuntimeContext {
  return {
    agentId: "agent-1",
    conversationId: "conv-1",
    variables: {},
    messageHistory: [],
    flowContent: { nodes: [], edges: [], variables: [] },
    currentNodeId: null,
    isNewConversation: false,
    ...overrides,
  };
}

describe("emailSendHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it("performs dry run when no webhook URL configured", async () => {
    const result = await emailSendHandler(makeNode(), makeContext());

    const emailResult = result.updatedVariables?.email_result as Record<string, unknown>;
    expect(emailResult.success).toBe(true);
    expect(emailResult.dryRun).toBe(true);
    expect(emailResult.to).toEqual(["test@example.com"]);
    expect(emailResult.subject).toBe("Hello");
  });

  it("fails when no recipient specified", async () => {
    const node = makeNode({ to: "" });
    const result = await emailSendHandler(node, makeContext());

    expect(result.messages[0].content).toContain("no recipient");
  });

  it("fails when both subject and body are empty", async () => {
    const node = makeNode({ subject: "", body: "" });
    const result = await emailSendHandler(node, makeContext());

    expect(result.messages[0].content).toContain("both subject and body are empty");
  });

  it("validates email format", async () => {
    const node = makeNode({ to: "not-an-email" });
    const result = await emailSendHandler(node, makeContext());

    expect(result.messages[0].content).toContain("invalid email");
  });

  it("accepts multiple comma-separated emails", async () => {
    const node = makeNode({ to: "a@b.com, c@d.com" });
    const result = await emailSendHandler(node, makeContext());

    const emailResult = result.updatedVariables?.email_result as Record<string, unknown>;
    expect(emailResult.success).toBe(true);
    expect(emailResult.to).toEqual(["a@b.com", "c@d.com"]);
  });

  it("rejects if any email in comma list is invalid", async () => {
    const node = makeNode({ to: "valid@test.com, bad-email" });
    const result = await emailSendHandler(node, makeContext());

    expect(result.messages[0].content).toContain("invalid email");
    expect(result.messages[0].content).toContain("bad-email");
  });

  it("resolves template variables in to, subject, body", async () => {
    const node = makeNode({
      to: "{{user_email}}",
      subject: "Hi {{name}}",
      body: "Score: {{score}}",
    });
    const ctx = makeContext({
      variables: { user_email: "alice@test.com", name: "Alice", score: "95" },
    });
    const result = await emailSendHandler(node, ctx);

    const emailResult = result.updatedVariables?.email_result as Record<string, unknown>;
    expect(emailResult.success).toBe(true);
    expect(emailResult.to).toEqual(["alice@test.com"]);
    expect(emailResult.subject).toBe("Hi Alice");
  });

  it("sends via webhook when URL is configured", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve("OK"),
    });
    vi.stubGlobal("fetch", mockFetch);

    const node = makeNode({ webhookUrl: "https://api.email.com/send" });
    const result = await emailSendHandler(node, makeContext());

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.email.com/send",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
      })
    );

    const emailResult = result.updatedVariables?.email_result as Record<string, unknown>;
    expect(emailResult.success).toBe(true);
    expect(emailResult.dryRun).toBeUndefined();
  });

  it("handles webhook error response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve("Internal Server Error"),
    }));

    const node = makeNode({ webhookUrl: "https://api.email.com/send" });
    const result = await emailSendHandler(node, makeContext());

    const emailResult = result.updatedVariables?.email_result as Record<string, unknown>;
    expect(emailResult.success).toBe(false);
    expect(emailResult.status).toBe(500);
  });

  it("handles fetch network errors gracefully", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network error")));

    const node = makeNode({ webhookUrl: "https://api.email.com/send" });
    const result = await emailSendHandler(node, makeContext());

    expect(result.messages[0].content).toContain("trouble sending");
    const emailResult = result.updatedVariables?.email_result as Record<string, unknown>;
    expect(emailResult.success).toBe(false);
  });

  it("uses custom output variable", async () => {
    const node = makeNode({ outputVariable: "my_email" });
    const result = await emailSendHandler(node, makeContext());

    expect(result.updatedVariables?.my_email).toBeDefined();
  });
});
