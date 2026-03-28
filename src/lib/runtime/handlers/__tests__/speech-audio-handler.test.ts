import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSynthesizeSpeech = vi.fn();
const mockTranscribeAudio = vi.fn();

vi.mock("@/lib/audio/tts-providers", () => ({
  synthesizeSpeech: (...args: unknown[]) => mockSynthesizeSpeech(...args),
}));

vi.mock("@/lib/audio/stt-providers", () => ({
  transcribeAudio: (...args: unknown[]) => mockTranscribeAudio(...args),
}));

import { speechAudioHandler } from "../speech-audio-handler";
import type { RuntimeContext } from "../../types";
import type { FlowNode, FlowContent } from "@/types";

function makeNode(overrides: Record<string, unknown> = {}): FlowNode {
  return {
    id: "speech-1",
    type: "speech_audio",
    position: { x: 0, y: 0 },
    data: {
      mode: "tts",
      text: "Hello world",
      ttsProvider: "openai",
      voice: "alloy",
      model: "tts-1",
      outputFormat: "mp3",
      outputVariable: "audio_result",
      ...overrides,
    },
  };
}

function makeContext(overrides: Partial<RuntimeContext> = {}): RuntimeContext {
  return {
    conversationId: "conv-1",
    agentId: "agent-1",
    flowContent: { nodes: [], edges: [], variables: [] } as FlowContent,
    currentNodeId: "speech-1",
    variables: {},
    messageHistory: [],
    isNewConversation: true,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("speechAudioHandler — TTS", () => {
  it("returns error when text is empty", async () => {
    const result = await speechAudioHandler(
      makeNode({ text: "" }),
      makeContext(),
    );
    expect(result.messages[0].content).toContain("no text");
  });

  it("synthesizes speech and returns audio result", async () => {
    mockSynthesizeSpeech.mockResolvedValueOnce({
      audioBase64: "SGVsbG8=",
      format: "mp3",
      durationMs: null,
    });

    const result = await speechAudioHandler(makeNode(), makeContext());
    const output = result.updatedVariables?.audio_result as Record<string, unknown>;
    expect(output.audioBase64).toBe("SGVsbG8=");
    expect(output.format).toBe("mp3");
  });

  it("resolves template variables in text", async () => {
    mockSynthesizeSpeech.mockResolvedValueOnce({
      audioBase64: "abc",
      format: "mp3",
      durationMs: null,
    });

    await speechAudioHandler(
      makeNode({ text: "{{greeting}}" }),
      makeContext({ variables: { greeting: "Good morning" } }),
    );

    expect(mockSynthesizeSpeech).toHaveBeenCalledWith(
      expect.objectContaining({ text: "Good morning" }),
    );
  });

  it("handles TTS error gracefully", async () => {
    mockSynthesizeSpeech.mockRejectedValueOnce(new Error("API unavailable"));

    const result = await speechAudioHandler(makeNode(), makeContext());
    expect(result.updatedVariables?.audio_result).toContain("[Error:");
  });
});

describe("speechAudioHandler — STT", () => {
  it("returns error when no audio provided", async () => {
    const result = await speechAudioHandler(
      makeNode({ mode: "stt", audioVariable: "audio_input" }),
      makeContext({ variables: {} }),
    );
    expect(result.messages[0].content).toContain("no audio");
  });

  it("transcribes audio and returns transcript", async () => {
    mockTranscribeAudio.mockResolvedValueOnce({
      transcript: "Hello world",
      words: [{ word: "Hello", start: 0, end: 0.5, confidence: 0.99 }],
      confidence: 0.99,
    });

    const result = await speechAudioHandler(
      makeNode({ mode: "stt", audioVariable: "audio_input" }),
      makeContext({ variables: { audio_input: "SGVsbG8=" } }),
    );

    const output = result.updatedVariables?.audio_result as Record<string, unknown>;
    expect(output.transcript).toBe("Hello world");
    expect(output.confidence).toBe(0.99);
  });
});
