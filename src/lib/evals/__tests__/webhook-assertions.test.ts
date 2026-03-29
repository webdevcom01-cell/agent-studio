import { describe, it, expect } from "vitest";
import { evaluateAssertion } from "../assertions";
import type { AssertionContext, EvalAssertion } from "../schemas";

function ctx(overrides: Partial<AssertionContext> = {}): AssertionContext {
  return {
    input: "test input",
    output: "Agent processed the webhook payload successfully. repo: my-app",
    latencyMs: 100,
    ...overrides,
  };
}

describe("webhook_response_valid assertion", () => {
  const assertion: EvalAssertion = { type: "webhook_response_valid" };

  it("passes for normal output", async () => {
    const result = await evaluateAssertion(assertion, ctx());
    expect(result.passed).toBe(true);
    expect(result.score).toBe(1);
  });

  it("fails for empty output", async () => {
    const result = await evaluateAssertion(assertion, ctx({ output: "" }));
    expect(result.passed).toBe(false);
    expect(result.score).toBe(0);
  });

  it("fails for Error: prefix", async () => {
    const result = await evaluateAssertion(
      assertion,
      ctx({ output: "Error: HTTP 500 Internal Server Error" }),
    );
    expect(result.passed).toBe(false);
  });

  it("fails for [Error: prefix", async () => {
    const result = await evaluateAssertion(
      assertion,
      ctx({ output: "[Error: timeout after 30s]" }),
    );
    expect(result.passed).toBe(false);
  });

  it("works on chat mode output too (universal check)", async () => {
    const result = await evaluateAssertion(
      assertion,
      ctx({ output: "Hello! How can I help?" }),
    );
    expect(result.passed).toBe(true);
  });
});

describe("webhook_payload_echoed assertion", () => {
  const payload = { action: "push", repository: { name: "my-app", owner: "alice" } };

  it("passes when output contains field value", async () => {
    const assertion: EvalAssertion = { type: "webhook_payload_echoed", field: "action" };
    const result = await evaluateAssertion(
      assertion,
      ctx({ output: "Received push event for repo", webhookPayload: payload }),
    );
    expect(result.passed).toBe(true);
    expect(result.score).toBe(1);
  });

  it("fails when output does not contain field value", async () => {
    const assertion: EvalAssertion = { type: "webhook_payload_echoed", field: "action" };
    const result = await evaluateAssertion(
      assertion,
      ctx({ output: "Something unrelated", webhookPayload: payload }),
    );
    expect(result.passed).toBe(false);
    expect(result.score).toBe(0);
  });

  it("supports nested field paths", async () => {
    const assertion: EvalAssertion = { type: "webhook_payload_echoed", field: "repository.name" };
    const result = await evaluateAssertion(
      assertion,
      ctx({ output: "Processing my-app repository", webhookPayload: payload }),
    );
    expect(result.passed).toBe(true);
  });

  it("fails when no webhookPayload in context", async () => {
    const assertion: EvalAssertion = { type: "webhook_payload_echoed", field: "action" };
    const result = await evaluateAssertion(assertion, ctx());
    expect(result.passed).toBe(false);
    expect(result.message).toContain("Skipped");
  });

  it("fails when field does not exist in payload", async () => {
    const assertion: EvalAssertion = { type: "webhook_payload_echoed", field: "nonexistent" };
    const result = await evaluateAssertion(
      assertion,
      ctx({ webhookPayload: payload }),
    );
    expect(result.passed).toBe(false);
    expect(result.message).toContain("not found");
  });

  it("handles non-string field values via JSON.stringify", async () => {
    const assertion: EvalAssertion = { type: "webhook_payload_echoed", field: "repository" };
    const result = await evaluateAssertion(
      assertion,
      ctx({
        output: '{"name":"my-app","owner":"alice"}',
        webhookPayload: payload,
      }),
    );
    expect(result.passed).toBe(true);
  });
});
