import { type Page } from "@playwright/test";
import {
  MOCK_CHAT_RESPONSE,
  MOCK_EMBEDDING_RESPONSE,
  createMockDeepSeekSSE,
  createMockNDJSONStream,
} from "./ai-responses";

/**
 * Mock all external AI provider API calls.
 *
 * Must be called before any test that triggers chat or embedding operations.
 * Uses Playwright's page.route() to intercept outgoing requests.
 */
export async function mockAIProviders(page: Page) {
  // Mock DeepSeek Chat API (streaming SSE)
  await page.route("**/api.deepseek.com/**", (route) => {
    const body = createMockDeepSeekSSE("Hello! I'm a test assistant.");
    return route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body,
    });
  });

  // Mock OpenAI Chat API
  await page.route("**/api.openai.com/v1/chat/completions", (route) => {
    const body = createMockDeepSeekSSE(
      "Hello from OpenAI mock! How can I help?"
    );
    return route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body,
    });
  });

  // Mock OpenAI Embeddings API
  await page.route("**/api.openai.com/v1/embeddings", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_EMBEDDING_RESPONSE),
    })
  );

  // Mock Anthropic API
  await page.route("**/api.anthropic.com/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: createMockDeepSeekSSE("Hello from Anthropic mock!"),
    })
  );

  // Mock Google Gemini API
  await page.route("**/generativelanguage.googleapis.com/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: createMockDeepSeekSSE("Hello from Gemini mock!"),
    })
  );

  // Mock Groq API
  await page.route("**/api.groq.com/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: createMockDeepSeekSSE("Hello from Groq mock!"),
    })
  );
}

/**
 * Mock the internal chat API endpoint to return NDJSON stream.
 * Use this when you want to bypass the entire backend and test
 * pure frontend streaming behavior.
 */
export async function mockChatAPI(
  page: Page,
  options?: { content?: string; agentId?: string }
) {
  const pattern = options?.agentId
    ? `**/api/agents/${options.agentId}/chat`
    : "**/api/agents/*/chat";

  const body = options?.content
    ? createMockNDJSONStream(options.content)
    : MOCK_CHAT_RESPONSE;

  await page.route(pattern, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/x-ndjson",
      body,
    })
  );
}

/**
 * Mock the embeddings for knowledge base operations.
 * Intercepts at the Next.js API level, not provider level.
 */
export async function mockEmbeddings(page: Page) {
  await page.route("**/api.openai.com/v1/embeddings", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_EMBEDDING_RESPONSE),
    })
  );
}
