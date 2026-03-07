"use client";

import { useState, useRef, useEffect, use } from "react";
import { Send, Bot, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { useStreamingChat } from "@/components/chat/use-streaming-chat";

export default function EmbedChatPage({
  params,
}: {
  params: Promise<{ agentId: string }>;
}) {
  const { agentId } = use(params);
  const [agentName, setAgentName] = useState("Assistant");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { messages, input, setInput, isLoading, sendMessage, resetChat } =
    useStreamingChat({ agentId });

  useEffect(() => {
    fetch(`/api/agents/${agentId}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.success) setAgentName(json.data.name);
      })
      .catch(() => {});
  }, [agentId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  // Notify parent window about widget state
  useEffect(() => {
    window.parent?.postMessage({ type: "agent-studio-ready" }, "*");
  }, []);

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      {/* Header */}
      <div className="flex items-center gap-2 border-b px-4 py-2.5 bg-primary text-primary-foreground">
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
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-center px-4">
            <Bot className="size-10 mb-3 opacity-50" />
            <p className="text-sm">How can I help you?</p>
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
            >
              {msg.content || (
                <span className="text-muted-foreground italic text-xs">...</span>
              )}
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
      </div>

      {/* Input */}
      <div className="border-t p-3">
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
          >
            <Send className="size-4" />
          </button>
        </form>
      </div>

      {/* Powered by */}
      <div className="text-center py-1.5 text-[10px] text-muted-foreground border-t">
        Powered by Agent Studio
      </div>
    </div>
  );
}
