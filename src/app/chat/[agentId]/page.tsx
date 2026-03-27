"use client";

import { useState, useRef, useEffect, use, useCallback } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import {
  ArrowLeft,
  Send,
  Bot,
  User,
  Square,
  MessageSquare,
  Plus,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useStreamingChat, type ChatMessage } from "@/components/chat/use-streaming-chat";

interface ConversationSummary {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: string;
  preview: string;
}

export default function ChatPage({
  params,
}: {
  params: Promise<{ agentId: string }>;
}) {
  const { agentId } = use(params);
  const [agentName, setAgentName] = useState("Agent");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sidebar state
  const [showSidebar, setShowSidebar] = useState(true);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);

  const {
    messages,
    input,
    setInput,
    isLoading,
    conversationId,
    sendMessage,
    stopGeneration,
    resetChat,
    loadConversation,
  } = useStreamingChat({ agentId });

  // Keep active conversation indicator in sync
  useEffect(() => {
    if (conversationId) setActiveConvId(conversationId);
  }, [conversationId]);

  useEffect(() => {
    fetch(`/api/agents/${agentId}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.success) setAgentName(json.data.name);
      })
      .catch(() => {});
  }, [agentId]);

  const fetchConversations = useCallback(() => {
    fetch(`/api/agents/${agentId}/conversations`)
      .then((r) => r.json())
      .then((json) => {
        if (json.success) setConversations(json.data);
      })
      .catch(() => {});
  }, [agentId]);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  // Refresh conversation list when a new one starts
  useEffect(() => {
    if (conversationId) fetchConversations();
  }, [conversationId, fetchConversations]);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  async function handleSelectConversation(conv: ConversationSummary) {
    if (conv.id === activeConvId && messages.length > 0) return;
    try {
      const res = await fetch(`/api/agents/${agentId}/conversations/${conv.id}`);
      const json = await res.json();
      if (json.success) {
        const msgs: ChatMessage[] = json.data.messages.map(
          (m: { role: string; content: string; metadata?: Record<string, unknown> }) => ({
            role: m.role as "user" | "assistant",
            content: m.content,
            ...(m.metadata ? { metadata: m.metadata } : {}),
          })
        );
        loadConversation(conv.id, msgs);
        setActiveConvId(conv.id);
      }
    } catch {
      // silent fail
    }
  }

  function handleNewChat() {
    resetChat();
    setActiveConvId(null);
    inputRef.current?.focus();
  }

  return (
    <div className="flex h-screen flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 border-b px-4 py-2 shrink-0">
        <Button variant="ghost" size="icon-sm" aria-label="Back to flow builder" asChild>
          <Link href={`/builder/${agentId}`}>
            <ArrowLeft className="size-4" aria-hidden="true" />
          </Link>
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={showSidebar ? "Hide conversations" : "Show conversations"}
          onClick={() => setShowSidebar((v) => !v)}
          title="Toggle conversation list"
        >
          {showSidebar ? (
            <ChevronLeft className="size-4" aria-hidden="true" />
          ) : (
            <ChevronRight className="size-4" aria-hidden="true" />
          )}
        </Button>
        <h2 className="text-sm font-semibold flex-1">{agentName}</h2>
        <Button variant="outline" size="sm" onClick={handleNewChat}>
          <Plus className="mr-1.5 size-3.5" />
          New Chat
        </Button>
      </div>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Conversation sidebar */}
        {showSidebar && (
          <div className="flex w-60 shrink-0 flex-col border-r bg-muted/20">
            <div className="px-3 py-2 border-b">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Conversations
              </p>
            </div>
            <div className="flex-1 overflow-y-auto py-1">
              {conversations.length === 0 ? (
                <p className="px-3 py-4 text-xs text-muted-foreground text-center">
                  No conversations yet
                </p>
              ) : (
                conversations.map((conv) => (
                  <button
                    key={conv.id}
                    onClick={() => handleSelectConversation(conv)}
                    className={cn(
                      "w-full text-left px-3 py-2.5 hover:bg-muted/60 transition-colors border-b border-border/40 last:border-0",
                      activeConvId === conv.id && "bg-muted"
                    )}
                  >
                    <div className="flex items-center gap-2 mb-0.5">
                      <MessageSquare className="size-3 shrink-0 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">
                        {new Date(conv.updatedAt).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                    </div>
                    <p className="text-xs text-foreground line-clamp-2 pl-5">
                      {conv.preview || "Empty conversation"}
                    </p>
                  </button>
                ))
              )}
            </div>
          </div>
        )}

        {/* Chat area */}
        <div className="flex flex-1 flex-col overflow-hidden">
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto p-4 space-y-4"
            aria-live="polite"
            aria-label="Chat messages"
            role="log"
          >
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
                    <User className="size-4" aria-hidden="true" />
                  ) : (
                    <Bot className="size-4" aria-hidden="true" />
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
                  {msg.role === "assistant" ? (
                    <>
                      {msg.content ? (
                        <div className="markdown-body">
                          <ReactMarkdown>{msg.content}</ReactMarkdown>
                        </div>
                      ) : (
                        <span className="text-muted-foreground italic">...</span>
                      )}
                      {(msg.metadata as { plots?: string[] } | undefined)?.plots?.map((src, pi) => (
                        <div
                          key={pi}
                          className="mt-3 overflow-hidden rounded-lg border border-border bg-muted/30"
                        >
                          <img
                            src={src}
                            alt={`Python plot ${pi + 1}`}
                            className="max-w-full"
                            loading="lazy"
                          />
                        </div>
                      ))}
                    </>
                  ) : (
                    msg.content
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

          {/* Input bar */}
          <div className="border-t p-4 shrink-0">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                sendMessage();
              }}
              className="mx-auto flex max-w-2xl gap-2"
            >
              <Input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Type a message..."
                disabled={isLoading}
                autoFocus
                data-testid="chat-input"
              />
              {isLoading ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={stopGeneration}
                  aria-label="Stop generating"
                  data-testid="chat-stop-btn"
                >
                  <Square className="size-4 fill-current" aria-hidden="true" />
                </Button>
              ) : (
                <Button
                  type="submit"
                  disabled={!input.trim()}
                  aria-label="Send message"
                  data-testid="chat-send-btn"
                >
                  <Send className="size-4" aria-hidden="true" />
                </Button>
              )}
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
