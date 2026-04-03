# Load Tests — Agent Studio

k6-based performance tests validating SLO targets at production load.

## SLO Targets

| Endpoint | Metric | Target |
|----------|--------|--------|
| `GET /api/health` | P95 latency | < 100ms |
| `GET /api/agents` | P99 latency | < 500ms |
| `POST /api/agents/:id/knowledge/search` | P99 latency | < 2s |
| `POST /api/agents/:id/chat` (non-streaming) | P95 latency | < 5s |
| Global error rate | rate | < 2% |

## Prerequisites

Install k6: https://grafana.com/docs/k6/latest/set-up/install-k6/

```bash
# macOS
brew install k6

# Linux
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg \
  --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" \
  | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update && sudo apt-get install k6
```

## Usage

```bash
# Quick smoke test (local dev, default options)
pnpm test:load

# Against staging with custom duration
BASE_URL=https://staging.railway.app \
  TEST_AGENT_ID=<agent-id> \
  k6 run load-tests/agent-studio.js --duration 5m

# Full 30-min load test (production-scale)
BASE_URL=https://your-app.railway.app \
  TEST_AGENT_ID=<agent-id> \
  AUTH_COOKIE="authjs.session-token=<token>" \
  k6 run --vus 100 --duration 30m load-tests/agent-studio.js

# Generate HTML report
k6 run load-tests/agent-studio.js --out json=load-tests/results.json
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `BASE_URL` | No | Target URL (default: `http://localhost:3000`) |
| `TEST_AGENT_ID` | For chat/KB tests | An existing agent ID |
| `AUTH_COOKIE` | For auth-protected endpoints | Session cookie string |

## Scenarios

1. **background** — 10 VUs, 5 min constant: health check + agent list
2. **chat_load** — ramp 0→50→0 VUs over 5 min: chat messages
3. **kb_spike** — arrival rate 5→30→5 req/s over 4 min: KB search

## Interpreting Results

The test **fails** (non-zero exit code) if any SLO threshold is violated.
Check the summary output for `✓` (pass) and `✗` (fail) on each threshold.

```
✓ http_req_duration{endpoint:health}.....: p(95)=87ms  ✓
✗ chat_duration_ms........................: p(95)=6.2s  ✗  (target: <5s)
```
