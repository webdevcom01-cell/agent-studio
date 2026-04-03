"use client";

import { Suspense, useState, useRef, useEffect, use, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { Send, Bot, RotateCcw, X, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useStreamingChat } from "@/components/chat/use-streaming-chat";

function EmbedChatContent({ agentId }: { agentId: string }) {
  const searchParams = useSearchParams();
  const customColor = searchParams.get("color");
  const customTitle = searchParams.get("title");
  const welcomeMessage = searchParams.get("welcome") || "How can I help you?";

  const [agentName, setAgentName] = useState(customTitle || "Assistant");
  const [agentError, setAgentError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const prevMessageCountRef = useRef(0);

  const { messages, input, setInput, isLoading, sendMessage, resetChat } =
    useStreamingChat({ agentId, persistKey: `as-conv-${agentId}` });

  useEffect(() => {
    fetch(`/api/agents/${agentId}`)
      .then((r) => {
        if (!r.ok) throw new Error(r.status === 404 ? "not_found" : "unavailable");
        return r.json();
      })
      .then((json: { success: boolean; data: { name: string } }) => {
        if (json.success) setAgentName(json.data.name);
      })
      .catch((err: unknown) => {
        const msg =
          err instanceof Error && err.message === "not_found"
            ? "This assistant could not be found."
            : "This assistant is temporarily unavailable.";
        setAgentError(msg);
      });
  }, [agentId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });

    const lastMsg = messages[messages.length - 1];
    if (
      messages.length > prevMessageCountRef.current &&
      lastMsg?.role === "assistant" &&
      lastMsg.content
    ) {
      window.parent?.postMessage({ type: "agent-studio-new-message", count: 1 }, "*");
    }
    prevMessageCountRef.current = messages.length;
  }, [messages]);

  useEffect(() => {
    window.parent?.postMessage({ type: "agent-studio-ready" }, "*");
  }, []);

  const handleProactive = useCallback(
    (e: MessageEvent) => {
      if (
        e.data?.type === "agent-studio-proactive" &&
        typeof e.data.message === "string" &&
        messages.length === 0
      ) {
        window.parent?.postMessage({ type: "agent-studio-new-message", count: 1 }, "*");
      }
    },
    [messages.length]
  );

  useEffect(() => {
    window.addEventListener("message", handleProactive);
    return () => window.removeEventListener("message", handleProactive);
  }, [handleProactive]);

  const headerStyle = customColor
    ? { backgroundColor: customColor } as React.CSSProperties
    : undefined;

  const sendButtonStyle = customColor
    ? { backgroundColor: customColor } as React.CSSProperties
    : undefined;

  return (
    <div className="flex h-dvh flex-col bg-background text-foreground">
      {/* Header */}
      <div
        className="flex items-center gap-2 border-b px-4 py-2.5 bg-primary text-primary-foreground"
        style={headerStyle}
      >
        <div className="flex size-7 items-center justify-center rounded-full bg-primary-foreground/20">
          <Bot className="size-4" />
        </div>
        <span className="text-sm font-semibold flex-1">{agentName}</span>
        <button
          onClick={resetChat}
          className="p-1.5 rounded-md hover:bg-primary-foreground/20 transition-colors"
          title="New conversation"
        >
          <RotateCcw className="size-3.5" />
        </button>
        <button
          onClick={() => window.parent?.postMessage({ type: "agent-studio-close" }, "*")}
          className="p-1.5 rounded-md hover:bg-primary-foreground/20 transition-colors sm:hidden"
          title="Close"
        >
          <X className="size-3.5" />
        </button>
      </div>

      {/* Agent error */}
      {agentError && (
        <div className="flex flex-col items-center justify-center flex-1 px-6 text-center">
          <AlertTriangle className="size-8 text-destructive mb-3" />
          <p className="text-sm text-muted-foreground">{agentError}</p>
          <button
            onClick={() => {
              setAgentError(null);
              window.location.reload();
            }}
            className="mt-3 flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs hover:bg-muted transition-colors"
          >
            <RotateCcw className="size-3" />
            Try again
          </button>
        </div>
      )}

      {/* Messages */}
      {!agentError && <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-center px-4">
            <Bot className="size-10 mb-3 opacity-50" />
            <p className="text-sm">{welcomeMessage}</p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={cn(
              "flex gap-2",
              msg.role === "user" ? "justify-end" : "justify-start"
            )}
          >
            {msg.role === "assistant" && (
              <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted mt-0.5">
                <Bot className="size-3" />
              </div>
            )}
            <div
              className={cn(
                "rounded-2xl px-3 py-2 text-sm max-w-[85%] leading-relaxed",
                msg.role === "user"
                  ? "bg-primary text-primary-foreground rounded-br-sm"
                  : "bg-muted rounded-bl-sm"
              )}
              style={msg.role === "user" ? sendButtonStyle : undefined}
            >
              {msg.content || (
                <span className="text-muted-foreground italic text-xs">...</span>
              )}
              {msg.role === "assistant" &&
                (msg.metadata as { plots?: string[] } | undefined)?.plots?.map((src, pi) => (
                  <img
                    key={pi}
                    src={src}
                    alt={`Python plot ${pi + 1}`}
                    className="mt-2 max-w-full rounded-lg"
                    loading="lazy"
                  />
                ))}
            </div>
          </div>
        ))}

        {isLoading && messages[messages.length - 1]?.role !== "assistant" && (
          <div className="flex gap-2">
            <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted mt-0.5">
              <Bot className="size-3" />
            </div>
            <div className="rounded-2xl bg-muted px-3 py-2 rounded-bl-sm">
              <div className="flex gap-1">
                <span className="size-1.5 rounded-full bg-muted-foreground/50 animate-bounce" />
                <span className="size-1.5 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:150ms]" />
                <span className="size-1.5 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:300ms]" />
              </div>
            </div>
          </div>
        )}
      </div>}

      {/* Input */}
      {!agentError && <div className="border-t p-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            sendMessage();
            inputRef.current?.focus();
          }}
          className="flex gap-2"
        >
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a message..."
            disabled={isLoading}
            autoFocus
            className="flex-1 rounded-full border border-border bg-background px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="flex size-9 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-50 hover:bg-primary/90 transition-colors"
            style={sendButtonStyle}
          >
            <Send className="size-4" />
          </button>
        </form>
      </div>}

      {/* Powered by */}
      <div className="text-center py-1.5 text-[10px] text-muted-foreground border-t">
        Powered by Agent Studio
      </div>
    </div>
  );
}

export default function EmbedChatPage({
  params,
}: {
  params: Promise<{ agentId: string }>;
}) {
  const { agentId } = use(params);

  return (
    <Suspense fallback={<div className="flex h-dvh items-center justify-center">Loading...</div>}>
      <EmbedChatContent agentId={agentId} />
    </Suspense>
  );
}
