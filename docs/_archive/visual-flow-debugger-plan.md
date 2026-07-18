# Visual Flow Debugger — Implementation Plan

## Problem Statement

When an agent flow fails, developers currently have no visual way to see which node failed, what data went in, and what came out. They rely on Railway logs or Grafana/OpenTelemetry traces — a painful, disconnected experience. Competitors like Dify 1.5.0, LangSmith, and Arize Phoenix offer visual trace UIs that Agent Studio lacks.

## Strategic Positioning

Agent Studio's unique advantage: **visual flow editor + eval framework + MCP/A2A** in one tool. No competitor has all three. Adding visual debugging directly into the XyFlow editor creates a differentiated experience that no other tool offers — debugging happens on the same canvas where you build.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Flow Builder (XyFlow)                      │
│                                                               │
│   ┌──────┐    ┌──────┐    ┌──────┐    ┌──────┐              │
│   │ MSG  │───▶│  AI  │───▶│ MCP  │───▶│ END  │              │
│   │  ✅  │    │  🔄  │    │  ❌  │    │  ⬜  │              │
│   │ 12ms │    │ 1.2s │    │ FAIL │    │  --  │              │
│   └──────┘    └──────┘    └──────┘    └──────┘              │
│                                                               │
│   [Debug Panel - right sidebar]                              │
│   ├── Node: mcp_tool "fetch_data"                           │
│   ├── Status: FAILED                                         │
│   ├── Duration: 3,412ms                                      │
│   ├── Input:  { "url": "https://..." }                      │
│   ├── Output: Error: Connection timeout                      │
│   ├── Variables: { last_message: "...", ... }               │
│   └── [Retry] [Skip] [Edit & Retry]                        │
└─────────────────────────────────────────────────────────────┘
```

## Core Concept: Debug Mode

The flow editor gets a **"Debug" toggle** button (next to existing Save, MCP, Version buttons). When activated:

1. A test message input appears at the bottom
2. Flow executes with **debug-enriched streaming** — each node emits trace events
3. Nodes on the canvas update in real-time with status overlays (pending → running → success/failed)
4. Clicking any executed node opens the **Debug Panel** showing full I/O, timing, and variables
5. Edges animate to show execution path (green = taken, gray = skipped)

---

## Implementation Phases

### Phase 1: Debug Stream Protocol (Backend)

**Goal:** Extend the NDJSON stream to emit node-level debug events without breaking existing chat.

**New StreamChunk types:**

```typescript
// Add to src/lib/runtime/types.ts
export type StreamChunk =
  | { type: "message"; role: "assistant" | "system"; content: string }
  | { type: "stream_start" }
  | { type: "stream_delta"; content: string }
  | { type: "stream_end"; content: string }
  | { type: "done"; conversationId: string; waitForInput: boolean }
  | { type: "error"; content: string }
  | { type: "heartbeat" }
  // NEW — Debug trace events
  | { type: "debug_node_start"; nodeId: string; nodeType: string; nodeName: string; timestamp: number }
  | { type: "debug_node_end"; nodeId: string; status: "success" | "error" | "skipped"; durationMs: number; output: unknown; error?: string }
  | { type: "debug_node_input"; nodeId: string; input: unknown; variables: Record<string, unknown> }
  | { type: "debug_edge_taken"; edgeId: string; sourceNodeId: string; targetNodeId: string }
  | { type: "debug_flow_summary"; totalDurationMs: number; nodesExecuted: number; nodesFailed: number; path: string[] };
```

**Engine changes (`engine-streaming.ts`):**

The execution loop already visits each node sequentially. Insert debug emissions at 3 points:

```
BEFORE handler:  emit debug_node_start + debug_node_input
AFTER handler:   emit debug_node_end (with status, duration, output)
ON edge follow:  emit debug_edge_taken
ON flow end:     emit debug_flow_summary
```

**Key principle:** Debug chunks are ONLY emitted when `{ stream: true, debug: true }` is in the request body. Normal chat is completely unaffected.

**Files to modify:**
- `src/lib/runtime/types.ts` — add debug StreamChunk variants
- `src/lib/runtime/engine-streaming.ts` — emit debug events in the execution loop
- `src/lib/runtime/stream-protocol.ts` — no changes needed (already handles any StreamChunk)
- `src/app/api/agents/[agentId]/chat/route.ts` — pass `debug` flag from request body

**Estimated effort:** 2-3 days

---

### Phase 2: Debug Overlay on Flow Editor (Frontend)

**Goal:** Real-time node status visualization on the XyFlow canvas.

**New state in FlowBuilder:**

```typescript
interface DebugState {
  isDebugMode: boolean;
  isRunning: boolean;
  nodeStates: Map<string, NodeDebugState>;
  edgeStates: Map<string, "taken" | "skipped">;
  selectedTraceNodeId: string | null;
  executionPath: string[];
  flowSummary: DebugFlowSummary | null;
}

interface NodeDebugState {
  status: "pending" | "running" | "success" | "error" | "skipped";
  durationMs?: number;
  input?: unknown;
  output?: unknown;
  variables?: Record<string, unknown>;
  error?: string;
  startedAt?: number;
}
```

**Visual design for node overlays:**

Each node component gets a debug wrapper that renders:
- **Status badge** (top-right corner): ✅ success (green), ❌ error (red), 🔄 running (blue pulse), ⬜ pending (gray), ⏭️ skipped (dim)
- **Duration label** (bottom): "1.2s" or "12ms"
- **Border glow**: green pulse while running, red glow on error, green solid on success
- **Edge animation**: green flow animation on taken edges, gray dashed on skipped

**New components:**
- `src/components/builder/debug-toolbar.tsx` — Debug mode toggle, test input, Run/Stop buttons, clear results
- `src/components/builder/debug-panel.tsx` — Right sidebar showing selected node's full trace (input, output, variables, timing)
- `src/components/builder/debug-node-overlay.tsx` — HOC wrapping each node with debug badges
- `src/components/builder/debug-edge.tsx` — Custom animated edge for debug mode

**Integration with FlowBuilder:**

```
[Debug ▶] button in toolbar
  → activates debug mode
  → shows test input field at bottom
  → user types message, clicks "Run"
  → POST /api/agents/[agentId]/chat { stream: true, debug: true, message: "..." }
  → parse NDJSON stream
  → on debug_node_start → update nodeStates map → node re-renders with "running" overlay
  → on debug_node_end → update with status/duration → node shows ✅ or ❌
  → on debug_edge_taken → animate edge green
  → on done → show flow summary
  → click any node → Debug Panel opens with full I/O
```

**Estimated effort:** 5-7 days

---

### Phase 3: Debug Panel — Deep Inspection (Frontend)

**Goal:** Detailed node inspection panel (right sidebar, replaces property panel in debug mode).

**Debug Panel sections:**

```
┌─────────────────────────────────┐
│ 🔍 Debug: ai_response           │
│ "Generate Summary"               │
├─────────────────────────────────┤
│ Status: ✅ Success               │
│ Duration: 1,247ms                │
│ Tokens: 342 in / 128 out        │
├─────────────────────────────────┤
│ ▼ Input                         │
│ ┌─────────────────────────────┐ │
│ │ {                           │ │
│ │   "last_message": "Hello",  │ │
│ │   "system_prompt": "You..." │ │
│ │ }                           │ │
│ └─────────────────────────────┘ │
├─────────────────────────────────┤
│ ▼ Output                        │
│ ┌─────────────────────────────┐ │
│ │ "Here is your summary..."   │ │
│ └─────────────────────────────┘ │
├─────────────────────────────────┤
│ ▼ Variables (after execution)   │
│ ┌─────────────────────────────┐ │
│ │ last_message: "Hello"       │ │
│ │ ai_result: "Here is..."     │ │
│ │ conversation_id: "abc123"   │ │
│ └─────────────────────────────┘ │
├─────────────────────────────────┤
│ ▼ MCP Tools Called              │
│ • fetch_weather: 234ms ✅       │
│ • search_kb: 89ms ✅            │
├─────────────────────────────────┤
│ [🔄 Retry from here]           │
│ [📋 Copy trace JSON]           │
└─────────────────────────────────┘
```

**Features:**
- Collapsible sections for input/output/variables/tools
- JSON syntax highlighting with copy button
- "Retry from here" — re-executes flow starting from selected node
- "Copy trace JSON" — exports full trace for sharing/bug reports
- Diff view between variables before and after node execution

**Estimated effort:** 3-4 days

---

### Phase 4: Execution Timeline (Frontend)

**Goal:** Waterfall timeline showing all nodes in execution order with timing bars.

**Placement:** Bottom panel (like browser DevTools), toggleable.

```
┌──────────────────────────────────────────────────────────────┐
│ Execution Timeline                           Total: 3.4s     │
├──────────────────────────────────────────────────────────────┤
│ message "Welcome"        ██ 12ms                             │
│ ai_response "Classify"   ████████████████ 1,247ms            │
│   └─ tool: search_kb     ████ 234ms                          │
│   └─ tool: fetch_weather ██ 89ms                             │
│ condition "Route"        █ 2ms                                │
│ mcp_tool "fetch_data"    ██████████████████████ 2,100ms  ❌  │
│ end                      -- (not reached)                     │
├──────────────────────────────────────────────────────────────┤
│ 0ms        500ms       1s         1.5s       2s       3.4s   │
└──────────────────────────────────────────────────────────────┘
```

**Features:**
- Horizontal bar chart (waterfall style like Chrome DevTools Network tab)
- Color-coded: green = success, red = error, blue = AI/streaming, purple = MCP tool
- Nested tool calls shown indented under their parent AI node
- Click any bar → selects that node on canvas + opens Debug Panel
- Zoom/pan for long execution chains

**New component:** `src/components/builder/debug-timeline.tsx`

**Estimated effort:** 3-4 days

---

### Phase 5: Trace Persistence & History (Backend + Frontend)

**Goal:** Save debug traces to database for later review, comparison, and sharing.

**New Prisma model:**

```prisma
model FlowTrace {
  id            String   @id @default(cuid())
  agentId       String
  agent         Agent    @relation(fields: [agentId], references: [id], onDelete: Cascade)
  conversationId String?
  testInput     String?  @db.Text
  status        TraceStatus @default(RUNNING)
  totalDurationMs Int?
  nodesExecuted Int?
  nodesFailed   Int?
  executionPath String[]       // ordered node IDs
  nodeTraces    Json           // Map<nodeId, NodeDebugState>
  edgeTraces    Json           // Map<edgeId, "taken" | "skipped">
  flowSummary   Json?
  createdAt     DateTime @default(now())

  @@index([agentId, createdAt])
}

enum TraceStatus {
  RUNNING
  COMPLETED
  FAILED
}
```

**Features:**
- Auto-save every debug run
- Trace history list in Debug toolbar (last 20 runs)
- Click past trace → replay visualization on canvas (no re-execution)
- Compare two traces side-by-side (diff which nodes changed status)
- Share trace via URL: `/builder/[agentId]/trace/[traceId]`

**API routes:**
- `GET /api/agents/[agentId]/traces` — list traces (paginated)
- `GET /api/agents/[agentId]/traces/[traceId]` — get single trace
- `DELETE /api/agents/[agentId]/traces/[traceId]` — delete trace

**Estimated effort:** 3-4 days

---

### Phase 6: Breakpoints & Step-by-Step Execution

**Goal:** Pause execution at specific nodes, inspect state, then continue — like a real debugger.

**How it works:**
1. In debug mode, user clicks a node and toggles "Breakpoint" (red dot appears)
2. Breakpoint node IDs are sent with the debug request: `{ debug: true, breakpoints: ["node_3", "node_7"] }`
3. Engine pauses before executing a breakpoint node and emits: `{ type: "debug_breakpoint_hit", nodeId: "node_3" }`
4. Frontend shows "Paused at node_3" with buttons: **[Continue ▶]** **[Step Over ⏭]** **[Stop ⏹]**
5. User clicks Continue → sends a resume signal → engine continues
6. Step Over → executes just the current node, then pauses again

**Implementation approach:**
- Use Server-Sent Events or a WebSocket for bidirectional debug control (stream is one-way)
- Alternative: Use a "debug session" stored in Redis, where frontend POSTs commands to `/api/agents/[agentId]/debug/[sessionId]/continue`

**New backend components:**
- `src/lib/runtime/debug-session.ts` — manages debug state, breakpoints, pause/resume via Redis
- `src/app/api/agents/[agentId]/debug/route.ts` — start debug session
- `src/app/api/agents/[agentId]/debug/[sessionId]/control/route.ts` — continue/step/stop

**Estimated effort:** 5-7 days

---

### Phase 7: Variable Watch & Live Edit

**Goal:** Monitor and modify variables during execution (like Dify's variable modification feature).

**Features:**
- **Variable Watch panel:** shows all runtime variables, updates in real-time as each node executes
- **Live edit:** while paused at breakpoint, user can modify variable values before continuing
- **Variable diff:** highlight which variables changed at each node (green = new, yellow = modified, red = deleted)

**Placement:** Tab in the Debug Panel alongside Input/Output.

**Estimated effort:** 2-3 days (builds on Phase 3 + 6 infrastructure)

---

## Total Estimated Timeline

| Phase | What | Effort | Dependencies |
|-------|------|--------|--------------|
| **Phase 1** | Debug Stream Protocol | 2-3 days | None |
| **Phase 2** | Debug Overlay on Canvas | 5-7 days | Phase 1 |
| **Phase 3** | Debug Panel (Deep Inspection) | 3-4 days | Phase 2 |
| **Phase 4** | Execution Timeline | 3-4 days | Phase 1 |
| **Phase 5** | Trace Persistence & History | 3-4 days | Phase 1-3 |
| **Phase 6** | Breakpoints & Step-by-Step | 5-7 days | Phase 1-3 |
| **Phase 7** | Variable Watch & Live Edit | 2-3 days | Phase 6 |

**Total: 23-32 days** (solo developer) → ~4-5 weeks

**MVP (Phases 1-3): 10-14 days** — gives you real-time node status + deep inspection. Already better than most competitors.

---

## What Makes This Unique vs Competitors

| Feature | Dify | LangSmith | Langfuse | Agent Studio (planned) |
|---------|------|-----------|----------|----------------------|
| Visual debugging ON the flow canvas | ❌ (separate panel) | ❌ (separate UI) | ❌ (separate UI) | ✅ Same canvas |
| Real-time node status overlay | ✅ | ❌ | ❌ | ✅ |
| Breakpoints | ❌ | ❌ | ❌ | ✅ |
| Variable live edit | ✅ (partial) | ❌ | ❌ | ✅ |
| Execution timeline | ❌ | ✅ | ✅ | ✅ |
| Integrated with eval framework | ❌ | ✅ (separate) | ✅ (separate) | ✅ Same tool |
| Trace history & replay | ❌ | ✅ | ✅ | ✅ |
| Shares canvas with builder | ❌ | N/A | N/A | ✅ |

**Agent Studio's differentiator: debug WHERE you build.** No context switching between builder, debugger, and eval tools.

---

## Critical Implementation Notes (from deep analysis)

### Note 1: Three Separate Codepaths in Streaming Engine

`engine-streaming.ts` has 3 separate execution paths that ALL need debug instrumentation:

```
Line 124: if (node.type === "ai_response") → aiResponseStreamingHandler()
Line 142: } else if (node.type === "parallel") → parallelStreamingHandler()
Line 158: } else { → getHandler(node.type) — standard registry
```

Debug events must be emitted at ALL THREE paths. Missing one means AI or parallel nodes have no debug info.

### Note 2: AI Response Has Nested Tool Calls

`aiResponseStreamingHandler` runs up to 20 tool call steps (MCP + agent tools). Each tool call needs its own nested debug event:

```typescript
| { type: "debug_tool_start"; nodeId: string; toolName: string; timestamp: number }
| { type: "debug_tool_end"; nodeId: string; toolName: string; durationMs: number; status: "success" | "error"; result?: unknown }
```

These appear as children of the AI node in the Debug Panel and Timeline.

### Note 3: Non-Streaming Engine Must Support Debug

The `executeFlow()` synchronous engine is used by:
- Eval runner (`stream: false, isEval: true`)
- Embed widget (optional non-streaming)
- Debug should work here too

Solution: `executeFlow()` returns an additional `trace` object alongside messages:

```typescript
interface FlowExecutionResult {
  messages: OutputMessage[];
  waitingForInput: boolean;
  trace?: FlowTrace; // only when debug: true
}
```

### Note 4: Parallel Branch Visualization

`parallelStreamingHandler` executes up to 5 branches, each with up to 25 iterations. Debug overlay must:
- Color the entire branch path (all nodes in a branch), not just the parallel node
- Show per-branch status: "Branch A: ✅ 1.2s, Branch B: ❌ timeout"
- Emit branch-level debug events:

```typescript
| { type: "debug_branch_start"; nodeId: string; branchId: string; label?: string }
| { type: "debug_branch_end"; nodeId: string; branchId: string; status: "success" | "error"; durationMs: number }
```

### Note 5: Loop Node Multi-Execution

Loop nodes iterate up to 100 times, re-executing child nodes. `NodeDebugState` must be an ARRAY of executions:

```typescript
interface NodeDebugState {
  executions: NodeExecution[]; // one per visit
  aggregateStatus: "success" | "error" | "running" | "pending";
  totalDurationMs: number;
}

interface NodeExecution {
  iteration: number;
  status: "success" | "error" | "skipped";
  durationMs: number;
  input?: unknown;
  output?: unknown;
  variables?: Record<string, unknown>;
  error?: string;
  timestamp: number;
}
```

Timeline shows each iteration expandable.

### Note 6: OpenTelemetry Integration

Existing `src/lib/observability/tracer.ts` already creates OTEL spans with traceId/spanId. Debug traces MUST share the same traceId so users can cross-reference in Grafana:

```typescript
// In debug_flow_summary:
| { type: "debug_flow_summary"; totalDurationMs: number; nodesExecuted: number; nodesFailed: number; path: string[]; traceId: string }
```

FlowTrace model also stores `otelTraceId String?` for linking.

### Note 7: waitForInput Nodes (Multi-Turn Debug)

Nodes like `capture`, `button`, and `human_approval` return `waitForInput: true`, pausing the flow. Debug session must:
- Persist current debug state (nodeStates, edgeStates) when flow pauses
- Resume debug overlay when user provides input and flow continues
- Show "Waiting for input" status on the paused node
- Accumulate debug data across multiple turns into one trace

### Note 8: Security — Debug Data Sanitization

Debug events expose internal state (variables, prompts, API responses). Must:
- Only allow debug mode for authenticated agent owners (use `requireAgentOwner()`)
- Cap `input`/`output` fields to 10KB in stream events (full data in DB trace)
- Strip sensitive env variables and API keys from variable snapshots
- Never expose debug endpoints publicly (embed widget must NOT have debug access)

---

## Technical Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Debug events bloat stream bandwidth | Performance degradation | Only emit when `debug: true`; cap output/input to 10KB in stream, full data in trace DB |
| Breakpoints require bidirectional communication | Complex architecture | Start with Redis-based polling (Phase 6); upgrade to WebSocket later if needed |
| Large variable state in debug panel | UI freezes | Virtualized JSON viewer; lazy-load deep objects; pagination for arrays |
| Concurrent debug sessions with 2 replicas | State inconsistency | Redis-backed debug sessions (already have Redis) |
| XyFlow performance with 500 animated nodes | Canvas lag | Batch visual updates; debounce state changes; only animate visible viewport |
| 3 separate codepaths in engine | Missed debug events | Wrap all 3 paths with shared `debugEmit()` helper; test coverage for each path |
| Loop nodes with 100 iterations | UI overload | Collapse iterations by default; show summary; expand on click |
| waitForInput mid-debug | Lost debug state | Persist to Redis/DB; resume on next turn |
| Sensitive data in debug output | Security risk | Sanitize variables; auth-guard debug endpoints; cap payload sizes |
