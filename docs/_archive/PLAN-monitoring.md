# PLAN: Monitoring & Resilience

## Current State Summary

| Component | Status | Details |
|-----------|--------|---------|
| Health check | **Missing** | No `/api/health` endpoint. Vercel has no way to verify DB connectivity. |
| Error boundaries | **Partial** | `error.tsx` exists for builder, chat, knowledge routes. But no React ErrorBoundary around the flow canvas itself — a bad node component crashes the entire builder page. |
| Env validation | **Exists** | `src/lib/env.ts` has Zod schema + `validateEnv()`, but it's lazy (only runs when `getEnv()` is first called). Not called at startup. |
| Rate limiting | **Missing** | `/api/agents/[agentId]/chat` is public (no auth) and has no rate limiting. Open to abuse. |
| Error logging | **Unstructured** | 18 `console.error` / `console.warn` calls across the codebase. No agentId, userId, or request context. No log levels. |
| Error tracking | **None** | No Sentry, no external error tracking. |

---

## Improvement 1: Health Check Endpoint

### Problem
No way to verify the app is healthy after deployment. Vercel's health checks need a URL to hit. DB connectivity issues are only discovered when users hit them.

### Proposed Change

**New file: `src/app/api/health/route.ts`**

```ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const timestamp = new Date().toISOString();
  let dbStatus: "ok" | "fail" = "fail";

  try {
    await prisma.$queryRaw`SELECT 1`;
    dbStatus = "ok";
  } catch {
    // DB unreachable
  }

  const status = dbStatus === "ok" ? "healthy" : "degraded";
  const statusCode = dbStatus === "ok" ? 200 : 503;

  return NextResponse.json(
    {
      status,
      version: process.env.npm_package_version ?? "0.1.0",
      db: dbStatus,
      timestamp,
    },
    { status: statusCode }
  );
}
```

**File: `src/middleware.ts`** — add `/api/health` to public paths:

```ts
if (pathname === "/api/health") return true;
```

### Impact
- **Low complexity** — single file, one SQL query
- Vercel or any uptime monitor can poll `GET /api/health` every 60s
- Returns 503 if DB is down, 200 if healthy

---

## Improvement 2: Flow Canvas Error Boundary

### Problem
The `error.tsx` files catch errors at the route level (full page crash). But if a single custom node component throws during render (e.g., a malformed `data` field), React unmounts the **entire** builder page. The user loses unsaved work and can't interact with the editor.

### Current error boundary chain:
```
error.tsx (route-level) → catches page-level crashes
  └── FlowBuilder → NO boundary → crash takes down entire editor
        └── NodeComponent → throws → propagates up to error.tsx
```

### Proposed Change

**New file: `src/components/builder/flow-error-boundary.tsx`**

A React class component (ErrorBoundary must be a class) that wraps the ReactFlow canvas:

```tsx
"use client";

import { Component, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class FlowErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
          <AlertTriangle className="size-10 text-destructive" />
          <div>
            <p className="font-semibold">A node caused an error</p>
            <p className="text-sm text-muted-foreground mt-1">
              {this.state.error?.message ?? "Unknown error"}
            </p>
          </div>
          <Button onClick={() => this.setState({ hasError: false, error: null })}>
            Reload Canvas
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}
```

**File: `src/components/builder/flow-builder.tsx`** — wrap `<ReactFlow>` with `<FlowErrorBoundary>`:

```tsx
import { FlowErrorBoundary } from "./flow-error-boundary";

// In render:
<FlowErrorBoundary>
  <ReactFlow ... />
</FlowErrorBoundary>
```

### After fix:
```
error.tsx (route-level) → catches page crashes
  └── FlowBuilder
        └── FlowErrorBoundary → catches node render errors
              └── ReactFlow → NodeComponents
```

### Impact
- **Medium** — prevents entire page crashes from bad node data
- User can click "Reload Canvas" to recover without losing unsaved state in the property panel
- The sidebar, header, and node picker remain functional

---

## Improvement 3: Startup Environment Validation

### Problem
`validateEnv()` exists in `src/lib/env.ts` but is only called lazily when `getEnv()` is first invoked. If `OPENAI_API_KEY` is missing, the app starts fine and only fails when someone tries to use embeddings — producing a cryptic API error.

### Current state
`src/lib/env.ts` already has a full Zod schema. It just needs to be called at startup.

### Proposed Change

**File: `src/lib/env.ts`** — add instrumentation hook call:

No changes needed to env.ts itself.

**New file: `src/instrumentation.ts`** (Next.js instrumentation hook — runs once on server startup):

```ts
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { validateEnv } = await import("@/lib/env");
    validateEnv();
  }
}
```

This is the official Next.js way to run code at startup. It's already supported in Next.js 15 — just needs the file to exist at `src/instrumentation.ts`.

**File: `next.config.ts`** — enable instrumentation if not already:

Check current config. If `experimental.instrumentationHook` is not set, Next.js 15 enables it by default with `src/instrumentation.ts`.

### Impact
- **Trivial** — 1 new file, 5 lines
- App crashes immediately on startup with clear error if env vars are missing
- No more cryptic runtime errors minutes after deployment

---

## Improvement 4: Rate Limiting on Chat API

### Problem
`/api/agents/[agentId]/chat` is a public route (no auth required — needed for embed widget). Anyone can hammer it, running up AI API costs. No rate limiting exists.

### Proposed Change

**New file: `src/lib/rate-limit.ts`** — in-memory sliding window rate limiter:

```ts
interface RateLimitEntry {
  timestamps: number[];
}

const store = new Map<string, RateLimitEntry>();
const CLEANUP_INTERVAL_MS = 60_000;

const WINDOW_MS = 60_000;       // 1 minute window
const MAX_REQUESTS = 20;        // 20 requests per window

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
}

export function checkRateLimit(key: string): RateLimitResult {
  const now = Date.now();
  const entry = store.get(key) ?? { timestamps: [] };

  // Remove timestamps outside the window
  entry.timestamps = entry.timestamps.filter((t) => now - t < WINDOW_MS);

  if (entry.timestamps.length >= MAX_REQUESTS) {
    const oldestInWindow = entry.timestamps[0];
    const retryAfterMs = WINDOW_MS - (now - oldestInWindow);
    return { allowed: false, remaining: 0, retryAfterMs };
  }

  entry.timestamps.push(now);
  store.set(key, entry);

  return {
    allowed: true,
    remaining: MAX_REQUESTS - entry.timestamps.length,
    retryAfterMs: 0,
  };
}

// Periodic cleanup of stale entries
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
      entry.timestamps = entry.timestamps.filter((t) => now - t < WINDOW_MS);
      if (entry.timestamps.length === 0) store.delete(key);
    }
  }, CLEANUP_INTERVAL_MS);
}
```

**File: `src/app/api/agents/[agentId]/chat/route.ts`** — apply rate limit:

```ts
import { checkRateLimit } from "@/lib/rate-limit";

// At the start of POST handler:
const clientIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
  ?? request.headers.get("x-real-ip")
  ?? "unknown";
const rateKey = `chat:${clientIp}`;
const rateResult = checkRateLimit(rateKey);

if (!rateResult.allowed) {
  return NextResponse.json(
    { success: false, error: "Too many requests. Please try again later." },
    {
      status: 429,
      headers: {
        "Retry-After": String(Math.ceil(rateResult.retryAfterMs / 1000)),
        "X-RateLimit-Remaining": "0",
      },
    }
  );
}
```

### Impact
- **Low complexity** — in-memory Map, no external dependency
- 20 req/min per IP is generous for real users (avg chat is 2-3 msg/min), strict for bots
- Resets on Vercel cold starts (acceptable — in-memory is fine for basic protection)
- Headers tell clients when they can retry

### Limitations
- In-memory store doesn't share across Vercel serverless instances. This is acceptable for basic abuse prevention. For production-grade limiting, use Vercel KV or Upstash Redis (future improvement).

---

## Improvement 5: Structured Logger

### Problem
18 `console.error`/`console.warn` calls across the codebase with inconsistent formats. No context (which agent, which user, which request). Hard to search in Vercel logs.

### Proposed Change

**New file: `src/lib/logger.ts`**

```ts
type LogLevel = "info" | "warn" | "error";

interface LogContext {
  agentId?: string;
  conversationId?: string;
  userId?: string;
  [key: string]: unknown;
}

function formatLog(level: LogLevel, message: string, context?: LogContext): string {
  const entry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...context,
  };
  return JSON.stringify(entry);
}

export const logger = {
  info(message: string, context?: LogContext): void {
    // Use stdout for info (Vercel parses JSON logs)
    process.stdout.write(formatLog("info", message, context) + "\n");
  },
  warn(message: string, context?: LogContext): void {
    process.stdout.write(formatLog("warn", message, context) + "\n");
  },
  error(message: string, error?: unknown, context?: LogContext): void {
    const errorInfo = error instanceof Error
      ? { errorMessage: error.message, stack: error.stack }
      : error !== undefined
        ? { errorMessage: String(error) }
        : {};
    process.stdout.write(
      formatLog("error", message, { ...context, ...errorInfo }) + "\n"
    );
  },
};
```

**Replace `console.error` calls in these files:**

| File | Current | New |
|------|---------|-----|
| `kb-search-handler.ts` | `console.error("KB Search error:", error)` | `logger.error("KB Search failed", error, { agentId: context.agentId })` |
| `ingest.ts` | `console.error("Ingest error:", err)` | `logger.error("Source ingestion failed", err, { sourceId })` |
| `engine.ts` | `console.error(...)` | `logger.error("Node handler error", error, { agentId, nodeType })` |
| `ai-response-handler.ts` | `console.error("AI Response error:", error)` | `logger.error("AI response failed", error, { agentId })` |
| `api-call-handler.ts` | `console.error("API Call error:", error)` | `logger.error("API call failed", error, { agentId })` |
| `webhook-handler.ts` | `console.error("Webhook error:", error)` | `logger.error("Webhook failed", error, { agentId })` |
| `ai-classify-handler.ts` | `console.error(...)` | `logger.error("AI classify failed", error, { agentId })` |
| `ai-summarize-handler.ts` | `console.error(...)` | `logger.error("AI summarize failed", error, { agentId })` |
| `ai-extract-handler.ts` | `console.error(...)` (×2) | `logger.error(...)` with context |
| `function-handler.ts` | `console.error(...)` | `logger.error("Function execution failed", error, { agentId })` |
| `search.ts` | `console.error("Re-ranking failed...")` | `logger.warn("Re-ranking failed, using RRF order", { ... })` |
| `parsers.ts` | `console.error(...)` | `logger.error("URL fetch failed", error, { url })` |
| `sources/route.ts` | `console.error(...)` | `logger.error("Background ingest failed", err)` |
| `engine.ts` (warn) | `console.warn("Circular flow...")` | `logger.warn("Circular flow detected", { nodeId, agentId })` |
| `env.ts` | `console.error(...)`, `console.warn(...)` | Keep as-is — runs before logger is available |
| `error-display.tsx` | `console.error(error)` | Keep as-is — client-side component |

**Do NOT change:**
- `src/lib/env.ts` — runs at startup before logger module might be ready
- `src/components/ui/error-display.tsx` — client-side, `console.error` is correct

### Output format
Every log line is valid JSON, searchable in Vercel's log viewer:
```json
{"level":"error","message":"KB Search failed","timestamp":"2026-03-08T12:00:00Z","agentId":"abc","errorMessage":"Connection timeout","stack":"..."}
```

### Impact
- **Medium complexity** — 1 new file, ~15 file edits (mechanical replacements)
- Vercel's log viewer can filter by `level`, `agentId`, `message`
- No external dependency — uses `process.stdout.write` (Vercel recommended for structured logs)

---

## Implementation Order

| Step | Change | Files | Complexity |
|------|--------|-------|-----------|
| 1 | Health check endpoint | `api/health/route.ts`, `middleware.ts` | Trivial |
| 2 | Startup env validation | `src/instrumentation.ts` | Trivial |
| 3 | Structured logger | `src/lib/logger.ts` + 13 file edits | Medium (mechanical) |
| 4 | Rate limiting | `src/lib/rate-limit.ts`, `chat/route.ts` | Low |
| 5 | Flow canvas error boundary | `flow-error-boundary.tsx`, `flow-builder.tsx` | Low |

## Verification

- [ ] `pnpm typecheck` passes
- [ ] `pnpm lint` passes
- [ ] All existing tests pass
- [ ] New tests for `checkRateLimit` function
- [ ] New tests for `logger` (output format)
- [ ] New test for health endpoint (mock prisma)
- [ ] `pnpm build` passes
- [ ] Manual test: `GET /api/health` returns 200 with DB status
- [ ] Manual test: remove an env var, app fails on startup with clear message
- [ ] Manual test: send 21 rapid chat messages, get 429 on 21st
- [ ] Manual test: break a node component, canvas shows error boundary (not full page crash)
- [ ] Manual test: Vercel logs show structured JSON entries
