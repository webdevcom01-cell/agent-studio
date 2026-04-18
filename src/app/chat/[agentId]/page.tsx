"use client";

import { useState, useRef, useEffect, use, useCallback } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import {
  ArrowLeft,
  Send,
  Bot,
  Square,
  MessageSquare,
  Plus,
  PanelLeftClose,
  PanelLeftOpen,
  Workflow,
  GitBranch,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useStreamingChat, type ChatMessage } from "@/components/chat/use-streaming-chat";
import { PipelineProgress } from "@/components/chat/pipeline-progress";
import { StructuredOutputMessage } from "@/components/chat/structured-output-message";

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
}): React.ReactElement {
  const { agentId } = use(params);
  const [agentName, setAgentName] = useState("Agent");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

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

  useEffect(() => {
    if (conversationId) setActiveConvId(conversationId);
  }, [conversationId]);

  useEffect(() => {
    fetch(`/api/agents/${agentId}`)
      .then((r) => r.json())
      .then((json) => { if (json.success) setAgentName(json.data.name); })
      .catch(() => {});
  }, [agentId]);

  const fetchConversations = useCallback(() => {
    fetch(`/api/agents/${agentId}/conversations`)
      .then((r) => r.json())
      .then((json) => { if (json.success) setConversations(json.data); })
      .catch(() => {});
  }, [agentId]);

  useEffect(() => { fetchConversations(); }, [fetchConversations]);
  useEffect(() => { if (conversationId) fetchConversations(); }, [conversationId, fetchConversations]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  async function handleSelectConversation(conv: ConversationSummary): Promise<void> {
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

  function handleNewChat(): void {
    resetChat();
    setActiveConvId(null);
    inputRef.current?.focus();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>): void {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (input.trim() && !isLoading) sendMessage();
    }
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex h-[52px] shrink-0 items-center gap-1 border-b border-border px-3">
        <Button variant="ghost" size="icon-sm" asChild aria-label="Back to dashboard">
          <Link href="/"><ArrowLeft className="size-3.5" /></Link>
        </Button>

        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={showSidebar ? "Hide conversations" : "Show conversations"}
          onClick={() => setShowSidebar((v) => !v)}
        >
          {showSidebar
            ? <PanelLeftClose className="size-3.5" />
            : <PanelLeftOpen className="size-3.5" />
          }
        </Button>

        <span className="mx-1 flex-1 text-sm font-medium tracking-tight text-foreground">
          {agentName}
        </span>

        <Button variant="ghost" size="icon-sm" asChild title="Open in Builder" aria-label="Open in Builder">
          <Link href={`/builder/${agentId}`}><Workflow className="size-3.5" /></Link>
        </Button>

        <Button variant="ghost" size="icon-sm" asChild title="SDLC Pipelines" aria-label="SDLC Pipelines">
          <Link href={`/pipelines/${agentId}`}><GitBranch className="size-3.5" /></Link>
        </Button>

        <div className="mx-1 h-4 w-px bg-border" />

        <Button variant="outline" size="sm" onClick={handleNewChat} className="gap-1.5">
          <Plus className="size-3.5" />
          New Chat
        </Button>
      </div>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">

        {/* Conversation sidebar */}
        {showSidebar && (
          <div className="flex w-56 shrink-0 flex-col border-r border-border">
            <div className="border-b border-border px-3 py-2.5">
              <p className="text-[10px] font-medium uppercase tracking-widest text-foreground/20">
                Conversations
              </p>
            </div>
            <div className="flex-1 overflow-y-auto py-1">
              {conversations.length === 0 ? (
                <p className="px-3 py-6 text-center text-xs text-muted-foreground/40">
                  No conversations yet
                </p>
              ) : (
                conversations.map((conv) => (
                  <button
                    key={conv.id}
                    onClick={() => handleSelectConversation(conv)}
                    className={cn(
                      "group w-full border-b border-border/40 px-3 py-2.5 text-left transition-colors last:border-0 hover:bg-white/[0.02]",
                      activeConvId === conv.id && "bg-white/[0.04]"
                    )}
                  >
                    <div className="mb-0.5 flex items-center gap-1.5">
                      <MessageSquare className="size-3 shrink-0 text-muted-foreground/30" />
                      <span className="text-[10px] text-muted-foreground/40">
                        {new Date(conv.updatedAt).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                    </div>
                    <p className="line-clamp-2 pl-[18px] text-xs text-muted-foreground group-hover:text-foreground">
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

          {/* Messages */}
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto px-4 py-6"
            aria-live="polite"
            aria-label="Chat messages"
            role="log"
          >
            <div className="mx-auto flex max-w-2xl flex-col gap-5">
              {messages.length === 0 && (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <div className="mb-4 rounded-full border border-border p-4">
                    <Bot className="size-5 text-muted-foreground/40" />
                  </div>
                  <p className="text-sm text-muted-foreground/40">
                    Start a conversation with {agentName}
                  </p>
                </div>
              )}

              {messages.map((msg, i) => (
                <div
                  key={i}
                  data-testid={`chat-message-${msg.role}`}
                  className={cn(
                    "flex gap-3",
                    msg.role === "user" && "flex-row-reverse"
                  )}
                >
                  {/* Avatar */}
                  <div className={cn(
                    "flex size-7 shrink-0 items-center justify-center rounded-full border border-border text-[11px] font-medium",
                    msg.role === "user"
                      ? "bg-foreground text-background"
                      : "bg-card text-muted-foreground"
                  )}>
                    {msg.role === "user" ? "U" : <Bot className="size-3.5" />}
                  </div>

                  {/* Bubble */}
                  <div className={cn(
                    "max-w-[80%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed",
                    msg.role === "user"
                      ? "rounded-tr-sm bg-foreground text-background"
                      : "rounded-tl-sm border border-border bg-card text-foreground"
                  )}>
                    {msg.role === "assistant" ? (
                      <>
                        {msg.content ? (
                          <div className="prose prose-sm prose-invert max-w-none">
                            <ReactMarkdown>{msg.content}</ReactMarkdown>
                          </div>
                        ) : (
                          <span className="italic text-muted-foreground">…</span>
                        )}
                        {(msg.metadata as { plots?: string[] } | undefined)?.plots?.map((src, pi) => (
                          <div
                            key={pi}
                            className="mt-3 overflow-hidden rounded-lg border border-border"
                          >
                            <img
                              src={src}
                              alt={`Python plot ${pi + 1}`}
                              className="max-w-full"
                              loading="lazy"
                            />
                          </div>
                        ))}
                        {(() => {
                          const meta = msg.metadata as Record<string, unknown> | undefined;
                          const structuredOutput = meta?.structuredOutput;
                          const schemaName = meta?.schemaName;
                          if (
                            structuredOutput !== null &&
                            typeof structuredOutput === "object" &&
                            !Array.isArray(structuredOutput) &&
                            typeof schemaName === "string"
                          ) {
                            return (
                              <StructuredOutputMessage
                                schemaName={schemaName}
                                data={structuredOutput as Record<string, unknown>}
                              />
                            );
                          }
                          return null;
                        })()}
                      </>
                    ) : (
                      msg.content
                    )}
                  </div>
                </div>
              ))}

              {/* Typing indicator */}
              {isLoading && messages[messages.length - 1]?.role !== "assistant" && (
                <div className="flex gap-3" data-testid="chat-loading">
                  <div className="flex size-7 shrink-0 items-center justify-center rounded-full border border-border bg-card">
                    <Bot className="size-3.5 text-muted-foreground/40" />
                  </div>
                  <div className="rounded-xl rounded-tl-sm border border-border bg-card px-4 py-3">
                    <div className="flex gap-1">
                      <span className="size-1.5 rounded-full bg-muted-foreground/30 animate-bounce" />
                      <span className="size-1.5 rounded-full bg-muted-foreground/30 animate-bounce [animation-delay:150ms]" />
                      <span className="size-1.5 rounded-full bg-muted-foreground/30 animate-bounce [animation-delay:300ms]" />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Pipeline progress */}
          <PipelineProgress
            agentId={agentId}
            conversationId={conversationId ?? null}
            isLoading={isLoading}
          />

          {/* Input bar */}
          <div className="shrink-0 border-t border-border px-4 py-3">
            <form
              onSubmit={(e) => { e.preventDefault(); sendMessage(); }}
              className="mx-auto flex max-w-2xl items-end gap-2"
            >
              <div className="relative flex-1">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Message…"
                  disabled={isLoading}
                  rows={1}
                  autoFocus
                  data-testid="chat-input"
                  className="w-full resize-none rounded-lg border border-border bg-card px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50 max-h-[120px] overflow-y-auto"
                />
              </div>
              {isLoading ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={stopGeneration}
                  aria-label="Stop generating"
                  data-testid="chat-stop-btn"
                  className="shrink-0"
                >
                  <Square className="size-3.5 fill-current" />
                </Button>
              ) : (
                <Button
                  type="submit"
                  size="sm"
                  disabled={!input.trim()}
                  aria-label="Send message"
                  data-testid="chat-send-btn"
                  className="shrink-0"
                >
                  <Send className="size-3.5" />
                </Button>
              )}
            </form>
            <p className="mt-1.5 text-center text-[11px] text-muted-foreground/20">
              Enter to send · Shift+Enter for new line
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
