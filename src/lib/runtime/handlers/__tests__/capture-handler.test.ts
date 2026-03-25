import { describe, it, expect } from "vitest";
import { captureHandler } from "../capture-handler";
import type { FlowNode } from "@/types";
import type { RuntimeContext } from "../../types";

function makeNode(data: Record<string, unknown> = {}): FlowNode {
  return { id: "n1", type: "capture", position: { x: 0, y: 0 }, data: { label: "Capture", variableName: "input", validationType: "text", ...data } };
}

function makeContext(overrides: Partial<RuntimeContext> = {}): RuntimeContext {
  return {
    conversationId: "conv-1",
    agentId: "agent-1",
    flowContent: { nodes: [], edges: [], variables: [] },
    currentNodeId: "n1",
    variables: {},
    messageHistory: [],
    isNewConversation: false,
    isResuming: false,
    ...overrides,
  };
}

describe("captureHandler", () => {
  describe("prompt display (not resuming)", () => {
    it("shows prompt message and waits for input", async () => {
      const result = await captureHandler(
        makeNode({ prompt: "Enter your name:" }),
        makeContext(),
      );
      expect(result.messages[0].content).toBe("Enter your name:");
      expect(result.waitForInput).toBe(true);
    });

    it("returns empty messages when prompt is empty", async () => {
      const result = await captureHandler(makeNode({ prompt: "" }), makeContext());
      expect(result.messages).toHaveLength(0);
      expect(result.waitForInput).toBe(true);
    });

    it("resolves template variables in prompt", async () => {
      const result = await captureHandler(
        makeNode({ prompt: "Hello {{name}}, enter your age:" }),
        makeContext({ variables: { name: "Alice" } }),
      );
      expect(result.messages[0].content).toBe("Hello Alice, enter your age:");
    });
  });

  describe("text capture (resuming)", () => {
    it("captures plain text input", async () => {
      const result = await captureHandler(
        makeNode(),
        makeContext({
          isResuming: true,
          messageHistory: [{ role: "user", content: "John Doe" }],
        }),
      );
      expect(result.updatedVariables?.input).toBe("John Doe");
      expect(result.waitForInput).toBe(false);
    });

    it("resets retry count on successful capture", async () => {
      const result = await captureHandler(
        makeNode(),
        makeContext({
          isResuming: true,
          variables: { "__retry_count_n1": 2 },
          messageHistory: [{ role: "user", content: "valid" }],
        }),
      );
      expect(result.updatedVariables?.["__retry_count_n1"]).toBe(0);
    });
  });

  describe("number validation", () => {
    it("accepts valid number", async () => {
      const result = await captureHandler(
        makeNode({ variableName: "age", validationType: "number" }),
        makeContext({
          isResuming: true,
          messageHistory: [{ role: "user", content: "25" }],
        }),
      );
      expect(result.updatedVariables?.age).toBe(25);
    });

    it("rejects non-numeric input", async () => {
      const result = await captureHandler(
        makeNode({ variableName: "age", validationType: "number" }),
        makeContext({
          isResuming: true,
          messageHistory: [{ role: "user", content: "abc" }],
        }),
      );
      expect(result.messages[0].content).toContain("valid number");
      expect(result.waitForInput).toBe(true);
    });
  });

  describe("email validation", () => {
    it("accepts valid email", async () => {
      const result = await captureHandler(
        makeNode({ variableName: "email", validationType: "email" }),
        makeContext({
          isResuming: true,
          messageHistory: [{ role: "user", content: "user@example.com" }],
        }),
      );
      expect(result.updatedVariables?.email).toBe("user@example.com");
    });

    it("rejects email without domain", async () => {
      const result = await captureHandler(
        makeNode({ variableName: "email", validationType: "email" }),
        makeContext({
          isResuming: true,
          messageHistory: [{ role: "user", content: "user@" }],
        }),
      );
      expect(result.messages[0].content).toContain("valid email");
    });

    it("rejects email without TLD", async () => {
      const result = await captureHandler(
        makeNode({ variableName: "email", validationType: "email" }),
        makeContext({
          isResuming: true,
          messageHistory: [{ role: "user", content: "user@domain" }],
        }),
      );
      expect(result.messages[0].content).toContain("valid email");
    });

    it("rejects email with spaces", async () => {
      const result = await captureHandler(
        makeNode({ variableName: "email", validationType: "email" }),
        makeContext({
          isResuming: true,
          messageHistory: [{ role: "user", content: "user @example.com" }],
        }),
      );
      expect(result.messages[0].content).toContain("valid email");
    });
  });

  describe("retry limit", () => {
    it("falls back to fallbackNodeId after max retries", async () => {
      const result = await captureHandler(
        makeNode({ variableName: "email", validationType: "email", fallbackNodeId: "fallback-1" }),
        makeContext({
          isResuming: true,
          variables: { "__retry_count_n1": 3 },
          messageHistory: [{ role: "user", content: "invalid" }],
        }),
      );
      expect(result.nextNodeId).toBe("fallback-1");
      expect(result.messages[0].content).toContain("try something else");
      expect(result.updatedVariables?.["__retry_count_n1"]).toBe(0);
    });

    it("gives up without fallback after max retries", async () => {
      const result = await captureHandler(
        makeNode({ variableName: "email", validationType: "email" }),
        makeContext({
          isResuming: true,
          variables: { "__retry_count_n1": 3 },
          messageHistory: [{ role: "user", content: "invalid" }],
        }),
      );
      expect(result.nextNodeId).toBeNull();
      expect(result.messages[0].content).toContain("Moving on");
    });
  });

  describe("edge cases", () => {
    it("handles empty variableName gracefully", async () => {
      const result = await captureHandler(
        makeNode({ variableName: "" }),
        makeContext({ isResuming: true, messageHistory: [{ role: "user", content: "test" }] }),
      );
      expect(result.waitForInput).toBe(true);
    });

    it("picks last user message from history", async () => {
      const result = await captureHandler(
        makeNode(),
        makeContext({
          isResuming: true,
          messageHistory: [
            { role: "user", content: "first" },
            { role: "assistant", content: "response" },
            { role: "user", content: "second" },
          ],
        }),
      );
      expect(result.updatedVariables?.input).toBe("second");
    });
  });
});
