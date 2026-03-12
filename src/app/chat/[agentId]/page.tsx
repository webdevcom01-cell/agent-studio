"use client";

import { useState, useRef, useEffect, use } from "react";
import Link from "next/link";
import { ArrowLeft, Send, Bot, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useStreamingChat } from "@/components/chat/use-streaming-chat";

export default function ChatPage({
  params,
}: {
  params: Promise<{ agentId: string }>;
}) {
  const { agentId } = use(params);
  const [agentName, setAgentName] = useState("Agent");
  const scrollRef = useRef<HTMLDivElement>(null);

  const {
    messages,
    input,
    setInput,
    isLoading,
    sendMessage,
    resetChat,
  } = useStreamingChat({ agentId });

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

  return (
    <div className="flex h-screen flex-col">
      <div className="flex items-center gap-2 border-b px-4 py-2">
        <Button variant="ghost" size="icon-sm" asChild>
          <Link href={`/builder/${agentId}`}>
            <ArrowLeft className="size-4" />
          </Link>
        </Button>
        <h2 className="text-sm font-semibold flex-1">{agentName}</h2>
        <Button variant="outline" size="sm" onClick={resetChat}>
          New Chat
        </Button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <Bot className="size-12 mb-4" />
            <p>Send a message to start chatting with {agentName}</p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            data-testid={`chat-message-${msg.role}`}
            className={cn(
              "flex gap-3 max-w-2xl",
              msg.role === "user" ? "ml-auto flex-row-reverse" : ""
            )}
          >
            <div
              className={cn(
                "flex size-8 shrink-0 items-center justify-center rounded-full",
                msg.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted"
              )}
            >
              {msg.role === "user" ? (
                <User className="size-4" />
              ) : (
                <Bot className="size-4" />
              )}
            </div>
            <div
              className={cn(
                "rounded-lg px-4 py-2.5 text-sm",
                msg.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted"
              )}
            >
              {msg.content || (
                <span className="text-muted-foreground italic">...</span>
              )}
            </div>
          </div>
        ))}

        {isLoading && messages[messages.length - 1]?.role !== "assistant" && (
          <div className="flex gap-3" data-testid="chat-loading">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted">
              <Bot className="size-4" />
            </div>
            <div className="rounded-lg bg-muted px-4 py-2.5">
              <div className="flex gap-1">
                <span className="size-2 rounded-full bg-muted-foreground/50 animate-bounce" />
                <span className="size-2 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:150ms]" />
                <span className="size-2 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:300ms]" />
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="border-t p-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            sendMessage();
          }}
          className="mx-auto flex max-w-2xl gap-2"
        >
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a message..."
            disabled={isLoading}
            autoFocus
            data-testid="chat-input"
          />
          <Button type="submit" disabled={isLoading || !input.trim()} data-testid="chat-send-btn">
            <Send className="size-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}
