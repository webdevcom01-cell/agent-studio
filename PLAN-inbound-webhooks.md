# Inbound Webhooks — Implementation Plan

## Problem Statement

Agent flows can currently be triggered only by: user chat messages, direct `/execute` API calls,
or scheduled cron/interval timers. There is no way for **external systems** (Slack, GitHub, Stripe,
custom backends) to trigger an agent flow via a standard webhook HTTP POST.

The `webhook` node exists but is **outbound only** — it sends requests, it cannot receive them.

---

## Research Summary

### Industry Standards (2025-2026)

| Standard | Key Insight |
|----------|-------------|
| **Standard Webhooks (standardwebhooks.com)** | HMAC-SHA256 signatures, `svix-id`/`svix-timestamp`/`svix-signature` headers, 5-min timestamp window |
| **CloudEvents (CNCF)** | Vendor-neutral event envelope: `specversion`, `type`, `source`, `id`, `time`, `data` |
| **Google A2A** | JWT-based auth with JWKS endpoint, async push notifications for long-running tasks |
| **MCP Streamable HTTP** | Dual-channel (POST request + GET SSE), session persistence, no native webhook trigger yet |

### Framework Patterns

| Framework | How Inbound Webhooks Work |
|-----------|--------------------------|
| **Dify.ai** | `Webhook Trigger` node — auto-generates callback URL, extracts query/header/body variables |
| **LangGraph** | Custom routes at `platform-url/[route]`, event-driven with conditional edges |
| **CrewAI Enterprise** | Webhook listeners for external events (email, Slack, CRM), authentication tokens |
| **n8n** | Core webhook node on all plans, multi-method support, production-grade idempotency |
| **FlowiseAI** | REST API chatflow endpoint, Zapier integration for external triggers |

### Security Best Practices

- **HMAC-SHA256** signature verification (used by GitHub, Stripe, Slack, Standard Webhooks)
- **Timing-safe comparison** (`crypto.timingSafeEqual`) — prevents timing attacks
- **Timestamp validation** — 5-minute window, prevents replay attacks
- **Idempotency keys** — unique event ID stored in DB, prevents duplicate execution
- **Rate limiting** — per-webhook endpoint, prevents abuse
- **SSRF protection** — already exists in our codebase (`validateExternalUrlWithDNS`)

### Existing Infrastructure (What We Already Have)

| Component | Status | Notes |
|-----------|--------|-------|
| `schedule_trigger` node + handler | ✅ Exists | Entry-point pattern: sets variables, passes through |
| `FlowSchedule` + `ScheduledExecution` models | ✅ Exists | Idempotency, failure tracking, execution history |
| `executeFlow()` + `executeFlowStreaming()` | ✅ Exists | Full flow execution engines |
| `loadContext()` + `saveContext()` | ✅ Exists | Context management |
| `findStartNode()` | ✅ Exists | Finds entry-point node (no incoming edges) |
| Rate limiter (`src/lib/rate-limit.ts`) | ✅ Exists | Sliding window, in-memory |
| Auth guards | ✅ Exists | `requireAuth()`, `requireAgentOwner()` |
| URL validation | ✅ Exists | SSRF protection in `url-validation.ts` |
| Handler registry (33 handlers) | ✅ Exists | Easy to extend |
| `webhook` handler (outbound) | ✅ Exists | **Outbound only** — not what we need |

---

## Architecture Design

### High-Level Flow

```
External System (Slack/GitHub/Stripe)
  │
  ▼ HTTP POST
/api/agents/[agentId]/trigger/[webhookId]
  │
  ├── 1. Validate webhook exists & is enabled
  ├── 2. Verify HMAC-SHA256 signature
  ├── 3. Check timestamp (5-min window)
  ├── 4. Check idempotency (skip if already processed)
  ├── 5. Rate limit check
  ├── 6. Extract payload → flow variables
  ├── 7. Create conversation + RuntimeContext
  ├── 8. Execute flow (start from webhook_trigger node)
  ├── 9. Record execution in WebhookExecution
  └── 10. Return result to caller
```

### Authentication Model

Webhook endpoints are **public** (no session auth) but **secret-authenticated**:

```
┌─────────────────────────────────────┐
│  Standard Webhooks Signature        │
│                                     │
│  Headers:                           │
│    x-webhook-id: msg_xxx            │
│    x-webhook-timestamp: 1234567890  │
│    x-webhook-signature: v1=base64.. │
│                                     │
│  Verification:                      │
│    base = "${id}.${timestamp}.${body}" │
│    sig = HMAC-SHA256(secret, base)  │
│    Compare timing-safe with header  │
└─────────────────────────────────────┘
```

---

## Sprint Plan

### Sprint 1 — Database Models + Trigger Endpoint (Foundation)

**Goal:** Webhook configurations in DB, public trigger endpoint, signature verification.

#### 1.1 Prisma Schema

```prisma
model WebhookConfig {
  id              String   @id @default(cuid())
  agentId         String

  // Identity
  name            String               // "GitHub Push Events", "Stripe Payments"
  description     String?

  // Security
  secret          String               // HMAC-SHA256 signing secret (auto-generated)

  // Configuration
  enabled         Boolean  @default(true)

  // Payload mapping
  headerMappings  Json?    @default("{}") // { "X-GitHub-Event": "github_event_type" }
  bodyMappings    Json?    @default("{}") // { "$.repository.name": "repo_name" }

  // Metadata
  nodeId          String?              // Links to webhook_trigger node (for auto-sync)

  // Tracking
  lastTriggeredAt DateTime?
  triggerCount    Int      @default(0)
  failureCount    Int      @default(0)

  // Relations
  agent           Agent    @relation(fields: [agentId], references: [id], onDelete: Cascade)
  executions      WebhookExecution[]

  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@index([agentId])
  @@index([agentId, enabled])
}

model WebhookExecution {
  id              String   @id @default(cuid())
  webhookConfigId String

  // Idempotency
  idempotencyKey  String   @unique  // x-webhook-id header value

  // Execution
  status          WebhookExecutionStatus @default(PENDING)
  triggeredAt     DateTime
  completedAt     DateTime?
  durationMs      Int?

  // Request metadata
  sourceIp        String?
  eventType       String?             // Extracted from headers (X-GitHub-Event, etc.)

  // Results
  conversationId  String?             // Created conversation
  errorMessage    String?

  // Relations
  webhookConfig   WebhookConfig @relation(fields: [webhookConfigId], references: [id], onDelete: Cascade)

  createdAt       DateTime @default(now())

  @@index([webhookConfigId])
  @@index([webhookConfigId, createdAt])
}

enum WebhookExecutionStatus {
  PENDING
  RUNNING
  COMPLETED
  FAILED
  SKIPPED   // Duplicate idempotencyKey
}
```

#### 1.2 API Routes

| Route | Method | Auth | Purpose |
|-------|--------|------|---------|
| `/api/agents/[agentId]/webhooks` | GET | requireAgentOwner | List webhook configs |
| `/api/agents/[agentId]/webhooks` | POST | requireAgentOwner | Create webhook config (auto-generates secret) |
| `/api/agents/[agentId]/webhooks/[webhookId]` | GET | requireAgentOwner | Get webhook detail + recent executions |
| `/api/agents/[agentId]/webhooks/[webhookId]` | PATCH | requireAgentOwner | Update name, description, enabled, mappings |
| `/api/agents/[agentId]/webhooks/[webhookId]` | DELETE | requireAgentOwner | Delete webhook config + executions |
| `/api/agents/[agentId]/webhooks/[webhookId]/rotate` | POST | requireAgentOwner | Rotate signing secret |
| **`/api/agents/[agentId]/trigger/[webhookId]`** | **POST** | **Signature** | **Public trigger endpoint** |

#### 1.3 Trigger Endpoint Implementation

```
POST /api/agents/[agentId]/trigger/[webhookId]

Headers (Standard Webhooks):
  x-webhook-id: msg_xxx          → idempotency key
  x-webhook-timestamp: 1710000000 → Unix timestamp
  x-webhook-signature: v1=base64  → HMAC-SHA256

Body: Any JSON payload

Response:
  200: { success: true, executionId: "xxx", conversationId: "xxx" }
  400: { success: false, error: "Invalid signature" }
  404: { success: false, error: "Webhook not found" }
  409: { success: false, error: "Already processed" } (idempotent)
  429: { success: false, error: "Rate limit exceeded" }
```

#### 1.4 Signature Verification Module

**New file:** `src/lib/webhooks/verify.ts`

```typescript
// Implements Standard Webhooks verification:
// 1. Extract x-webhook-id, x-webhook-timestamp, x-webhook-signature
// 2. Validate timestamp within 5-minute window
// 3. Construct base string: "${id}.${timestamp}.${rawBody}"
// 4. Compute HMAC-SHA256 with webhook secret
// 5. Timing-safe comparison
// 6. Return { valid: boolean, error?: string }
```

#### 1.5 Files to Create/Modify

| Action | File | Description |
|--------|------|-------------|
| CREATE | `prisma/schema.prisma` (add models) | WebhookConfig, WebhookExecution, WebhookExecutionStatus |
| CREATE | `src/lib/webhooks/verify.ts` | HMAC-SHA256 signature verification |
| CREATE | `src/lib/webhooks/execute.ts` | Webhook → flow execution pipeline |
| CREATE | `src/app/api/agents/[agentId]/webhooks/route.ts` | GET list, POST create |
| CREATE | `src/app/api/agents/[agentId]/webhooks/[webhookId]/route.ts` | GET, PATCH, DELETE |
| CREATE | `src/app/api/agents/[agentId]/webhooks/[webhookId]/rotate/route.ts` | POST rotate secret |
| CREATE | `src/app/api/agents/[agentId]/trigger/[webhookId]/route.ts` | POST public trigger |
| MODIFY | `src/middleware.ts` | Add `/api/agents/*/trigger/*` to public paths |
| CREATE | `src/lib/webhooks/__tests__/verify.test.ts` | Signature verification tests |
| CREATE | `src/lib/webhooks/__tests__/execute.test.ts` | Webhook execution pipeline tests |

#### 1.6 Unit Tests

- Signature verification: valid, invalid, expired timestamp, missing headers
- Idempotency: duplicate key skips, unique key processes
- Rate limiting: per-webhook throttling
- Trigger endpoint: 200, 400, 404, 409, 429 responses
- Secret rotation: old secret rejected, new secret accepted
- Flow execution: webhook payload → flow variables mapping

---

### Sprint 2 — webhook_trigger Node + Flow Builder UI

**Goal:** Visual node in flow editor, payload mapping UI, auto-sync after deploy.

#### 2.1 Node Type

Add `webhook_trigger` to `NodeType` union in `src/types/index.ts`.

**Node data structure:**

```typescript
interface WebhookTriggerNodeData {
  // Display
  label: string;              // "GitHub Push", "Stripe Payment"
  description?: string;

  // Payload extraction
  bodyMappings: Array<{
    jsonPath: string;         // "$.repository.name" or "event.type"
    variableName: string;     // Flow variable to set
    type: "string" | "number" | "boolean" | "object";
    required: boolean;
  }>;

  headerMappings: Array<{
    headerName: string;       // "X-GitHub-Event"
    variableName: string;     // Flow variable to set
  }>;

  // Output
  outputVariable: string;     // Default: "webhook_payload" (raw body)
}
```

#### 2.2 Handler Implementation

**New file:** `src/lib/runtime/handlers/webhook-trigger-handler.ts`

Pattern: follows `schedule-trigger-handler.ts` (entry-point, sets variables, passes through)

```typescript
// 1. Read node.data for bodyMappings, headerMappings
// 2. Extract values from context.variables.__webhook_payload (set by trigger endpoint)
// 3. Apply JSONPath mappings → set flow variables
// 4. Set metadata: __webhook_id, __webhook_event_type, __webhook_timestamp
// 5. Return ExecutionResult with updatedVariables
```

#### 2.3 Flow Builder UI

| Component | Changes |
|-----------|---------|
| `node-picker.tsx` | Add "Webhook Trigger" to Triggers category |
| `property-panel.tsx` | Add webhook_trigger editor: name, body mappings, header mappings |
| `nodes/webhook-trigger-node.tsx` | Display component (webhook icon, name, mapping count) |
| `flow-builder.tsx` | Show generated webhook URL when webhook_trigger node is selected |

#### 2.4 Auto-Sync After Deploy

Similar to `scheduler/sync.ts` — scan flow for `webhook_trigger` nodes and upsert matching
`WebhookConfig` records:

**New file:** `src/lib/webhooks/sync.ts`

```typescript
// 1. Find all webhook_trigger nodes in deployed flow
// 2. For each node: upsert WebhookConfig (match by nodeId)
// 3. Disable orphaned configs (node was removed)
// 4. Called from deploy pipeline (after VersionService.deployVersion)
```

#### 2.5 Files to Create/Modify

| Action | File | Description |
|--------|------|-------------|
| MODIFY | `src/types/index.ts` | Add `webhook_trigger` to NodeType |
| CREATE | `src/lib/runtime/handlers/webhook-trigger-handler.ts` | Entry-point handler |
| MODIFY | `src/lib/runtime/handlers/index.ts` | Register webhook_trigger handler |
| CREATE | `src/components/builder/nodes/webhook-trigger-node.tsx` | Display component |
| MODIFY | `src/components/builder/node-picker.tsx` | Add to Triggers category |
| MODIFY | `src/components/builder/property-panel.tsx` | Payload mapping editor |
| CREATE | `src/lib/webhooks/sync.ts` | Auto-sync webhook configs after deploy |
| MODIFY | deploy pipeline | Call `syncWebhookConfigs()` after deploy |
| CREATE | `src/lib/runtime/handlers/__tests__/webhook-trigger-handler.test.ts` | Handler tests |
| CREATE | `src/lib/webhooks/__tests__/sync.test.ts` | Sync tests |

---

### Sprint 3 — Dashboard UI + Management Page

**Goal:** Webhook management page, execution history, testing tools.

#### 3.1 Webhook Management Page

**New route:** `/webhooks/[agentId]/page.tsx`

**UI Components:**

| Section | Content |
|---------|---------|
| **Webhook List** | Table: name, URL (copyable), status (enabled/disabled), trigger count, last triggered |
| **Webhook Detail** | Name, description, created date, webhook URL, secret (masked, reveal button) |
| **Execution History** | Table: timestamp, status, event type, duration, source IP, conversation link |
| **Test Panel** | Send test webhook with sample payload, see result in real-time |
| **Secret Management** | Rotate secret button with confirmation dialog |
| **Payload Mapping** | Visual editor: JSON path → flow variable mapping |

#### 3.2 Dashboard Integration

- Agent card: webhook count badge (like conversation/source counts)
- Agent detail: "Webhooks" tab or sidebar link
- Quick actions: copy webhook URL, enable/disable toggle

#### 3.3 Test Webhook Tool

```typescript
// UI sends test request to trigger endpoint with sample payload
// Shows: request headers, response status, execution result
// Helps users validate their webhook configuration before connecting external systems
```

#### 3.4 Files to Create

| Action | File | Description |
|--------|------|-------------|
| CREATE | `src/app/webhooks/[agentId]/page.tsx` | Webhook management page |
| CREATE | `src/components/webhooks/webhook-list.tsx` | Webhook configs list |
| CREATE | `src/components/webhooks/webhook-detail.tsx` | Webhook detail + executions |
| CREATE | `src/components/webhooks/webhook-test.tsx` | Test panel |
| CREATE | `src/components/webhooks/payload-mapper.tsx` | Visual JSON path → variable mapper |
| MODIFY | `src/app/page.tsx` | Add webhook count to agent cards |

---

### Sprint 4 — Provider Presets + Advanced Features

**Goal:** One-click setup for common providers, advanced event filtering.

#### 4.1 Provider Presets

Pre-configured templates for popular webhook sources:

| Provider | Headers to Verify | Signature Method | Event Type Header | Body Mapping |
|----------|-------------------|------------------|-------------------|--------------|
| **GitHub** | `X-Hub-Signature-256` | HMAC-SHA256(secret, body) | `X-GitHub-Event` | `$.action`, `$.repository.full_name` |
| **Stripe** | `Stripe-Signature` | `t=timestamp,v1=hmac` | `$.type` | `$.data.object`, `$.type` |
| **Slack** | `X-Slack-Signature` | `v0:timestamp:body` | `$.event.type` | `$.event.text`, `$.event.user` |
| **Generic** | `x-webhook-signature` | Standard Webhooks | Custom | Custom |

**Implementation:** Provider-specific verification functions in `src/lib/webhooks/providers/`:

```
src/lib/webhooks/providers/
  github.ts       ← GitHub signature verification + event type extraction
  stripe.ts       ← Stripe signature verification + event type extraction
  slack.ts        ← Slack signature verification + challenge response
  generic.ts      ← Standard Webhooks (default)
```

#### 4.2 Event Filtering

```typescript
interface EventFilter {
  field: string;        // "$.action", "X-GitHub-Event"
  operator: "equals" | "contains" | "regex" | "exists";
  value: string;        // "opened", "push", "payment_intent\\..*"
}
```

Webhook config stores `filters: EventFilter[]`. Trigger endpoint evaluates filters
**before** executing the flow — skip if no filter matches.

#### 4.3 Slack Challenge Response

Slack sends a `url_verification` challenge on setup. The trigger endpoint should detect
`{ type: "url_verification", challenge: "xxx" }` and respond with `{ challenge: "xxx" }`
without executing the flow.

#### 4.4 Files to Create

| Action | File | Description |
|--------|------|-------------|
| CREATE | `src/lib/webhooks/providers/github.ts` | GitHub-specific verification |
| CREATE | `src/lib/webhooks/providers/stripe.ts` | Stripe-specific verification |
| CREATE | `src/lib/webhooks/providers/slack.ts` | Slack verification + challenge |
| CREATE | `src/lib/webhooks/providers/generic.ts` | Standard Webhooks (default) |
| CREATE | `src/lib/webhooks/providers/index.ts` | Provider registry |
| MODIFY | `WebhookConfig` model | Add `provider`, `filters` fields |
| MODIFY | Trigger endpoint | Provider routing, filter evaluation |
| CREATE | Provider tests | Per-provider verification tests |

---

## Security Checklist

- [ ] HMAC-SHA256 signature verification with `crypto.timingSafeEqual`
- [ ] Raw body preserved before JSON parsing (critical for signature verification)
- [ ] Timestamp validation: 5-minute window, reject stale requests
- [ ] Idempotency: unique constraint on `WebhookExecution.idempotencyKey`
- [ ] Rate limiting: per-webhook, configurable (default 60/min)
- [ ] Secret generation: `crypto.randomBytes(32).toString('base64url')`
- [ ] Secret rotation: new secret + 24h grace period for old secret
- [ ] HTTPS only (enforced by Vercel)
- [ ] No secret in URL (secret only in signed headers)
- [ ] Input validation: Zod schemas on all API inputs
- [ ] Body size limit: 1 MB (existing `parseBodyWithLimit`)
- [ ] Execution timeout: 180s (matches streaming engine)
- [ ] Logging: all trigger attempts logged (success + failure)
- [ ] Monitoring: failed signature count, execution latency, error rates

---

## Database Migration Plan

1. Add `WebhookConfig` model with relation to `Agent` (cascade delete)
2. Add `WebhookExecution` model with relation to `WebhookConfig` (cascade delete)
3. Add `WebhookExecutionStatus` enum
4. Add `WebhookConfig[]` relation to `Agent` model
5. Run `pnpm db:push` to sync schema
6. Run `pnpm db:generate` to regenerate Prisma Client

---

## Test Plan

### Unit Tests

| Module | Test Count (est.) | Coverage |
|--------|-------------------|----------|
| `verify.ts` | 15 | Valid/invalid sig, expired timestamp, missing headers, timing-safe |
| `execute.ts` | 12 | Payload mapping, flow execution, error handling, idempotency |
| `sync.ts` | 8 | Node sync, orphan detection, upsert logic |
| `webhook-trigger-handler.ts` | 10 | Variable extraction, JSONPath, metadata injection |
| `providers/*.ts` | 20 | Per-provider verification (GitHub, Stripe, Slack, generic) |
| API routes | 15 | CRUD operations, auth guards, validation |
| Trigger endpoint | 12 | 200/400/404/409/429 responses, flow execution |
| **Total** | **~92** | |

### E2E Tests

| Scenario | Steps |
|----------|-------|
| Create webhook + trigger | Create agent → deploy flow → create webhook → POST trigger → verify execution |
| Idempotency | POST same x-webhook-id twice → second returns 409 |
| Invalid signature | POST with wrong signature → returns 400 |
| Rate limiting | POST 61 times in 1 minute → 61st returns 429 |
| Provider presets | Create GitHub webhook → POST with GitHub signature → verify |

---

## Priority & Effort

| Sprint | Priority | Effort | Dependencies |
|--------|----------|--------|--------------|
| Sprint 1 | P0 — Core | 3-4 days | None |
| Sprint 2 | P0 — Core | 2-3 days | Sprint 1 |
| Sprint 3 | P1 — Important | 2-3 days | Sprint 2 |
| Sprint 4 | P2 — Nice to have | 2-3 days | Sprint 1 |

**Total: ~10-13 days**

Sprint 1 + 2 together deliver the full feature. Sprint 3 adds management UI. Sprint 4 adds polish.

---

## CLAUDE.md Updates Required After Implementation

1. **Section 1 (Overview):** Add "inbound webhooks (trigger flows from Slack, GitHub, Stripe)"
2. **Section 4 (Prisma Models):** Add WebhookConfig, WebhookExecution models
3. **Section 5 (API Routes):** Add webhook CRUD + trigger routes
4. **Section 6 (Key Conventions):** Add "### Inbound Webhooks" section
5. **Section 6 (Security Hardening):** Add webhook signature verification
6. **Folder Structure:** Add `src/lib/webhooks/`, handler, API routes
7. **docs/:** Create `14-inbound-webhooks.md` guide
