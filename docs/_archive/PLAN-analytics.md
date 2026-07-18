# PLAN: Basic Agent Analytics

## Current State Summary

| Data Point | Already Available | Source |
|-----------|-------------------|--------|
| Conversations per agent | Yes | `Conversation` model has `agentId`, `createdAt` |
| Messages per conversation | Yes | `Message` model with `conversationId` |
| First user message | Yes | First `Message` where `role=USER` per conversation |
| Agent response time | **No** | Not tracked — need to measure time between user message and assistant response |
| KB search hit rate | **No** | KB search handler doesn't log results |

**Key insight:** Most metrics are derivable from existing data via SQL aggregations. We only need a lightweight `AnalyticsEvent` table for time-series events that can't be derived (response time, KB hit/miss).

---

## Schema Changes

### New Model: `AnalyticsEvent`

**File: `prisma/schema.prisma`**

```prisma
enum AnalyticsEventType {
  CHAT_RESPONSE
  KB_SEARCH
}

model AnalyticsEvent {
  id        String             @id @default(cuid())
  type      AnalyticsEventType
  agentId   String
  agent     Agent              @relation(fields: [agentId], references: [id], onDelete: Cascade)
  metadata  Json               @default("{}")
  createdAt DateTime           @default(now())

  @@index([agentId])
  @@index([type, createdAt])
  @@index([createdAt])
}
```

Add to Agent model:
```prisma
model Agent {
  // ... existing fields
  analyticsEvents AnalyticsEvent[]
}
```

**Metadata schemas by event type:**

- `CHAT_RESPONSE`: `{ responseTimeMs: number, conversationId: string, isNewConversation: boolean }`
- `KB_SEARCH`: `{ query: string, resultCount: number, topScore: number | null, conversationId: string }`

No changes to Conversation or Message models — they already have everything we need.

---

## Event Tracking

### 1. Chat Response Time

**File: `src/lib/runtime/context.ts`** — track whether conversation is new:

In `loadContext`, return a flag `isNewConversation` on the context. Add to `RuntimeContext` type:

```ts
interface RuntimeContext {
  // ... existing fields
  isNewConversation: boolean;
}
```

Set `isNewConversation: true` when creating a new conversation, `false` when loading existing.

**File: `src/lib/analytics.ts`** — new analytics helper module:

```ts
import { prisma } from "@/lib/prisma";

interface ChatResponseEvent {
  agentId: string;
  conversationId: string;
  responseTimeMs: number;
  isNewConversation: boolean;
}

interface KBSearchEvent {
  agentId: string;
  conversationId: string;
  query: string;
  resultCount: number;
  topScore: number | null;
}

export async function trackChatResponse(event: ChatResponseEvent): Promise<void> {
  await prisma.analyticsEvent.create({
    data: {
      type: "CHAT_RESPONSE",
      agentId: event.agentId,
      metadata: {
        responseTimeMs: event.responseTimeMs,
        conversationId: event.conversationId,
        isNewConversation: event.isNewConversation,
      },
    },
  });
}

export async function trackKBSearch(event: KBSearchEvent): Promise<void> {
  await prisma.analyticsEvent.create({
    data: {
      type: "KB_SEARCH",
      agentId: event.agentId,
      metadata: {
        query: event.query,
        resultCount: event.resultCount,
        topScore: event.topScore,
        conversationId: event.conversationId,
      },
    },
  });
}
```

**File: `src/app/api/agents/[agentId]/chat/route.ts`** — wrap execution with timing:

```ts
const startTime = Date.now();
// ... existing executeFlow / executeFlowStreaming call ...
const responseTimeMs = Date.now() - startTime;

// Fire-and-forget (don't block response)
trackChatResponse({
  agentId,
  conversationId: context.conversationId,
  responseTimeMs,
  isNewConversation: context.isNewConversation,
}).catch(() => {});
```

For streaming: track time at stream creation (not completion) since the first token is what matters for perceived latency.

### 2. KB Search Hit Rate

**File: `src/lib/runtime/handlers/kb-search-handler.ts`** — track after search:

```ts
import { trackKBSearch } from "@/lib/analytics";

// After hybridSearch + expandChunksWithContext:
trackKBSearch({
  agentId: context.agentId,
  conversationId: context.conversationId,
  query,
  resultCount: expanded.length,
  topScore: expanded.length > 0 ? expanded[0].relevanceScore : null,
}).catch(() => {});
```

All tracking calls are fire-and-forget with `.catch(() => {})` — analytics should never break the chat flow.

---

## Analytics API Route

**File: `src/app/api/analytics/route.ts`** — GET endpoint returning all dashboard data:

```ts
// Protected by auth (session check)
// Query params: ?period=30d (default 30d, options: 7d, 30d, 90d)

// Returns:
{
  success: true,
  data: {
    summary: {
      totalConversations: number,
      totalMessages: number,
      avgResponseTimeMs: number,
      kbSearchHitRate: number, // percentage 0-100
    },
    dailyConversations: Array<{ date: string, count: number }>,
    topAgents: Array<{ agentId: string, agentName: string, conversationCount: number, messageCount: number }>,
    commonFirstMessages: Array<{ message: string, count: number }>,
    avgResponseTimeByDay: Array<{ date: string, avgMs: number }>,
    kbSearchStats: {
      totalSearches: number,
      withResults: number,
      withoutResults: number,
    },
  }
}
```

**SQL queries (all run via Prisma `$queryRaw` for performance):**

1. **Daily conversations** — `GROUP BY DATE(createdAt)` on Conversation table
2. **Top agents** — `GROUP BY agentId` with JOIN to Agent for name, COUNT conversations + messages
3. **Common first messages** — Subquery: first USER message per conversation, then GROUP BY content, LIMIT 20
4. **Avg response time** — `AVG(metadata->>'responseTimeMs')` on AnalyticsEvent WHERE type=CHAT_RESPONSE, GROUP BY date
5. **KB search stats** — COUNT on AnalyticsEvent WHERE type=KB_SEARCH, split by metadata->>'resultCount' > 0

---

## Analytics Page

**File: `src/app/analytics/page.tsx`** — protected dashboard page

### Layout (4 sections):

```
┌─────────────────────────────────────────────────────┐
│  Analytics Dashboard         [7d] [30d] [90d]       │
├─────────┬───────────┬──────────────┬────────────────┤
│  Total  │  Total    │  Avg Response│  KB Search     │
│  Convos │  Messages │  Time        │  Hit Rate      │
│  1,234  │  8,901    │  1.2s        │  87%           │
├─────────┴───────────┴──────────────┴────────────────┤
│                                                     │
│  [Line Chart: Daily Conversations - last 30 days]   │
│                                                     │
├──────────────────────┬──────────────────────────────┤
│  Top Agents          │  Common Questions            │
│  1. Help Bot (456)   │  1. "pricing" (89)           │
│  2. Sales (321)      │  2. "how to setup" (67)      │
│  3. Support (198)    │  3. "what can you do" (45)   │
├──────────────────────┴──────────────────────────────┤
│                                                     │
│  [Line Chart: Avg Response Time by Day]             │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### Components:

1. **StatCard** — reusable card showing label + value + optional trend indicator
2. **ConversationsChart** — recharts `AreaChart` for daily conversation count
3. **ResponseTimeChart** — recharts `LineChart` for avg response time
4. **TopAgentsTable** — simple table with rank, name, conversation count, message count
5. **CommonQuestionsTable** — table of first messages with occurrence count (truncated to 80 chars)

### Data fetching:
- Use SWR hook: `useSWR('/api/analytics?period=30d')`
- Period selector updates the SWR key
- Loading skeleton while data loads

### Chart library:
- recharts is **NOT** currently installed — needs `pnpm add recharts`
- Only import: `AreaChart, Area, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer`

---

## Navigation

**File: `src/app/page.tsx`** — add "Analytics" link/button in dashboard header, next to existing controls.

---

## Implementation Order

| Step | Change | Files | Complexity |
|------|--------|-------|-----------|
| 1 | Prisma schema + migration | `schema.prisma` | Low |
| 2 | Analytics helper (`trackChatResponse`, `trackKBSearch`) | `src/lib/analytics.ts` | Low |
| 3 | `isNewConversation` flag on RuntimeContext | `context.ts`, `types.ts` | Trivial |
| 4 | Track chat response time in chat route | `chat/route.ts` | Low |
| 5 | Track KB search hits in handler | `kb-search-handler.ts` | Low |
| 6 | Analytics API route | `src/app/api/analytics/route.ts` | Medium — SQL queries |
| 7 | Install recharts | `package.json` | Trivial |
| 8 | Analytics page + components | `src/app/analytics/page.tsx` | Medium — charts + layout |
| 9 | Dashboard navigation link | `src/app/page.tsx` | Trivial |

## Verification

- [ ] `pnpm db:push` succeeds (schema sync)
- [ ] `pnpm typecheck` passes
- [ ] `pnpm lint` passes
- [ ] All existing tests pass
- [ ] New tests for `trackChatResponse` and `trackKBSearch` (mock prisma)
- [ ] `pnpm build` passes
- [ ] Manual test: send chat messages, verify AnalyticsEvent rows created in DB
- [ ] Manual test: analytics page loads with charts
- [ ] Manual test: period selector works (7d/30d/90d)
- [ ] Manual test: unauthenticated users redirected from /analytics
