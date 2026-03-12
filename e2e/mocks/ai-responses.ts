/**
 * Mock AI provider responses for E2E tests.
 *
 * These replace real DeepSeek/OpenAI calls so tests:
 * - Don't consume API credits
 * - Are deterministic (same response every time)
 * - Run fast (no network latency)
 */

/* ─── NDJSON Streaming Chat Chunks ─── */

export function createMockNDJSONStream(
  content: string,
  conversationId = "conv_e2e_test_001"
): string {
  const words = content.split(" ");
  const chunks: string[] = [
    JSON.stringify({ type: "stream_start", nodeId: "node_ai_1" }),
  ];

  for (const word of words) {
    chunks.push(
      JSON.stringify({ type: "stream_delta", content: word + " " })
    );
  }

  chunks.push(
    JSON.stringify({ type: "stream_end", content }),
    JSON.stringify({
      type: "message",
      content,
      role: "assistant",
    }),
    JSON.stringify({ type: "done", conversationId, waitForInput: false })
  );

  return chunks.join("\n") + "\n";
}

export const MOCK_CHAT_RESPONSE = createMockNDJSONStream(
  "Hello! I'm a test assistant. How can I help you today?"
);

export const MOCK_CHAT_RESPONSE_KB = createMockNDJSONStream(
  "Based on the knowledge base, the answer is: Agent Studio supports 28 node types including message, condition, ai_response, and kb_search."
);

/* ─── Non-Streaming Chat Response (JSON) ─── */

export const MOCK_CHAT_JSON_RESPONSE = {
  success: true,
  data: {
    messages: [
      {
        role: "assistant",
        content: "Hello! I'm a test assistant. How can I help you today?",
      },
    ],
    conversationId: "conv_e2e_test_001",
  },
};

/* ─── OpenAI Embeddings Response ─── */

export function createMockEmbeddingResponse(count = 1) {
  return {
    object: "list",
    data: Array.from({ length: count }, (_, i) => ({
      object: "embedding",
      index: i,
      embedding: Array.from({ length: 1536 }, () => Math.random() * 0.1),
    })),
    model: "text-embedding-3-small",
    usage: { prompt_tokens: 10, total_tokens: 10 },
  };
}

export const MOCK_EMBEDDING_RESPONSE = createMockEmbeddingResponse(1);

/* ─── DeepSeek Chat Completion (raw provider response) ─── */

export const MOCK_DEEPSEEK_COMPLETION = {
  id: "chatcmpl-e2e-test",
  object: "chat.completion",
  created: Date.now(),
  model: "deepseek-chat",
  choices: [
    {
      index: 0,
      message: {
        role: "assistant",
        content: "Hello! I'm a test assistant.",
      },
      finish_reason: "stop",
    },
  ],
  usage: { prompt_tokens: 50, completion_tokens: 10, total_tokens: 60 },
};

/* ─── DeepSeek Streaming SSE (raw provider response) ─── */

export function createMockDeepSeekSSE(content: string): string {
  const words = content.split(" ");
  const events: string[] = [];

  for (const word of words) {
    events.push(
      `data: ${JSON.stringify({
        id: "chatcmpl-e2e-test",
        object: "chat.completion.chunk",
        choices: [{ index: 0, delta: { content: word + " " } }],
      })}\n`
    );
  }

  events.push("data: [DONE]\n");
  return events.join("\n");
}
