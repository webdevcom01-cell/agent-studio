# TASKS — Agent Studio OpenClaw-Inspired Upgrade Plan

> Generated: 2026-04-03
> Source: Deep analysis of claw-code, oh-my-codex (OMX), oh-my-claudecode (OMC), clawhip, memsearch, bb25
> Status legend: `[ ]` pending, `[~]` in progress, `[x]` done, `[!]` blocked

---

## FAZA A — Runtime Engine Hooks (P0 — Highest Impact)

These address the most critical architectural gaps in the runtime engine.
Inspired by: claw-code hook DAG, OMC 11 lifecycle events, clawhip event pipeline.

### A1. Lifecycle Hook System

> **Gap**: `engine.ts` and `engine-streaming.ts` have only 2 audit log points
> (FLOW_EXECUTION_START, FLOW_EXECUTION_END). No per-node or per-tool hooks exist.
> OMC has 11 lifecycle hooks; claw-code has a full DAG-based hook pipeline.

**Current state** (verified in code):
- `engine.ts` line 140-146: `FLOW_EXECUTION_START` audit log
- `engine.ts` line 244-254: `FLOW_EXECUTION_END` audit log
- No events emitted between nodes, before/after tool calls, or on errors

**Tasks:**

- [ ] A1.1 — Define `FlowHookEvent` type with 7 events:
  - `onFlowStart` — before first node executes
  - `onFlowComplete` — after last node or end node
  - `onFlowError` — on unrecoverable flow error
  - `beforeNodeExecute` — before each handler runs (includes nodeId, nodeType, input variables)
  - `afterNodeExecute` — after each handler returns (includes nodeId, output, messages, duration)
  - `beforeToolCall` — before MCP tool or agent-as-tool invocation
  - `afterToolCall` — after tool returns (includes toolName, result, latency)
- [ ] A1.2 — Create `src/lib/runtime/hooks.ts`:
  - `FlowHookRegistry` class with `register(event, callback)` and `emit(event, payload)`
  - Support sync and async callbacks
  - Error in hook callback must NOT crash the flow (try/catch with logger.warn)
- [ ] A1.3 — Integrate hooks into `engine.ts`:
  - Emit `onFlowStart` at line ~140 (where audit log currently fires)
  - Emit `beforeNodeExecute` / `afterNodeExecute` around handler call at line ~189
  - Emit `onFlowComplete` at line ~244
  - Emit `onFlowError` in catch block at line ~258
- [ ] A1.4 — Integrate hooks into `engine-streaming.ts`:
  - Same integration points as engine.ts (lines ~113, ~166, ~461)
  - Hook emit must NOT block the stream writer
- [ ] A1.5 — Integrate hooks into `ai-response-handler.ts` and `ai-response-streaming-handler.ts`:
  - Emit `beforeToolCall` / `afterToolCall` around MCP tool execution and agent-as-tool calls
- [ ] A1.6 — Create `WebhookHookSink`:
  - Auto-register webhook URLs from agent config
  - POST hook events to configured webhook URLs (fire-and-forget, 5s timeout)
  - JSON payload: `{ event, agentId, flowId, nodeId, timestamp, data }`
- [ ] A1.7 — Add hook configuration to Agent model or Flow config:
  - `hookWebhookUrls: string[]` — URLs to receive hook events
  - `hookEvents: string[]` — which events to emit (default: all)
- [ ] A1.8 — Write unit tests for hooks.ts (register, emit, error isolation)
- [ ] A1.9 — Write integration test: flow with hooks -> webhook receives events

**Files to modify:**
- `src/lib/runtime/hooks.ts` (NEW)
- `src/lib/runtime/engine.ts`
- `src/lib/runtime/engine-streaming.ts`
- `src/lib/runtime/handlers/ai-response-handler.ts`
- `src/lib/runtime/handlers/ai-response-streaming-handler.ts`
- `src/lib/runtime/types.ts` (add FlowHookEvent type)

**Estimated effort:** Medium (3-5 days)
**Impact:** Foundation for all monitoring, debugging, and external integrations

---

### A2. PreCompact — Agentic Turn Before Context Truncation

> **Gap**: `engine.ts` line 134-137 does `messageHistory.slice(-MAX_HISTORY)`.
> This is a brutal truncation that permanently loses context.
> OpenClaw triggers a "silent agentic turn" before compaction — asks the AI
> to save critical information to AgentMemory BEFORE truncating.
> OMC has a `pre-compact` hook that fires before context window compression.

**Current state** (verified in code):
- `engine.ts` line 134: `context.messageHistory = context.messageHistory.slice(-MAX_HISTORY)`
- `engine-streaming.ts` line 25-27: same MAX_HISTORY=100
- No pre-truncation logic whatsoever — context is lost permanently

**Tasks:**

- [x] A2.1 — Create `src/lib/runtime/context-compaction.ts`:
  - `compactContext(context, model)` function
  - Step 1: Generate summary prompt: "Summarize the key facts, decisions, and state from this conversation that should be preserved"
  - Step 2: Call AI with summarization prompt (use cheap model: deepseek-chat or haiku)
  - Step 3: Write summary to AgentMemory via `memory_write` handler (key: `__context_summary_{timestamp}`, category: `context_compaction`)
  - Step 4: Optionally write important variable states to memory
  - Step 5: THEN truncate messageHistory to MAX_HISTORY
  - Step 6: Prepend a system message with the summary to the truncated history
- [x] A2.2 — Add compaction threshold to engine.ts:
  - `COMPACTION_THRESHOLD = 80` (trigger compaction at 80% of MAX_HISTORY)
  - At line ~134: if `messageHistory.length > COMPACTION_THRESHOLD`, call `compactContext()` before slice
- [x] A2.3 — Same integration in engine-streaming.ts
- [ ] A2.4 — Emit `onPreCompact` hook event (from A1) before compaction runs *(deferred until A1 is done)*
- [x] A2.5 — Add agent-level config: `enableSmartCompaction: boolean` (default: true for new agents)
- [x] A2.6 — Write unit tests:
  - Test: compaction saves summary to AgentMemory
  - Test: truncated history includes prepended summary
  - Test: compaction threshold triggers correctly at 80%
  - Test: compaction works even if AI call fails (graceful fallback to raw truncation)

**Files to modify:**
- `src/lib/runtime/context-compaction.ts` (NEW)
- `src/lib/runtime/engine.ts` (line ~134)
- `src/lib/runtime/engine-streaming.ts`

**Estimated effort:** Medium (2-3 days)
**Impact:** ENORMOUS — eliminates the #1 problem with long-running agents (context loss)

---

### A3. Persistent Mode — ralph-Style Completion Loops

> **Gap**: `reflexive_loop` has max 5 iterations and no build/test/lint verification.
> OMC's `$ralph` mode runs indefinitely with single ownership until a verifier
> confirms completion. The `persistent-mode` hook prevents stopping.

**Current state** (verified in code):
- `reflexive-loop-handler.ts` line 34-37: `maxIterations` capped at 1-5, default 3
- Evaluation is AI-only (no build/test/lint commands)
- No "persistent mode" concept — loop always terminates after max iterations

**Tasks:**

- [ ] A3.1 — Add `persistent` mode to `reflexive_loop` node config:
  - `mode: "bounded" | "persistent"` (default: "bounded" = current behavior)
  - In persistent mode: max iterations raised to 20 (safety cap), but primary exit is verifier pass
- [ ] A3.2 — Add verification commands to evaluator step:
  - New config field: `verificationCommands: string[]` (e.g., ["npm run build", "npm run test", "npm run lint"])
  - After AI evaluation, if commands configured, run them via `python_code` or `code_interpreter` sandbox
  - All commands must pass (exit code 0) for the verifier to approve
  - Command output appended to evaluator context
- [ ] A3.3 — Add `persistent-mode` check to `end` node handler:
  - If flow has `__persistent_mode = true` variable, `end` node checks verifier status
  - If verifier has not confirmed, route back to the generating node instead of terminating
- [ ] A3.4 — Emit `session.blocked` hook event when persistent loop is waiting for verification
- [ ] A3.5 — Write unit tests for persistent mode (verifier pass, verifier fail, safety cap reached)

**Files to modify:**
- `src/lib/runtime/handlers/reflexive-loop-handler.ts`
- `src/lib/runtime/handlers/end-handler.ts`
- `src/types/index.ts` (add persistent mode config to reflexive_loop node data)

**Estimated effort:** Medium (2-3 days)
**Impact:** Enables production-grade autonomous workflows that self-verify

---

## FAZA B — New Execution Modes (P1 — Major New Capabilities)

Inspired by: OMC's 5 execution modes (Autopilot, Ultrapilot, Swarm, Pipeline, Ecomode).

### B1. `swarm` Node Type — Shared Task Pool

> **Gap**: No equivalent exists. OMC Swarm mode spawns N agents that pull from
> a shared task pool. Each agent atomically claims a task, executes it, and
> marks it complete. Prevents duplicate work.

**Current state**: Closest is `parallel` node (MAX_BRANCHES=5, fixed branch assignment).
No dynamic task claiming or shared pool.

**Tasks:**

- [ ] B1.1 — Add `swarm` to `NodeType` union in `src/types/index.ts`
- [ ] B1.2 — Create `src/lib/runtime/handlers/swarm-handler.ts`:
  - Config: `tasks: string[]` (list of task descriptions), `workerCount: number` (1-10, default 3), `workerModel: string`, `mergeStrategy: "concat" | "summarize"`
  - Implementation:
    1. Parse task list from config or variable
    2. Create task queue (array with status: pending/claimed/done)
    3. Spawn N workers (similar to parallel handler branches)
    4. Each worker: claim next pending task (atomic via mutex/index), execute via AI call, mark done
    5. Workers continue until queue empty
    6. Merge all results per mergeStrategy
  - Safety: timeout per task (60s), overall timeout (300s), max tasks = 50
- [ ] B1.3 — Register handler in `src/lib/runtime/handlers/index.ts`
- [ ] B1.4 — Create display component `src/components/builder/nodes/swarm-node.tsx`
- [ ] B1.5 — Add to node picker in `src/components/builder/node-picker.tsx`
- [ ] B1.6 — Add property editor in `src/components/builder/property-panel.tsx`:
  - Task list editor (add/remove/reorder)
  - Worker count slider
  - Model selector
  - Merge strategy dropdown
- [ ] B1.7 — Write unit tests (task claiming, concurrent workers, empty queue, timeout)
- [ ] B1.8 — Add swarm node to node type documentation

**Files to create/modify:**
- `src/types/index.ts` (add to NodeType union)
- `src/lib/runtime/handlers/swarm-handler.ts` (NEW)
- `src/lib/runtime/handlers/index.ts` (register)
- `src/components/builder/nodes/swarm-node.tsx` (NEW)
- `src/components/builder/node-picker.tsx`
- `src/components/builder/property-panel.tsx`

**Estimated effort:** High (4-6 days)
**Impact:** Enables sprint-backlog-style parallel work — major new orchestration pattern

---

### B2. Enhanced `parallel` Node — Worker Pool + Context Isolation

> **Gap**: `parallel-handler.ts` line 35 uses shallow copy `{ ...context.variables }`.
> Branches share the messageHistory reference. OMC Ultrapilot uses full context isolation
> per worker with worktree-style independence.

**Current state** (verified in code):
- MAX_BRANCHES = 5 (hardcoded at line 4)
- Branch context: `{ ...context, variables: { ...context.variables } }` (shallow copy)
- messageHistory is shared by reference — branches can see each other's messages
- Fixed branch assignment (no dynamic worker pool)

**Tasks:**

- [ ] B2.1 — Deep-copy messageHistory per branch:
  - Change branch context creation (line ~76-81) to deep-copy messageHistory
  - Each branch gets independent message accumulation
  - Merge strategy determines how branch messages combine after completion
- [ ] B2.2 — Add worker pool mode to parallel node:
  - New config: `mode: "branches" | "workers"` (default: "branches" = current)
  - Workers mode: N workers execute the same sub-flow with different inputs
  - Input mapping: `workerInputs: Array<Record<string, unknown>>` — each worker gets one input set
- [ ] B2.3 — Increase MAX_BRANCHES to 10 (configurable per node, default 5)
- [ ] B2.4 — Write tests for context isolation (branch A writes variable, branch B doesn't see it)

**Files to modify:**
- `src/lib/runtime/handlers/parallel-handler.ts`
- `src/lib/runtime/handlers/parallel-streaming-handler.ts`

**Estimated effort:** Medium (2-3 days)
**Impact:** Prevents context pollution between parallel branches — correctness improvement

---

### B3. Ecomode Enhancement for `cost_monitor`

> **Gap**: cost_monitor adaptive mode already has tier downgrade at 60/80/95%.
> OMC Ecomode additionally routes each sub-task to the cheapest capable model
> automatically, achieving 30-50% token savings.

**Current state** (verified in code):
- Adaptive mode: Tier 1 (60%) -> balanced, Tier 2 (80%) -> fast, Tier 3 (95%) -> block/fast
- Sets `__model_tier_override` variable for downstream nodes
- This already exists and works well

**Tasks:**

- [ ] B3.1 — Add `ecomode` to cost_monitor modes (alongside monitor/budget/alert/adaptive/enforce):
  - In ecomode: before each AI node, classify task complexity (simple/moderate/complex) using a cheap 1-shot call
  - Route to cheapest model that can handle that complexity tier
  - Log savings per node for dashboard analytics
- [ ] B3.2 — Add per-task model selection log to cost tracking output:
  - Track `{ nodeId, taskComplexity, modelUsed, tokensSaved }` per node
- [ ] B3.3 — Write tests for ecomode routing (simple task -> haiku, complex task -> opus)

**Files to modify:**
- `src/lib/runtime/handlers/cost-monitor-handler.ts`

**Estimated effort:** Low-Medium (1-2 days)
**Impact:** 30-50% token cost reduction — significant for production workloads

---

## FAZA C — Memory Architecture Upgrade (P1 — High Impact)

Inspired by: memsearch (Zilliz), OpenClaw memory system, clawhip MEMORY.md + shards, bb25.

### C1. memsearch-Style Markdown Memory Layer

> **Gap**: AgentMemory stores JSON in PostgreSQL only. Not human-readable, not editable,
> not exportable. memsearch uses Markdown files as source of truth with vector index
> as cache. OpenClaw uses MEMORY.md index + memory/ shards for hot/cold tiers.

**Current state** (verified in code):
- `AgentMemory` model: `key`, `value (Json)`, `category`, `importance`, `embedding`, `accessCount`
- No hot/cold tier distinction
- No markdown export
- No human-editable UI
- No context-window-friendly summary layer

**Tasks:**

- [ ] C1.1 — Create `src/lib/memory/markdown-export.ts`:
  - `exportAgentMemoryAsMarkdown(agentId)` — generates MEMORY.md index:
    ```markdown
    # Agent Memory — {agentName}
    ## Hot (recently accessed, high importance)
    - **{key}**: {summary} (importance: {importance}, accessed: {accessedAt})
    ## Categories
    ### general
    - {key}: {truncated value}
    ### context_compaction
    - {key}: {summary}
    ```
  - `exportMemoryShards(agentId)` — generates per-category shard files
- [ ] C1.2 — Create `src/lib/memory/hot-cold-tier.ts`:
  - `getHotMemories(agentId, limit=10)` — top N by: importance x recencyScore x accessFrequency
  - `getColdMemories(agentId, query)` — semantic search in pgvector for relevant cold memories
  - `injectHotMemoryIntoContext(context)` — prepend hot memory summary as system message
  - Hot memory = accessed in last 24h OR importance > 0.8 OR accessCount > 10
  - Cold memory = everything else
- [ ] C1.3 — Integrate hot memory injection into engine.ts and engine-streaming.ts:
  - Before first AI node executes, inject hot memory summary into context
  - This gives the agent "always-on" memory without loading everything
- [ ] C1.4 — Create Memory UI tab on agent page (like Knowledge Base):
  - List all memories with key, value preview, importance, category, lastAccessed
  - Edit button: inline edit of value field
  - Delete button with confirmation
  - Export as Markdown button
  - Import from Markdown (parse MEMORY.md format back into AgentMemory records)
- [ ] C1.5 — API routes:
  - `GET /api/agents/[agentId]/memory` — list all memories (paginated)
  - `PATCH /api/agents/[agentId]/memory/[memoryId]` — edit value/importance/category
  - `DELETE /api/agents/[agentId]/memory/[memoryId]` — delete single memory
  - `GET /api/agents/[agentId]/memory/export` — download MEMORY.md
  - `POST /api/agents/[agentId]/memory/import` — upload and parse MEMORY.md
- [ ] C1.6 — Write tests for markdown export/import roundtrip, hot/cold tier selection

**Files to create/modify:**
- `src/lib/memory/markdown-export.ts` (NEW)
- `src/lib/memory/hot-cold-tier.ts` (NEW)
- `src/lib/runtime/engine.ts` (hot memory injection)
- `src/lib/runtime/engine-streaming.ts` (hot memory injection)
- `src/app/api/agents/[agentId]/memory/route.ts` (NEW)
- `src/app/api/agents/[agentId]/memory/[memoryId]/route.ts` (NEW)
- `src/app/api/agents/[agentId]/memory/export/route.ts` (NEW)
- `src/app/api/agents/[agentId]/memory/import/route.ts` (NEW)
- Agent detail page (new Memory tab)

**Estimated effort:** High (5-7 days)
**Impact:** Transparent, human-editable agent memory — major UX and capability improvement

---

### C2. 3-Layer Skill Composition

> **Gap**: rbac.ts has READ/EXECUTE/ADMIN permissions only.
> OMC uses 3-layer composition: Guarantee -> Enhancement -> Execution.
> Guarantee skills (security, guardrails) always run first.

**Current state** (verified in code):
- `rbac.ts`: `AccessLevel` enum with READ/EXECUTE/ADMIN — flat hierarchy
- No skill ordering, no composition layers, no mandatory skills

**Tasks:**

- [ ] C2.1 — Add `compositionLayer` field to Skill model:
  - `compositionLayer: "guarantee" | "enhancement" | "execution"` (default: "execution")
  - Guarantee: always runs first (security-check, guardrails, pii-detector)
  - Enhancement: runs after guarantee, before execution (performance-monitor, mem-check)
  - Execution: primary task skill (autopilot, ralph, team)
- [ ] C2.2 — Create `src/lib/ecc/skill-composer.ts`:
  - `composeSkillPipeline(agentId, taskSkillId)` — returns ordered skill list:
    1. All guarantee-layer skills the agent has access to
    2. Enhancement-layer skills matching task context
    3. The requested execution-layer skill
  - Skills within each layer ordered by priority/importance
- [ ] C2.3 — Integrate skill composition into AI response handler:
  - Before main AI call, inject guarantee-layer skill instructions into system prompt
  - Append enhancement-layer context
  - Main execution skill becomes the primary instruction
- [ ] C2.4 — Update Skills Browser UI to show composition layer badge
- [ ] C2.5 — Prisma migration: add `compositionLayer String @default("execution")` to Skill model
- [ ] C2.6 — Write tests for composition ordering and layer enforcement

**Files to create/modify:**
- `prisma/schema.prisma` (add compositionLayer to Skill model)
- `src/lib/ecc/skill-composer.ts` (NEW)
- `src/lib/runtime/handlers/ai-response-handler.ts`
- `src/app/skills/page.tsx`

**Estimated effort:** Medium (2-3 days)
**Impact:** Ensures security/guardrail skills always execute — safety improvement

---

### C3. bb25 Bayesian Hybrid Search

> **Gap**: `search.ts` uses manual RRF with fixed weights (0.7 semantic / 0.3 keyword).
> bb25 uses Bayesian calibration to automatically balance semantic and keyword scores
> without scale mismatch. Proven +1.0%p NDCG on SQuAD benchmark. Rust core.

**Current state** (verified in code):
- `search.ts` line 282-310: `reciprocalRankFusion()` with k=60, weights 0.7/0.3
- Post-fusion: min-max normalization
- Manual weight tuning per KB via `hybridAlpha` config field

**Tasks:**

- [ ] C3.1 — Research bb25 integration options:
  - Option A: Call bb25 via Python subprocess (pip install bb25, Rust core)
  - Option B: Port Bayesian calibration logic to TypeScript
  - Option C: Use bb25 as MCP tool (FastMCP wrapper)
  - Decision: TBD after benchmarking on our data
- [ ] C3.2 — Add `fusionStrategy` config to KnowledgeBase model:
  - `fusionStrategy: "rrf" | "bayesian"` (default: "rrf" = current behavior)
  - When "bayesian": use bb25 for score calibration before fusion
- [ ] C3.3 — Implement bayesian fusion in `search.ts`:
  - Replace `reciprocalRankFusion()` with `bayesianFusion()` when configured
  - Bayesian calibration: transform raw BM25 scores to posterior probabilities
  - Fuse calibrated BM25 probabilities with vector cosine scores (natural blend, no scale mismatch)
- [ ] C3.4 — Benchmark: run hybrid search on 20 test queries with RRF vs Bayesian
  - Measure: NDCG, MRR, P@5, latency
- [ ] C3.5 — Write tests for bayesian fusion (score calibration, edge cases)

**Files to modify:**
- `src/lib/knowledge/search.ts`
- `src/lib/schemas/kb-config.ts` (add fusionStrategy)
- `prisma/schema.prisma` (optional: add fusionStrategy to KnowledgeBase)

**Estimated effort:** Medium (3-4 days, includes benchmarking)
**Impact:** Better RAG search precision — measurable improvement in retrieval quality

---

## FAZA D — Verification & Multi-Provider (P1-P2)

Inspired by: OMC verification protocol, OMC `omc ask` cross-provider delegation.

### D1. Verification Protocol Node

> **Gap**: `reflexive_loop` evaluator is AI-only — never runs build/test/lint commands.
> OMC verifier runs: BUILD, TEST, LINT, FUNCTIONALITY, ARCHITECT review, ERROR_FREE.

**Tasks:**

- [ ] D1.1 — Create `src/lib/runtime/handlers/verification-handler.ts`:
  - New node type: `verification`
  - Config: `checks: Array<{ type: "build" | "test" | "lint" | "custom", command: string }>`
  - Execution: run each command via sandbox (code_interpreter or python_code handler)
  - Result: all must pass (exit code 0) -> route to "passed" sourceHandle
  - Any failure -> route to "failed" sourceHandle with error output
- [ ] D1.2 — Add `verification` to NodeType union and register handler
- [ ] D1.3 — Create display component `src/components/builder/nodes/verification-node.tsx`
- [ ] D1.4 — Add to node picker and property panel
- [ ] D1.5 — Create starter flow template: "verification-pipeline" (executor -> verification -> end/retry)
- [ ] D1.6 — Write tests for verification (all pass, one fails, command timeout)

**Files to create/modify:**
- `src/lib/runtime/handlers/verification-handler.ts` (NEW)
- `src/types/index.ts` (add to NodeType union)
- `src/lib/runtime/handlers/index.ts` (register)
- `src/components/builder/nodes/verification-node.tsx` (NEW)
- `src/components/builder/node-picker.tsx`
- `src/components/builder/property-panel.tsx`
- `src/data/starter-flows.ts` (new template)

**Estimated effort:** Medium (2-3 days)
**Impact:** Agents can verify their own work with real commands — production quality

---

### D2. Cross-Provider Orchestration

> **Gap**: `call_agent` handler calls sibling agents but they all use the same
> provider ecosystem. OMC's `omc ask` sends tasks to Claude, Codex, and Gemini
> separately and synthesizes results. OMC's `ccg` skill fans out to Codex+Gemini
> with Claude synthesizing.

**Tasks:**

- [ ] D2.1 — Add `providerOverride` option to `call_agent` handler:
  - When set, the called agent uses a different model/provider than its default
  - Example: Agent A (DeepSeek) calls Agent B with providerOverride="claude-sonnet-4-6"
- [ ] D2.2 — Create `cross-provider` starter flow template:
  - Input -> parallel[Agent-Claude, Agent-DeepSeek, Agent-Gemini] -> AI synthesizer -> output
- [ ] D2.3 — Update property panel to show provider badge per agent in parallel node config
- [ ] D2.4 — Write tests for cross-provider call (mock different providers)

**Files to modify:**
- `src/lib/runtime/handlers/call-agent-handler.ts`
- `src/data/starter-flows.ts` (new template)
- `src/components/builder/property-panel.tsx`

**Estimated effort:** Low (1-2 days)
**Impact:** Better results through multi-model synthesis — quality improvement

---

## FAZA E — Notification & Monitoring (P2)

Inspired by: clawhip typed event pipeline, renderer/sink split, session.* events.

### E1. Session Event Types

> **Gap**: notification-handler.ts supports generic levels (info/warning/error/success)
> but no standardized session lifecycle events. clawhip defines: session.started,
> session.blocked, session.finished, session.failed, session.pr_created.

**Tasks:**

- [ ] E1.1 — Define `SessionEventType` in `src/lib/runtime/types.ts`:
  - `session.started` | `session.blocked` | `session.finished` | `session.failed` |
    `session.timeout` | `session.verification_passed` | `session.verification_failed`
- [ ] E1.2 — Emit session events from engine.ts and engine-streaming.ts:
  - `session.started` at flow start
  - `session.finished` at successful flow end
  - `session.failed` on flow error
  - `session.timeout` on MAX_ITERATIONS hit
  - `session.blocked` on human_approval waitForInput
- [ ] E1.3 — Auto-fire notifications for session events (configurable per agent):
  - Agent config: `sessionNotifications: { events: SessionEventType[], channel: "webhook" | "in_app", webhookUrl?: string }`
- [ ] E1.4 — Add Discord and Slack webhook presets to notification config:
  - Discord: format message with embed (title, color by event type, fields)
  - Slack: format as Block Kit message
- [ ] E1.5 — Write tests for each session event type emission

**Files to modify:**
- `src/lib/runtime/types.ts`
- `src/lib/runtime/engine.ts`
- `src/lib/runtime/engine-streaming.ts`
- `src/lib/runtime/handlers/notification-handler.ts`

**Estimated effort:** Medium (2-3 days)
**Impact:** Real-time visibility into agent execution — essential for production monitoring

---

### E2. Renderer/Sink Split in Notification Handler

> **Gap**: notification-handler.ts mixes formatting and transport in a single handler.
> clawhip separates renderer (format message) from sink (deliver to Discord/Slack/etc).
> This makes adding new sinks trivial without touching rendering logic.

**Tasks:**

- [ ] E2.1 — Refactor notification-handler.ts into renderer + sink pattern:
  - `NotificationRenderer` interface: `render(event, options) -> RenderedMessage`
  - `NotificationSink` interface: `deliver(rendered, config) -> DeliveryResult`
- [ ] E2.2 — Create renderers:
  - `PlainTextRenderer` — current behavior
  - `DiscordRenderer` — Discord embed format (rich)
  - `SlackRenderer` — Slack Block Kit format (mrkdwn)
  - `MarkdownRenderer` — for in-app display
- [ ] E2.3 — Create sinks:
  - `WebhookSink` — current HTTP POST behavior
  - `InAppSink` — current in-app behavior
  - `LogSink` — current logger behavior
- [ ] E2.4 — Config: `{ renderer: "plain" | "discord" | "slack" | "markdown", sink: "webhook" | "in_app" | "log" }`
- [ ] E2.5 — Write tests for each renderer x sink combination

**Files to modify:**
- `src/lib/runtime/handlers/notification-handler.ts` (refactor)
- `src/lib/notifications/renderers/` (NEW directory)
- `src/lib/notifications/sinks/` (NEW directory)

**Estimated effort:** Medium (2-3 days)
**Impact:** Extensible notification system — easy to add Telegram, email, Teams, etc.

---

## FAZA F — Advanced Capabilities (P3 — Long Term)

### F1. LSP Integration for Code-Aware Agents

> **Gap**: No Language Server Protocol support. OMC has real LSP integration with
> 15s timeout for semantic analysis, go-to-definition, find-references, rename-symbol.

**Tasks:**

- [ ] F1.1 — Research: evaluate LSP client libraries for Node.js (vscode-languageclient, etc.)
- [ ] F1.2 — Create `src/lib/lsp/client.ts`:
  - `startLSPServer(language, workspacePath)` — launch tsserver or pylsp
  - `getDefinition(file, position)` — go-to-definition
  - `getReferences(file, position)` — find-references
  - `getDiagnostics(file)` — get errors/warnings
- [ ] F1.3 — Create `lsp_query` node type:
  - Input: file path, symbol name, operation type
  - Output: definition location, reference list, or diagnostics
- [ ] F1.4 — Integrate LSP context into ai_response system prompt for code-aware agents
- [ ] F1.5 — Write tests with mock LSP server

**Estimated effort:** High (7-10 days)
**Impact:** ENORMOUS for developer agents — semantic code understanding

---

### F2. AST-Grep Pattern Matching

> **Gap**: No AST-level code analysis. OMC integrates ast-grep for precise
> pattern matching and refactoring via syntax trees.

**Tasks:**

- [ ] F2.1 — Add `@ast-grep/napi` package (Node.js bindings)
- [ ] F2.2 — Create `src/lib/ast/pattern-matcher.ts`:
  - `matchPattern(code, pattern, language)` — find AST matches
  - `replacePattern(code, pattern, replacement, language)` — AST-based refactoring
- [ ] F2.3 — Integrate into `code_interpreter` handler as optional AST mode
- [ ] F2.4 — Write tests for pattern matching and replacement

**Estimated effort:** Medium (3-4 days)
**Impact:** Precise code transformations — quality improvement for code agents

---

### F3. Dynamic Skill Injection (Context-Aware)

> **Gap**: ECC skills are loaded statically. claw-code/clawhip approach: auto-detect
> which skill is relevant for the current task and inject ONLY that skill into
> the agent's context. Reduces context bloat dramatically.

**Tasks:**

- [ ] F3.1 — Create `src/lib/ecc/skill-router.ts`:
  - `routeToSkill(taskDescription, availableSkills)` — semantic similarity match
  - Use embedding comparison (reuse KB embeddings infrastructure)
  - Return top-N relevant skills (default N=3)
- [ ] F3.2 — Integrate into ai_response handler:
  - Before AI call, run skill router on the current task/prompt
  - Inject only matched skill content into system prompt
  - Track which skills were injected for audit
- [ ] F3.3 — Write tests for skill routing accuracy

**Files to create/modify:**
- `src/lib/ecc/skill-router.ts` (NEW)
- `src/lib/runtime/handlers/ai-response-handler.ts`

**Estimated effort:** Medium (2-3 days)
**Impact:** Less context bloat, more relevant skill context — quality + cost improvement

---

## Summary — Total Effort Estimate

| Faza | Tasks | Effort | Priority |
|------|-------|--------|----------|
| A — Runtime Hooks | A1-A3 (19 subtasks) | 7-11 days | P0 |
| B — Execution Modes | B1-B3 (15 subtasks) | 7-11 days | P1 |
| C — Memory Upgrade | C1-C3 (17 subtasks) | 10-14 days | P1 |
| D — Verification | D1-D2 (10 subtasks) | 3-5 days | P1-P2 |
| E — Notifications | E1-E2 (10 subtasks) | 4-6 days | P2 |
| F — Advanced | F1-F3 (12 subtasks) | 12-17 days | P3 |
| **TOTAL** | **6 faza, 83 subtasks** | **43-64 days** | — |

**Recommended implementation order:**
A2 -> A1 -> B2 -> C1 -> A3 -> B1 -> D1 -> C2 -> C3 -> E1 -> E2 -> B3 -> D2 -> F3 -> F2 -> F1

---

## References

- [claw-code](https://github.com/instructkr/claw-code) — Agent harness architecture, hook DAG, session management
- [oh-my-codex (OMX)](https://github.com/Yeachan-Heo/oh-my-codex) — $ralph, $team, SKILL.md, .omx/ state
- [oh-my-claudecode (OMC)](https://github.com/yeachan-heo/oh-my-claudecode) — 5 execution modes, 29 agents, 32 skills, hook system, verification protocol
- [OMC ARCHITECTURE.md](https://github.com/Yeachan-Heo/oh-my-claudecode/blob/main/docs/ARCHITECTURE.md) — 3-layer skills, hook events, verification protocol
- [OMC REFERENCE.md](https://github.com/Yeachan-Heo/oh-my-claudecode/blob/main/docs/REFERENCE.md) — Full agent roster, skill list, CLI commands
- [clawhip](https://github.com/Yeachan-Heo/clawhip) — Event pipeline, MEMORY.md + shards, renderer/sink split
- [memsearch](https://github.com/zilliztech/memsearch) — Markdown-first memory, vector cache, human-editable
- [bb25](https://github.com/instructkr/bb25) — Bayesian BM25 hybrid search, Rust core, +1.0%p NDCG
- [OpenClaw Memory System](https://docs.openclaw.ai/concepts/memory) — Hot/cold tiers, agentic compaction
