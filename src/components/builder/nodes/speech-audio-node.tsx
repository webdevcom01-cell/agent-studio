"use client";

import { memo } from "react";
import { type NodeProps } from "@xyflow/react";
import { Volume2, Mic } from "lucide-react";
import { BaseNode } from "./base-node";

function SpeechAudioNodeComponent({ data, selected }: NodeProps) {
  const mode = (data.mode as string) || "tts";
  const isTTS = mode === "tts";

  return (
    <BaseNode
      icon={isTTS ? <Volume2 className="size-4" /> : <Mic className="size-4" />}
      label={(data.label as string) || (isTTS ? "Text to Speech" : "Speech to Text")}
      color={isTTS ? "teal" : "lime"}
      selected={selected}
    >
      <p className="truncate">
        {isTTS ? (
          <>
            Voice: <span className="font-semibold">{(data.voice as string) || "alloy"}</span>
          </>
        ) : (
          <>
            Provider: <span className="font-semibold">{(data.sttProvider as string) || "whisper"}</span>
          </>
        )}
      </p>
    </BaseNode>
  );
}

export const SpeechAudioNode = memo(SpeechAudioNodeComponent);
