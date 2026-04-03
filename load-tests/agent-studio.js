/**
 * k6 Load Test — Agent Studio
 *
 * SLO targets (Google SRE book, P-percentile at peak load):
 *   P95 < 100ms  — health check
 *   P99 < 500ms  — agent list
 *   P99 < 2s     — KB search
 *   P95 < 5s     — chat response (non-streaming)
 *
 * Usage:
 *   k6 run load-tests/agent-studio.js
 *   BASE_URL=https://your-app.railway.app k6 run load-tests/agent-studio.js
 *   k6 run --vus 100 --duration 30m load-tests/agent-studio.js
 *
 * Requires:
 *   TEST_AGENT_ID  — an existing agent ID to use for chat/KB tests
 *   AUTH_COOKIE    — session cookie (optional; skip auth tests if omitted)
 */

import http from "k6/http";
import { check, group, sleep } from "k6";
import { Rate, Trend } from "k6/metrics";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const BASE_URL = __ENV.BASE_URL ?? "http://localhost:3000";
const TEST_AGENT_ID = __ENV.TEST_AGENT_ID ?? "";
const AUTH_COOKIE = __ENV.AUTH_COOKIE ?? "";

// Custom metrics
const errorRate = new Rate("errors");
const chatDuration = new Trend("chat_duration_ms", true);
const kbSearchDuration = new Trend("kb_search_duration_ms", true);

// ---------------------------------------------------------------------------
// Load profile — ramping VUs
// ---------------------------------------------------------------------------

export const options = {
  scenarios: {
    // Scenario 1: steady health + listing (light background traffic)
    background: {
      executor: "constant-vus",
      vus: 10,
      duration: "5m",
      exec: "backgroundScenario",
      tags: { scenario: "background" },
    },

    // Scenario 2: chat load — ramp up to 50 VUs
    chat_load: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "1m", target: 20 },
        { duration: "3m", target: 50 },
        { duration: "1m", target: 0 },
      ],
      exec: "chatScenario",
      tags: { scenario: "chat" },
    },

    // Scenario 3: KB search spike
    kb_spike: {
      executor: "ramping-arrival-rate",
      startRate: 5,
      timeUnit: "1s",
      preAllocatedVUs: 20,
      maxVUs: 50,
      stages: [
        { duration: "1m", target: 10 },
        { duration: "2m", target: 30 },
        { duration: "1m", target: 5 },
      ],
      exec: "kbSearchScenario",
      tags: { scenario: "kb_search" },
    },
  },

  // SLO thresholds — test FAILS if any are violated
  thresholds: {
    // Health check: 95th percentile under 100ms, error rate < 1%
    "http_req_duration{endpoint:health}": ["p(95)<100"],
    "http_req_failed{endpoint:health}": ["rate<0.01"],

    // Agent list: 99th percentile under 500ms
    "http_req_duration{endpoint:agents}": ["p(99)<500"],

    // KB search: 99th percentile under 2s
    kb_search_duration_ms: ["p(99)<2000"],

    // Chat: 95th percentile under 5s
    chat_duration_ms: ["p(95)<5000"],

    // Global error rate < 2%
    errors: ["rate<0.02"],
  },
};

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function buildHeaders() {
  const headers = { "Content-Type": "application/json" };
  if (AUTH_COOKIE) {
    headers["Cookie"] = AUTH_COOKIE;
  }
  return headers;
}

function recordError(res, label) {
  const ok = res.status >= 200 && res.status < 300;
  errorRate.add(!ok, { endpoint: label });
  return ok;
}

// ---------------------------------------------------------------------------
// Scenario: background traffic (health + agent list)
// ---------------------------------------------------------------------------

export function backgroundScenario() {
  group("health check", () => {
    const res = http.get(`${BASE_URL}/api/health`, {
      tags: { endpoint: "health" },
    });
    const ok = check(res, {
      "health 200": (r) => r.status === 200,
      "health json ok": (r) => {
        try {
          return JSON.parse(r.body)?.success === true;
        } catch {
          return false;
        }
      },
    });
    recordError(res, "health");
    if (!ok) {
      console.error(`Health check failed: ${res.status} ${res.body}`);
    }
  });

  sleep(1);

  group("agent list", () => {
    const res = http.get(`${BASE_URL}/api/agents`, {
      headers: buildHeaders(),
      tags: { endpoint: "agents" },
    });
    check(res, {
      "agents list 200 or 401": (r) => r.status === 200 || r.status === 401,
    });
    recordError(res, "agents");
  });

  sleep(Math.random() * 2 + 1); // 1–3s between iterations
}

// ---------------------------------------------------------------------------
// Scenario: chat messages
// ---------------------------------------------------------------------------

export function chatScenario() {
  if (!TEST_AGENT_ID) {
    sleep(1);
    return;
  }

  group("chat message", () => {
    const payload = JSON.stringify({
      message: "What can you help me with?",
      stream: false,
    });

    const start = Date.now();
    const res = http.post(
      `${BASE_URL}/api/agents/${TEST_AGENT_ID}/chat`,
      payload,
      {
        headers: buildHeaders(),
        timeout: "30s",
        tags: { endpoint: "chat" },
      },
    );
    const elapsed = Date.now() - start;
    chatDuration.add(elapsed);

    const ok = check(res, {
      "chat 200": (r) => r.status === 200,
      "chat has messages": (r) => {
        try {
          const body = JSON.parse(r.body);
          return body?.success === true && Array.isArray(body?.data?.messages);
        } catch {
          return false;
        }
      },
    });
    recordError(res, "chat");
    if (!ok) {
      console.error(`Chat failed: ${res.status}`);
    }
  });

  sleep(Math.random() * 3 + 2); // 2–5s between chat messages
}

// ---------------------------------------------------------------------------
// Scenario: KB search
// ---------------------------------------------------------------------------

const KB_QUERIES = [
  "How does the flow editor work?",
  "What AI models are supported?",
  "How do I set up webhooks?",
  "What is the agent-to-agent protocol?",
  "How do I export my agent?",
];

export function kbSearchScenario() {
  if (!TEST_AGENT_ID) {
    sleep(1);
    return;
  }

  group("kb search", () => {
    const query = KB_QUERIES[Math.floor(Math.random() * KB_QUERIES.length)];
    const payload = JSON.stringify({ query, limit: 5 });

    const start = Date.now();
    const res = http.post(
      `${BASE_URL}/api/agents/${TEST_AGENT_ID}/knowledge/search`,
      payload,
      {
        headers: buildHeaders(),
        timeout: "15s",
        tags: { endpoint: "kb_search" },
      },
    );
    const elapsed = Date.now() - start;
    kbSearchDuration.add(elapsed);

    check(res, {
      "kb search 200": (r) => r.status === 200,
    });
    recordError(res, "kb_search");
  });

  sleep(Math.random() * 2 + 0.5); // 0.5–2.5s
}
