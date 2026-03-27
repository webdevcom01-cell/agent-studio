import { describe, it, expect } from "vitest";
import { shouldRetrieve } from "../agentic-retrieval";

describe("shouldRetrieve", () => {
  // ── No KB ──────────────────────────────────────────────────────────────────

  it("returns no_kb when hasKnowledgeBase is false", () => {
    const result = shouldRetrieve("Tell me about the refund policy", false);
    expect(result.retrieve).toBe(false);
    expect(result.reason).toBe("no_kb");
  });

  // ── Empty / whitespace queries ─────────────────────────────────────────────

  it("returns empty_query for empty string", () => {
    const result = shouldRetrieve("", true);
    expect(result.retrieve).toBe(false);
    expect(result.reason).toBe("empty_query");
  });

  it("returns empty_query for whitespace-only string", () => {
    const result = shouldRetrieve("   \t\n  ", true);
    expect(result.retrieve).toBe(false);
    expect(result.reason).toBe("empty_query");
  });

  // ── Greeting patterns ──────────────────────────────────────────────────────

  it("skips retrieval for 'hello'", () => {
    const result = shouldRetrieve("hello", true);
    expect(result.retrieve).toBe(false);
    expect(result.reason).toBe("greeting_or_simple");
  });

  it("skips retrieval for 'hi there'", () => {
    const result = shouldRetrieve("hi there", true);
    expect(result.retrieve).toBe(false);
    expect(result.reason).toBe("greeting_or_simple");
  });

  it("skips retrieval for 'zdravo'", () => {
    const result = shouldRetrieve("zdravo", true);
    expect(result.retrieve).toBe(false);
    expect(result.reason).toBe("greeting_or_simple");
  });

  it("skips retrieval for 'hvala'", () => {
    const result = shouldRetrieve("hvala", true);
    expect(result.retrieve).toBe(false);
    expect(result.reason).toBe("greeting_or_simple");
  });

  it("skips retrieval for 'thank you'", () => {
    const result = shouldRetrieve("thank you", true);
    expect(result.retrieve).toBe(false);
    expect(result.reason).toBe("greeting_or_simple");
  });

  it("skips retrieval for 'ok'", () => {
    const result = shouldRetrieve("ok", true);
    expect(result.retrieve).toBe(false);
    expect(result.reason).toBe("greeting_or_simple");
  });

  it("skips retrieval for 'yes' (case insensitive)", () => {
    const result = shouldRetrieve("YES", true);
    expect(result.retrieve).toBe(false);
    expect(result.reason).toBe("greeting_or_simple");
  });

  it("skips retrieval for 'bye'", () => {
    const result = shouldRetrieve("bye", true);
    expect(result.retrieve).toBe(false);
    expect(result.reason).toBe("greeting_or_simple");
  });

  it("skips retrieval for 'great'", () => {
    const result = shouldRetrieve("great", true);
    expect(result.retrieve).toBe(false);
    expect(result.reason).toBe("greeting_or_simple");
  });

  // ── Too short ──────────────────────────────────────────────────────────────

  it("returns too_short for 1-word non-greeting", () => {
    const result = shouldRetrieve("refund", true);
    expect(result.retrieve).toBe(false);
    expect(result.reason).toBe("too_short");
  });

  it("returns too_short for 2-word query", () => {
    const result = shouldRetrieve("refund policy", true);
    expect(result.retrieve).toBe(false);
    expect(result.reason).toBe("too_short");
  });

  // ── Standard queries (should retrieve) ────────────────────────────────────

  it("retrieves for a normal 3-word question", () => {
    const result = shouldRetrieve("what is pricing", true);
    expect(result.retrieve).toBe(true);
    expect(result.reason).toBe("standard_query");
  });

  it("retrieves for a longer question", () => {
    const result = shouldRetrieve("How do I cancel my subscription and get a refund?", true);
    expect(result.retrieve).toBe(true);
    expect(result.reason).toBe("standard_query");
  });

  it("retrieves even for sentences containing greeting words in the middle", () => {
    // 'hello' only triggers if it's at the START of the query
    const result = shouldRetrieve("I said hello to the support team about billing", true);
    expect(result.retrieve).toBe(true);
    expect(result.reason).toBe("standard_query");
  });

  it("trims whitespace before evaluating word count", () => {
    // "  what is X  " → 3 words → should retrieve
    const result = shouldRetrieve("  what is X  ", true);
    expect(result.retrieve).toBe(true);
    expect(result.reason).toBe("standard_query");
  });
});
