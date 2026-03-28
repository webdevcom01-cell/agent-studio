import { logger } from "@/lib/logger";

export interface STTResult {
  transcript: string;
  words: { word: string; start: number; end: number; confidence: number }[];
  confidence: number;
}

export type STTProvider = "whisper" | "deepgram";

interface STTOptions {
  audioBase64: string;
  provider: STTProvider;
  model: string;
  language?: string;
}

export async function transcribeAudio(options: STTOptions): Promise<STTResult> {
  switch (options.provider) {
    case "deepgram":
      return transcribeDeepgram(options);
    case "whisper":
    default:
      return transcribeWhisper(options);
  }
}

async function transcribeWhisper(options: STTOptions): Promise<STTResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is required for Whisper STT");

  const audioBuffer = Buffer.from(options.audioBase64, "base64");
  const blob = new Blob([audioBuffer], { type: "audio/mp3" });

  const formData = new FormData();
  formData.append("file", blob, "audio.mp3");
  formData.append("model", options.model || "whisper-1");
  formData.append("response_format", "verbose_json");
  formData.append("timestamp_granularities[]", "word");
  if (options.language) formData.append("language", options.language);

  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData,
    signal: AbortSignal.timeout(60_000),
  });

  if (!response.ok) {
    throw new Error(`Whisper STT error ${response.status}`);
  }

  const data = (await response.json()) as {
    text?: string;
    words?: { word: string; start: number; end: number }[];
  };

  return {
    transcript: data.text ?? "",
    words: (data.words ?? []).map((w) => ({
      word: w.word,
      start: w.start,
      end: w.end,
      confidence: 1.0,
    })),
    confidence: 1.0,
  };
}

async function transcribeDeepgram(options: STTOptions): Promise<STTResult> {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) throw new Error("DEEPGRAM_API_KEY is required for Deepgram STT");

  const audioBuffer = Buffer.from(options.audioBase64, "base64");

  const url = new URL("https://api.deepgram.com/v1/listen");
  url.searchParams.set("model", "nova-2");
  url.searchParams.set("smart_format", "true");
  if (options.language) url.searchParams.set("language", options.language);

  const response = await fetch(url.toString(), {
    method: "POST",
    headers: {
      "Content-Type": "audio/mp3",
      Authorization: `Token ${apiKey}`,
    },
    body: audioBuffer,
    signal: AbortSignal.timeout(60_000),
  });

  if (!response.ok) {
    throw new Error(`Deepgram STT error ${response.status}`);
  }

  const data = (await response.json()) as {
    results?: {
      channels?: {
        alternatives?: {
          transcript?: string;
          confidence?: number;
          words?: { word: string; start: number; end: number; confidence: number }[];
        }[];
      }[];
    };
  };

  const alt = data.results?.channels?.[0]?.alternatives?.[0];

  logger.info("Deepgram STT completed", {
    transcript_length: alt?.transcript?.length ?? 0,
  });

  return {
    transcript: alt?.transcript ?? "",
    words: (alt?.words ?? []).map((w) => ({
      word: w.word,
      start: w.start,
      end: w.end,
      confidence: w.confidence,
    })),
    confidence: alt?.confidence ?? 0,
  };
}
