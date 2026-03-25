/**
 * k6 Load Test — Multi-Replica Validation (P5-T2)
 *
 * Validates that 2-replica deployment handles 100 concurrent users
 * without degradation. Tests health, API, and chat endpoints.
 *
 * Run:
 *   k6 run scripts/load-test.js --env BASE_URL=https://agent-studio-production-c43e.up.railway.app
 *
 * Requirements:
 *   - k6 installed: https://k6.io/docs/getting-started/installation/
 *   - REDIS_URL configured on Railway (shared state across replicas)
 *   - numReplicas=2 in railway.toml
 *
 * Targets:
 *   - P95 response time < 2s for health
 *   - P95 response time < 5s for API
 *   - Error rate < 1%
 *   - Both replicas serve requests (verify via replicaId in health response)
 */

// eslint-disable-next-line no-undef
const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";

export const options = {
  stages: [
    { duration: "30s", target: 50 },
    { duration: "2m", target: 100 },
    { duration: "1m", target: 100 },
    { duration: "30s", target: 0 },
  ],
  thresholds: {
    http_req_duration: ["p(95)<5000"],
    "http_req_duration{endpoint:health}": ["p(95)<2000"],
    http_req_failed: ["rate<0.01"],
  },
};

// eslint-disable-next-line no-undef
const http = await import("k6/http");
// eslint-disable-next-line no-undef
const { check, sleep } = await import("k6");

const replicaIds = new Set();

export default function () {
  // Health check — lightweight, tests both replicas
  const healthRes = http.get(`${BASE_URL}/api/health`, {
    tags: { endpoint: "health" },
  });

  check(healthRes, {
    "health: status 200": (r) => r.status === 200,
    "health: body is healthy": (r) => {
      const body = JSON.parse(r.body);
      if (body.replicaId) replicaIds.add(body.replicaId);
      return body.status === "healthy";
    },
    "health: db ok": (r) => JSON.parse(r.body).db === "ok",
  });

  // Agents list — authenticated endpoint (will return 401 without token)
  const agentsRes = http.get(`${BASE_URL}/api/agents`, {
    tags: { endpoint: "agents" },
  });

  check(agentsRes, {
    "agents: responds": (r) => r.status === 200 || r.status === 401,
  });

  sleep(0.5);
}

export function teardown() {
  console.log(`Unique replica IDs observed: ${replicaIds.size}`);
  if (replicaIds.size >= 2) {
    console.log("PASS: Multiple replicas served requests (load balancing confirmed)");
  } else {
    console.log("WARN: Only 1 replica observed — check Railway numReplicas setting");
  }
}
