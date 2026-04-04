import { describe, it, expect } from "vitest";
import {
  PlainTextRenderer,
  DiscordRenderer,
  SlackRenderer,
  MarkdownRenderer,
  getRenderer,
} from "../renderers";
import type { NotificationInput } from "../types";

const baseInput: NotificationInput = {
  title: "Build Complete",
  message: "All 42 tests passed.",
  level: "success",
  agentId: "agent-abc123",
  timestamp: "2026-04-04T12:00:00Z",
};

// ── PlainTextRenderer ───────────────────────────────────────────────────

describe("PlainTextRenderer", () => {
  const renderer = new PlainTextRenderer();

  it("renders title + message", () => {
    const result = renderer.render(baseInput);
    expect(result.text).toContain("Build Complete");
    expect(result.text).toContain("All 42 tests passed");
    expect(result.text).toContain("✅");
    expect(result.level).toBe("success");
  });

  it("renders without title", () => {
    const result = renderer.render({ ...baseInput, title: "" });
    expect(result.text).toContain("All 42 tests passed");
    expect(result.text).not.toContain(":");
  });

  it("includes metadata in body", () => {
    const result = renderer.render(baseInput);
    expect(result.body.agentId).toBe("agent-abc123");
    expect(result.body.level).toBe("success");
    expect(result.body.timestamp).toBe("2026-04-04T12:00:00Z");
  });
});

// ── DiscordRenderer ─────────────────────────────────────────────────────

describe("DiscordRenderer", () => {
  const renderer = new DiscordRenderer();

  it("produces embeds array", () => {
    const result = renderer.render(baseInput);
    expect(result.body.embeds).toBeDefined();
    const embeds = result.body.embeds as Array<Record<string, unknown>>;
    expect(embeds).toHaveLength(1);
  });

  it("uses green color for success", () => {
    const result = renderer.render(baseInput);
    const embed = (result.body.embeds as Array<Record<string, unknown>>)[0];
    expect(embed.color).toBe(0x2ecc71);
  });

  it("uses red color for error", () => {
    const result = renderer.render({ ...baseInput, level: "error" });
    const embed = (result.body.embeds as Array<Record<string, unknown>>)[0];
    expect(embed.color).toBe(0xe74c3c);
  });

  it("includes agent field", () => {
    const result = renderer.render(baseInput);
    const embed = (result.body.embeds as Array<Record<string, unknown>>)[0];
    const fields = embed.fields as Array<Record<string, unknown>>;
    expect(fields.some((f) => f.name === "Agent")).toBe(true);
  });
});

// ── SlackRenderer ───────────────────────────────────────────────────────

describe("SlackRenderer", () => {
  const renderer = new SlackRenderer();

  it("produces blocks array", () => {
    const result = renderer.render(baseInput);
    expect(result.body.blocks).toBeDefined();
    const blocks = result.body.blocks as Array<Record<string, unknown>>;
    expect(blocks.length).toBeGreaterThanOrEqual(2);
  });

  it("has header block", () => {
    const result = renderer.render(baseInput);
    const blocks = result.body.blocks as Array<Record<string, unknown>>;
    expect(blocks[0].type).toBe("header");
  });

  it("has context block with agent info", () => {
    const result = renderer.render(baseInput);
    const blocks = result.body.blocks as Array<Record<string, unknown>>;
    const contextBlock = blocks.find((b) => b.type === "context");
    expect(contextBlock).toBeDefined();
  });

  it("includes text fallback", () => {
    const result = renderer.render(baseInput);
    expect(result.body.text).toBeDefined();
    expect(typeof result.body.text).toBe("string");
  });
});

// ── MarkdownRenderer ────────────────────────────────────────────────────

describe("MarkdownRenderer", () => {
  const renderer = new MarkdownRenderer();

  it("renders bold title", () => {
    const result = renderer.render(baseInput);
    expect(result.text).toContain("**");
    expect(result.text).toContain("Build Complete");
  });

  it("includes message after title", () => {
    const result = renderer.render(baseInput);
    expect(result.text).toContain("All 42 tests passed");
  });

  it("handles empty title", () => {
    const result = renderer.render({ ...baseInput, title: "" });
    expect(result.text).toContain("Notification");
  });
});

// ── getRenderer ─────────────────────────────────────────────────────────

describe("getRenderer", () => {
  it("returns correct renderer by name", () => {
    expect(getRenderer("plain").name).toBe("plain");
    expect(getRenderer("discord").name).toBe("discord");
    expect(getRenderer("slack").name).toBe("slack");
    expect(getRenderer("markdown").name).toBe("markdown");
  });

  it("falls back to plain for unknown name", () => {
    expect(getRenderer("telegram").name).toBe("plain");
    expect(getRenderer("").name).toBe("plain");
  });
});
