/**
 * k6 Load Test — agent-studio ECC
 *
 * Usage:
 *   k6 run k6/load-test.js --env BASE_URL=https://your-domain.up.railway.app
 *   k6 run k6/load-test.js --env BASE_URL=http://localhost:3000
 *
 * Scenarios:
 *   - Health check (smoke)
 *   - Skills API (search, list)
 *   - Agent card endpoint
 *   - Chat endpoint (non-streaming)
 *
 * SLA Targets:
 *   P95 < 5s   flow execution
 *   P99 < 2s   KB search
 *   P95 < 100ms skill metadata
 */

import http from "k6/http";
import { check, sleep } from "k6";
import { Rate, Trend } from "k6/metrics";

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";
const AUTH_TOKEN = __ENV.AUTH_TOKEN || "";

const errorRate = new Rate("errors");
const healthDuration = new Trend("health_duration", true);
const skillsDuration = new Trend("skills_duration", true);
const chatDuration = new Trend("chat_duration", true);

export const options = {
  scenarios: {
    smoke: {
      executor: "constant-vus",
      vus: 5,
      duration: "1m",
      exec: "healthCheck",
    },
    skills_load: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "2m", target: 50 },
        { duration: "5m", target: 100 },
        { duration: "2m", target: 0 },
      ],
      exec: "skillsAPI",
      startTime: "1m",
    },
    chat_load: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "2m", target: 20 },
        { duration: "5m", target: 50 },
        { duration: "2m", target: 0 },
      ],
      exec: "chatEndpoint",
      startTime: "1m",
    },
  },
  thresholds: {
    "health_duration{scenario:smoke}": ["p(95)<500"],
    "skills_duration{scenario:skills_load}": ["p(95)<100"],
    "chat_duration{scenario:chat_load}": ["p(95)<5000"],
    errors: ["rate<0.05"],
  },
};

function headers() {
  const h = { "Content-Type": "application/json" };
  if (AUTH_TOKEN) {
    h["Cookie"] = `authjs.session-token=${AUTH_TOKEN}`;
  }
  return h;
}

export function healthCheck() {
  const res = http.get(`${BASE_URL}/api/health`);
  healthDuration.add(res.timings.duration);
  check(res, {
    "health status 200": (r) => r.status === 200,
    "health body ok": (r) => {
      try {
        return JSON.parse(r.body).status === "healthy";
      } catch {
        return false;
      }
    },
  }) || errorRate.add(1);
  sleep(1);
}

export function skillsAPI() {
  const queries = ["typescript", "python", "security", "testing", "api"];
  const query = queries[Math.floor(Math.random() * queries.length)];

  const res = http.get(`${BASE_URL}/api/skills?q=${query}&pageSize=10`, {
    headers: headers(),
  });
  skillsDuration.add(res.timings.duration);
  check(res, {
    "skills status 200": (r) => r.status === 200,
    "skills has data": (r) => {
      try {
        return JSON.parse(r.body).success === true;
      } catch {
        return false;
      }
    },
  }) || errorRate.add(1);
  sleep(0.5);
}

export function chatEndpoint() {
  const agentId = __ENV.TEST_AGENT_ID || "test-agent";
  const messages = [
    "What is TypeScript?",
    "How do I handle errors?",
    "Explain async/await",
    "What are design patterns?",
    "How to write tests?",
  ];
  const message = messages[Math.floor(Math.random() * messages.length)];

  const res = http.post(
    `${BASE_URL}/api/agents/${agentId}/chat`,
    JSON.stringify({ message, stream: false }),
    { headers: headers(), timeout: "30s" }
  );
  chatDuration.add(res.timings.duration);
  check(res, {
    "chat status 200": (r) => r.status === 200,
  }) || errorRate.add(1);
  sleep(2);
}
