import { describe, it, expect } from "vitest";
import { encodeChunk, parseChunk } from "../stream-protocol";
import type { StreamChunk } from "../types";

describe("encodeChunk", () => {
  it("serializes a message chunk to JSON + newline", () => {
    const chunk: StreamChunk = {
      type: "message",
      role: "assistant",
      content: "Hello",
    };
    const encoded = encodeChunk(chunk);
    expect(encoded).toBe('{"type":"message","role":"assistant","content":"Hello"}\n');
  });

  it("serializes a stream_start chunk", () => {
    const encoded = encodeChunk({ type: "stream_start" });
    expect(encoded).toBe('{"type":"stream_start"}\n');
  });

  it("serializes a stream_delta chunk", () => {
    const encoded = encodeChunk({ type: "stream_delta", content: "tok" });
    expect(encoded).toBe('{"type":"stream_delta","content":"tok"}\n');
  });

  it("serializes a stream_end chunk", () => {
    const encoded = encodeChunk({ type: "stream_end", content: "full text" });
    expect(encoded).toBe('{"type":"stream_end","content":"full text"}\n');
  });

  it("serializes a done chunk", () => {
    const encoded = encodeChunk({
      type: "done",
      conversationId: "conv-1",
      waitForInput: false,
    });
    expect(encoded).toBe(
      '{"type":"done","conversationId":"conv-1","waitForInput":false}\n'
    );
  });

  it("serializes an error chunk", () => {
    const encoded = encodeChunk({ type: "error", content: "something broke" });
    expect(encoded).toBe('{"type":"error","content":"something broke"}\n');
  });
});

describe("parseChunk", () => {
  it("parses a valid JSON line into a StreamChunk", () => {
    const result = parseChunk(
      '{"type":"message","role":"assistant","content":"Hi"}'
    );
    expect(result).toEqual({
      type: "message",
      role: "assistant",
      content: "Hi",
    });
  });

  it("returns null for empty string", () => {
    expect(parseChunk("")).toBeNull();
  });

  it("returns null for whitespace-only string", () => {
    expect(parseChunk("   ")).toBeNull();
  });

  it("returns null for malformed JSON", () => {
    expect(parseChunk("{broken")).toBeNull();
  });

  it("round-trips all chunk types", () => {
    const chunks: StreamChunk[] = [
      { type: "message", role: "assistant", content: "msg" },
      { type: "stream_start" },
      { type: "stream_delta", content: "d" },
      { type: "stream_end", content: "full" },
      { type: "done", conversationId: "c1", waitForInput: true },
      { type: "error", content: "err" },
    ];

    for (const chunk of chunks) {
      const encoded = encodeChunk(chunk);
      const parsed = parseChunk(encoded);
      expect(parsed).toEqual(chunk);
    }
  });
});
