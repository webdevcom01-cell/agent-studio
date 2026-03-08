import { useState, useCallback, useRef } from "react";
import { parseChunk } from "@/lib/runtime/stream-protocol";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface UseStreamingChatOptions {
  agentId: string;
  persistKey?: string;
}

interface UseStreamingChatReturn {
  messages: ChatMessage[];
  input: string;
  setInput: (value: string) => void;
  isLoading: boolean;
  conversationId: string | undefined;
  sendMessage: () => Promise<void>;
  resetChat: () => void;
}

export function useStreamingChat({
  agentId,
  persistKey,
}: UseStreamingChatOptions): UseStreamingChatReturn {
  const savedId = persistKey && typeof window !== "undefined"
    ? sessionStorage.getItem(persistKey) ?? undefined
    : undefined;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const conversationIdRef = useRef<string | undefined>(savedId);
  const [conversationId, setConversationId] = useState<string | undefined>(savedId);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || isLoading) return;

    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setIsLoading(true);

    try {
      const res = await fetch(`/api/agents/${agentId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          conversationId: conversationIdRef.current,
          stream: true,
        }),
      });

      if (!res.ok || !res.body) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: "Sorry, something went wrong." },
        ]);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const chunk = parseChunk(line);
          if (!chunk) continue;

          switch (chunk.type) {
            case "message":
              setMessages((prev) => [
                ...prev,
                { role: "assistant", content: chunk.content },
              ]);
              break;

            case "stream_start":
              setMessages((prev) => [
                ...prev,
                { role: "assistant", content: "" },
              ]);
              break;

            case "stream_delta":
              setMessages((prev) => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last?.role === "assistant") {
                  updated[updated.length - 1] = {
                    ...last,
                    content: last.content + chunk.content,
                  };
                }
                return updated;
              });
              break;

            case "stream_end":
              setMessages((prev) => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last?.role === "assistant" && chunk.content.length > last.content.length) {
                  updated[updated.length - 1] = {
                    ...last,
                    content: chunk.content,
                  };
                }
                return updated;
              });
              break;

            case "done":
              if (chunk.conversationId) {
                conversationIdRef.current = chunk.conversationId;
                setConversationId(chunk.conversationId);
                if (persistKey) {
                  sessionStorage.setItem(persistKey, chunk.conversationId);
                }
              }
              break;

            case "error":
              setMessages((prev) => [
                ...prev,
                { role: "assistant", content: chunk.content },
              ]);
              break;
          }
        }
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Failed to connect to the server." },
      ]);
    } finally {
      setIsLoading(false);
    }
  }, [agentId, input, isLoading, persistKey]);

  const resetChat = useCallback(() => {
    setMessages([]);
    conversationIdRef.current = undefined;
    setConversationId(undefined);
    if (persistKey) {
      sessionStorage.removeItem(persistKey);
    }
  }, [persistKey]);

  return {
    messages,
    input,
    setInput,
    isLoading,
    conversationId,
    sendMessage,
    resetChat,
  };
}
