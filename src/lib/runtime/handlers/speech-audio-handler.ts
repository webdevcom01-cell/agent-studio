import type { NodeHandler } from "../types";
import { resolveTemplate } from "../template";
import { synthesizeSpeech, type TTSProvider } from "@/lib/audio/tts-providers";
import { transcribeAudio, type STTProvider } from "@/lib/audio/stt-providers";

const DEFAULT_OUTPUT_VARIABLE = "audio_result";

/**
 * speech_audio — Dual-mode node for Text-to-Speech and Speech-to-Text.
 */
export const speechAudioHandler: NodeHandler = async (node, context) => {
  const mode = (node.data.mode as string) ?? "tts";
  const outputVariable =
    (node.data.outputVariable as string) || DEFAULT_OUTPUT_VARIABLE;

  if (mode === "stt") {
    return handleSTT(node.data, context, outputVariable);
  }

  return handleTTS(node.data, context, outputVariable);
};

async function handleTTS(
  data: Record<string, unknown>,
  context: Parameters<NodeHandler>[1],
  outputVariable: string,
): ReturnType<NodeHandler> {
  const textTemplate = (data.text as string) ?? "";
  const provider = (data.ttsProvider as TTSProvider) ?? "openai";
  const voice = (data.voice as string) ?? "alloy";
  const model = (data.model as string) ?? "tts-1";
  const outputFormat = (data.outputFormat as string) ?? "mp3";

  const text = resolveTemplate(textTemplate, context.variables);

  if (!text) {
    return {
      messages: [
        { role: "assistant", content: "Speech node has no text for TTS." },
      ],
      nextNodeId: null,
      waitForInput: false,
    };
  }

  try {
    const result = await synthesizeSpeech({
      text,
      provider,
      voice,
      model,
      outputFormat,
    });

    return {
      messages: [],
      nextNodeId: null,
      waitForInput: false,
      updatedVariables: {
        ...context.variables,
        [outputVariable]: result,
      },
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      messages: [],
      nextNodeId: null,
      waitForInput: false,
      updatedVariables: {
        ...context.variables,
        [outputVariable]: `[Error: ${errorMsg}]`,
      },
    };
  }
}

async function handleSTT(
  data: Record<string, unknown>,
  context: Parameters<NodeHandler>[1],
  outputVariable: string,
): ReturnType<NodeHandler> {
  const audioVariable = (data.audioVariable as string) ?? "";
  const provider: STTProvider =
    (data.sttProvider as string) === "deepgram" ? "deepgram" : "whisper";
  const model = (data.model as string) ?? "whisper-1";
  const language = (data.language as string) || undefined;

  const audioBase64 = audioVariable
    ? String(context.variables[audioVariable] ?? "")
    : "";

  if (!audioBase64) {
    return {
      messages: [
        { role: "assistant", content: "Speech node has no audio input for STT." },
      ],
      nextNodeId: null,
      waitForInput: false,
    };
  }

  try {
    const result = await transcribeAudio({
      audioBase64,
      provider,
      model,
      language,
    });

    return {
      messages: [],
      nextNodeId: null,
      waitForInput: false,
      updatedVariables: {
        ...context.variables,
        [outputVariable]: result,
      },
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      messages: [],
      nextNodeId: null,
      waitForInput: false,
      updatedVariables: {
        ...context.variables,
        [outputVariable]: `[Error: ${errorMsg}]`,
      },
    };
  }
}
