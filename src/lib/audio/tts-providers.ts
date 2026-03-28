import { logger } from "@/lib/logger";

export interface TTSResult {
  audioBase64: string;
  format: string;
  durationMs: number | null;
}

export type TTSProvider = "openai" | "elevenlabs" | "deepgram";

interface TTSOptions {
  text: string;
  provider: TTSProvider;
  voice: string;
  model: string;
  outputFormat: string;
}

export async function synthesizeSpeech(options: TTSOptions): Promise<TTSResult> {
  switch (options.provider) {
    case "elevenlabs":
      return synthesizeElevenLabs(options);
    case "deepgram":
      return synthesizeDeepgram(options);
    case "openai":
    default:
      return synthesizeOpenAI(options);
  }
}

async function synthesizeOpenAI(options: TTSOptions): Promise<TTSResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is required for OpenAI TTS");

  const response = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: options.model || "tts-1",
      input: options.text,
      voice: options.voice || "alloy",
      response_format: options.outputFormat || "mp3",
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    throw new Error(`OpenAI TTS error ${response.status}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());

  return {
    audioBase64: buffer.toString("base64"),
    format: options.outputFormat || "mp3",
    durationMs: null,
  };
}

async function synthesizeElevenLabs(options: TTSOptions): Promise<TTSResult> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY is required for ElevenLabs TTS");

  const voiceId = options.voice || "21m00Tcm4TlvDq8ikWAM";

  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "xi-api-key": apiKey,
      },
      body: JSON.stringify({
        text: options.text,
        model_id: "eleven_multilingual_v2",
        output_format: options.outputFormat === "wav" ? "pcm_16000" : "mp3_44100_128",
      }),
      signal: AbortSignal.timeout(30_000),
    },
  );

  if (!response.ok) {
    throw new Error(`ElevenLabs TTS error ${response.status}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());

  return {
    audioBase64: buffer.toString("base64"),
    format: options.outputFormat || "mp3",
    durationMs: null,
  };
}

async function synthesizeDeepgram(options: TTSOptions): Promise<TTSResult> {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) throw new Error("DEEPGRAM_API_KEY is required for Deepgram TTS");

  const model = "aura-asteria-en";

  const response = await fetch(
    `https://api.deepgram.com/v1/speak?model=${model}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Token ${apiKey}`,
      },
      body: JSON.stringify({ text: options.text }),
      signal: AbortSignal.timeout(30_000),
    },
  );

  if (!response.ok) {
    throw new Error(`Deepgram TTS error ${response.status}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());

  logger.info("Deepgram TTS completed", { model, bytes: buffer.length });

  return {
    audioBase64: buffer.toString("base64"),
    format: "mp3",
    durationMs: null,
  };
}
