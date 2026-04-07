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

- [x] A1.1 — Define `FlowHookEvent` type with 8 events (added `onPreCompact`):
  - `onFlowStart`, `onFlowComplete`, `onFlowError`, `beforeNodeExecute`, `afterNodeExecute`,
    `beforeToolCall`, `afterToolCall`, `onPreCompact`
- [x] A1.2 — Created `src/lib/runtime/hooks.ts`:
  - `FlowHookRegistry` class with `addSink(sink)` and `emit(payload)`
  - `WebhookHookSink` for fire-and-forget webhook delivery (5s timeout)
  - `createHooksFromFlowContent()` factory, `emitHook()` convenience wrapper
  - Error in any sink never crashes the flow (try/catch with logger.warn)
- [x] A1.3 — Integrated hooks into `engine.ts` (5 points + auto-initialization)
- [x] A1.4 — Integrated hooks into `engine-streaming.ts` (5 points in all 3 codepaths)
- [x] A1.5 — Added `experimental_onToolCallStart` / `experimental_onToolCallFinish` to both AI handlers
- [x] A1.6 — `WebhookHookSink` implemented (fire-and-forget POST, 5s AbortSignal timeout)
- [x] A1.7 — Hook config in `FlowContent` JSON: `hookWebhookUrls?: string[]`, `hookEvents?: string[]`
  - Zod validation: max 10 URLs, enum of valid event types; no DB migration needed
- [x] A1.8 — 17 unit tests: FlowHookRegistry, WebhookHookSink, factory, emitHook — all pass
- [ ] A1.9 — Integration test: flow with hooks → webhook receives events *(deferred)*

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
- [x] A2.4 — Emit `onPreCompact` hook event before compaction runs (added to `compactContext()`)
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

- [x] A3.1 — Added `persistent` mode to `reflexive_loop` node config:
  - `mode: "bounded" | "persistent"` (default: "bounded" = current behavior)
  - In persistent mode: max iterations raised to 20 (MAX_PERSISTENT_ITERATIONS), primary exit is verifier pass
- [x] A3.2 — Added verification commands to evaluator step:
  - New config field: `verificationCommands: string[]` (e.g., ["npm run build", "npm run test", "npm run lint"])
  - After AI evaluation passes, if commands configured, runs them via `child_process.execFile` (NOT sandbox — see note below)
  - All commands must pass (exit code 0) for the verifier to approve
  - Command output appended to evaluator feedback for next iteration
  - **Security**: whitelist regex for command prefixes, shell metacharacter blocking, 60s timeout, execFile (no shell)
  - **Design deviation**: TASKS.md originally specified `python_code` or `code_interpreter` sandbox, but both block `os`/`subprocess` imports. `execFile` with whitelist + metacharacter blocking is safer than `exec` and sufficient for build/test/lint commands.
- [x] A3.3 — Added `persistent-mode` check to `end` node handler:
  - If `__persistent_mode = true` and `__verifier_confirmed = false`, routes back to `__persistent_return_node`
  - Updated maxVisits in both `engine.ts` and `engine-streaming.ts`: `reflexive_loop` gets 110 (like `loop`), `end` gets 25 when persistent
- [x] A3.4 — Emit `onPersistentCap` hook event when persistent loop exhausts iteration cap
  - Renamed from `session.blocked` to `onPersistentCap` for camelCase consistency with existing hook events
- [x] A3.5 — 16 unit tests for persistent mode (bounded defaults, persistent variables, cleanup on pass/fail/error, verification command filtering, end-handler routing)
- [x] A3.6 — Persistent state cleanup: `__persistent_mode`, `__verifier_confirmed`, `__persistent_return_node` cleaned up in updatedVariables on all exit paths (passed, failed, error)

**Files modified:**
- `src/lib/runtime/handlers/reflexive-loop-handler.ts` — persistent mode, verification commands, variable cleanup
- `src/lib/runtime/handlers/end-handler.ts` — persistent routing back to reflexive_loop
- `src/lib/runtime/engine.ts` — maxVisits for reflexive_loop + persistent end
- `src/lib/runtime/engine-streaming.ts` — same maxVisits update
- `src/lib/runtime/types.ts` — added `onPersistentCap` to FlowHookEventType
- `src/lib/validators/flow-content.ts` — added `onPersistentCap` to Zod HOOK_EVENT_TYPES
- `src/lib/runtime/handlers/__tests__/persistent-mode.test.ts` (NEW — 16 tests)

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

- [x] B1.1 — Add `swarm` to `NodeType` union in `src/types/index.ts` (56th type)
  - Also added to `flow-content.ts` NODE_TYPES validator array
- [x] B1.2 — Created `src/lib/runtime/handlers/swarm-handler.ts` (~350 lines):
  - Config: `tasks: string[]`, `tasksVariable: string`, `workerCount: number` (1-10, default 3), `workerModel: string`, `mergeStrategy: "concat" | "summarize"`, `systemPrompt`, `taskContext`
  - Task queue with atomic claiming (safe in single-threaded Node.js)
  - N workers via `Promise.allSettled`, continue until queue empty or deadline
  - Merge: concat (join results) or summarize (AI-powered synthesis)
  - Routes to `done` or `failed` sourceHandle based on success rate
  - Respects `__model_tier_override` and `__ecomode_enabled` from cost_monitor
  - Safety: TASK_TIMEOUT_MS=60s, OVERALL_TIMEOUT_MS=300s, MAX_TASKS=50, MAX_WORKERS=10
- [x] B1.3 — Registered handler in `src/lib/runtime/handlers/index.ts`
- [x] B1.4 — Created `src/components/builder/nodes/swarm-node.tsx` (amber theme, Boxes icon)
- [x] B1.5 — Added to node picker in `src/components/builder/node-picker.tsx` (ai category)
- [x] B1.6 — Added property editor in `src/components/builder/property-panel.tsx`:
  - Worker count, model selector, system prompt, task context, tasks variable, static task list editor, merge strategy, output variable
  - Also registered in `flow-builder.tsx` NODE_TYPES map and OUTPUT_VAR_TYPES set
- [x] B1.7 — 16 unit tests in `swarm-handler.test.ts`: empty tasks, string array, newline-separated, variable source, worker capping, MAX_TASKS, output variables, done/failed routing, model override, ecomode, error handling, empty task filtering
  - Also updated `node-picker.test.tsx`: count 55→56, ai category 13→14, added Boxes mock
- [x] B1.8 — Updated CLAUDE.md section 3 + 6 with swarm node (56 types, handler description)

**Files to create/modify:**
- `src/types/index.ts` (add to NodeType union)
- `src/lib/validators/flow-content.ts` (add `"swarm"` to NODE_TYPES array — **kontrolni ček addition**)
- `src/lib/runtime/handlers/swarm-handler.ts` (NEW)
- `src/lib/runtime/handlers/index.ts` (register)
- `src/components/builder/nodes/swarm-node.tsx` (NEW)
- `src/components/builder/flow-builder.tsx` (import + register in NODE_TYPES map — **kontrolni ček addition**)
- `src/components/builder/node-picker.tsx`
- `src/components/builder/property-panel.tsx`

> **Note (kontrolni ček):** swarm is NOT self-routing — uses default edge after completion.
> Do NOT add to SELF_ROUTING_NODES in engine.ts.

**Estimated effort:** High (3-4 days)
**Impact:** Enables sprint-backlog-style parallel work — major new orchestration pattern

---

### B2. Enhanced `parallel` Node — Context Isolation Fix

> **Gap**: `parallel-handler.ts` line 35 uses shallow copy `{ ...context.variables }`.
> Nested objects (arrays, sub-objects) in variables are shared between branches — branch A
> can mutate branch B's data. OMC Ultrapilot uses full context isolation per worker.
>
> **Kontrolni ček correction**: messageHistory already uses spread `[...context.messageHistory]`
> (line 80) which is sufficient for {role,content} string objects. The real bug is ONLY
> in variables shallow copy. `structuredClone()` is the fix (Node 18+, handles Date/RegExp/Map).

**Current state** (verified in code):
- MAX_BRANCHES = 5 (hardcoded at line 4 in BOTH parallel-handler.ts AND parallel-streaming-handler.ts)
- Branch context: `{ ...context, variables: { ...context.variables } }` (shallow copy — BUG)
- messageHistory: `[...context.messageHistory]` (spread copy — OK, strings only)

**Tasks:**

- [x] B2.1 — Deep-copy variables with `structuredClone()` in both handlers:
  - `parallel-handler.ts` line 35: `{ ...context.variables }` → `structuredClone(context.variables)`
  - `parallel-streaming-handler.ts` line 37: same fix
  - structuredClone handles: nested objects, arrays, Date, RegExp, Map, Set
  - structuredClone throws on functions — context.variables should never contain functions (verified)
- [x] B2.3 — Increase MAX_BRANCHES from 5 to 10 in BOTH handlers (line 4 and line 8)
  - Also updated existing tests: parallel-handler.test.ts (12 branches → expect 10), parallel-streaming-handler.test.ts (13 branches → expect 10)
- [x] B2.4 — Write tests for context isolation (branch A writes nested variable, branch B doesn't see it)
  - 6 tests in `parallel-context-isolation.test.ts`: variable isolation, original untouched, deep nested, arrays, MAX_BRANCHES=10, Date isolation

**Files to modify:**
- `src/lib/runtime/handlers/parallel-handler.ts` (structuredClone + MAX_BRANCHES)
- `src/lib/runtime/handlers/parallel-streaming-handler.ts` (structuredClone + MAX_BRANCHES)

**Estimated effort:** Low (0.5 day)
**Impact:** Prevents context pollution between parallel branches — correctness bug fix

---

### B3. Ecomode Enhancement for `cost_monitor`

> **Gap**: cost_monitor adaptive mode already has tier downgrade at 60/80/95%.
> OMC Ecomode additionally routes each sub-task to the cheapest capable model
> automatically, achieving 30-50% token savings.
>
> **Kontrolni ček correction (CRITICAL)**: `__model_tier_override` is SET by cost-monitor
> adaptive mode but NEVER READ by ai-response handlers! Both ai-response-handler.ts and
> ai-response-streaming-handler.ts use `(node.data.model as string) ?? DEFAULT_MODEL` and
> completely ignore `__model_tier_override`. Only plan_and_execute reads it. This means
> adaptive mode currently has NO EFFECT on regular ai_response nodes. Fix required as
> prerequisite before ecomode can work.
>
> **Kontrolni ček correction #2**: ecomode classify call should use fastest model (haiku/groq),
> not DEFAULT_MODEL, to minimize latency overhead.
>
> **Kontrolni ček correction #3**: scope is ai_response only. Other AI handlers (ai_classify,
> ai_extract, ai_summarize) are specialized and already use cheap models.

**Current state** (verified in code):
- Adaptive mode: Tier 1 (60%) -> balanced, Tier 2 (80%) -> fast, Tier 3 (95%) -> block/fast
- Sets `__model_tier_override` variable for downstream nodes
- **BUG**: ai-response handlers do NOT read `__model_tier_override` — only plan_and_execute does

**Tasks:**

- [x] B3.0 — **PREREQUISITE**: Add `__model_tier_override` reading to BOTH ai-response handlers:
  - Added `getModelByTier` import + model selection cascade: explicit model > ecomode > tier override > default
  - Same logic in both ai-response-handler.ts and ai-response-streaming-handler.ts
  - Fixes existing adaptive mode bug: `__model_tier_override` now actually affects ai_response nodes
- [x] B3.1 — Add `ecomode` to cost_monitor modes (alongside monitor/budget/alert/adaptive/enforce):
  - Sets `__ecomode_enabled = true` in context variables
  - ai-response handlers check this flag and call `classifyTaskComplexity()` before model selection
  - Uses fastest available model via `getModelByTier("fast")` for classify call
- [x] B3.2 — Created `src/lib/cost/ecomode.ts`:
  - `classifyTaskComplexity(prompt, model)` → "simple" | "moderate" | "complex"
  - `complexityToTier()` maps to fast/balanced/powerful
  - In-memory cache: hash(prompt first 200 chars) → tier, 5 min TTL, max 500 entries
  - Graceful fallback: LLM failure → "moderate"
- [ ] B3.3 — Add per-task model selection log to cost tracking output:
  - Track `{ nodeId, taskComplexity, modelUsed, tokensSaved }` per node *(deferred — needs token pricing integration)*
- [x] B3.4 — Write tests for ecomode routing and __model_tier_override fix
  - 15 tests: ecomode.test.ts (11 — classify, cache, tier mapping), ecomode-integration.test.ts (4 — cost-monitor modes)

**Files to modify:**
- `src/lib/runtime/handlers/ai-response-handler.ts` (read __model_tier_override)
- `src/lib/runtime/handlers/ai-response-streaming-handler.ts` (read __model_tier_override)
- `src/lib/runtime/handlers/cost-monitor-handler.ts` (add ecomode)
- `src/lib/cost/ecomode.ts` (NEW — classify helper)

**Estimated effort:** Medium (2 days)
**Impact:** 30-50% token cost reduction + fixes existing adaptive mode bug

---

## FAZA C — Memory Architecture Upgrade (P1 — High Impact)

Inspired by: memsearch (Zilliz), OpenClaw memory system, clawhip MEMORY.md + shards, bb25.

### C1. memsearch-Style Markdown Memory Layer

> **Gap**: AgentMemory stores JSON in PostgreSQL only. Not human-readable, not editable,
> not exportable. memsearch uses Markdown files as source of truth with vector index
> as cache. OpenClaw uses MEMORY.md index + memory/ shards for hot/cold tiers.

**Current state** (verified in code — kontrolni ček 2026-04-04):
- `AgentMemory` model: `key`, `value (String)`, `category`, `importance`, `embedding (vector 1536)`, `accessCount`, `accessedAt`
- Two fully-implemented handler nodes exist:
  - `memory-write-handler.ts` (253 lines) — 5 merge strategies (replace, merge_object, deep_merge, append_array, increment), auto-eviction at 1000 limit, async embedding generation
  - `memory-read-handler.ts` (300 lines) — 3 modes: key lookup, category filter, vector-semantic search with HNSW acceleration, fallback to text search
- No hot/cold tier distinction (separate optimization layer needed)
- No markdown export or import
- No human-editable UI (no Memory tab/page exists)
- No automatic memory injection into context before AI nodes — engine.ts does NOT load AgentMemory on flow start
- HNSW index exists: `agentmemory_embedding_hnsw_idx` (vector_cosine_ops, m=16, ef_construction=64)

**Tasks:**

- [x] C1.1 — Created `src/lib/memory/markdown-export.ts`:
  - `exportAgentMemoryAsMarkdown(agentId)` — MEMORY.md with hot section + per-category grouping
  - `exportMemoryShards(agentId)` — per-category shard files (Map<filename, content>)
  - `parseMemoryMarkdown(markdown)` — parses `- **key** [category]: value _(importance: 0.95, accessed: 2h ago)_` format
  - `importMemoryFromMarkdown(agentId, markdown)` — upserts parsed entries, returns { imported, skipped }
- [x] C1.2 — Created `src/lib/memory/hot-cold-tier.ts`:
  - `getHotMemories(agentId, limit=10)` — composite score: importance×0.4 + recency×0.35 + frequency×0.25
  - `getColdMemories(agentId, query)` — HNSW vector search, 0.3 similarity threshold
  - `injectHotMemoryIntoContext(context)` — sets `__hot_memory` variable, swallows errors
  - `formatHotMemoryForContext(memories)` — markdown list under "## Agent Memory (active context)"
  - Hot criteria: accessed in 24h OR importance > 0.8 OR accessCount > 10
- [x] C1.3 — Integrated hot memory injection into engine.ts and engine-streaming.ts:
  - `injectHotMemoryIntoContext(context)` called before first node, after hooks init
  - `__hot_memory` consumed by ai-response handlers, prepended to effectiveSystemPrompt
- [x] C1.4 — Created Memory UI at `/memory/[agentId]` page:
  - SWR data fetching, search filter, category filter, edit/delete dialogs
  - Hot memories: Flame icon + amber styling; Cold: Snowflake icon + blue
  - Export/Import buttons, Memory link on agent cards (Brain icon)
- [x] C1.5 — API routes:
  - `GET /api/agents/[agentId]/memory` — paginated list with category filter + sort
  - `PATCH /api/agents/[agentId]/memory/[memoryId]` — edit value/category/importance
  - `DELETE /api/agents/[agentId]/memory/[memoryId]` — delete with ownership check
  - `GET /api/agents/[agentId]/memory/export` — MEMORY.md download
  - `POST /api/agents/[agentId]/memory/import` — parse + upsert, 1MB limit
- [x] C1.6 — Tests: 32 tests (16 hot-cold-tier + 16 markdown-export), all passing

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

- [x] C2.1 — Added `compositionLayer String @default("execution")` + `@@index([compositionLayer])` to Skill model
- [x] C2.2 — Created `src/lib/ecc/skill-composer.ts`:
  - `composeSkillPipeline(agentId, taskSkillId?)` — raw SQL query (compositionLayer not in generated types), orders guarantee → enhancement → execution, then by name
  - `formatSkillPipelineForPrompt(skills)` — XML `<skill_pipeline>` with per-layer sections, 2000-char truncation
  - `getGuaranteeSkills(agentId)` — lightweight guarantee-only call
  - `validateLayer(raw)` — defaults unknown to "execution"
- [x] C2.3 — Integrated skill composition into both AI response handlers:
  - Skill pipeline injected between hot memory and safety check in effectiveSystemPrompt
  - Non-fatal: composition failure is caught and logged, never blocks AI call
- [x] C2.4 — Skills Browser UI: composition layer badge (red=guarantee, blue=enhancement, hidden for execution)
  - Skills API augmented with compositionLayer via raw SQL + merge (generated types pending)
- [x] C2.5 — Prisma schema updated (applied via `pnpm db:push`)
- [x] C2.6 — Tests: 16 tests in `skill-composer.test.ts` (pipeline ordering, layer enforcement, formatting, truncation, error handling, validateLayer)

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

**Current state** (verified in code — kontrolni ček 2026-04-04):
- `search.ts` line 282-289: `reciprocalRankFusion()` with k=60, default weights 0.5/0.5 in function signature
- Weights overridden by `KnowledgeBase.hybridAlpha` (default 0.7 semantic / 0.3 keyword) — already configurable per-KB
- Contextual Enrichment enabled → semantic weight auto-bumped to 0.8 (line 489)
- Post-fusion: min-max normalization via `normalizeRRFScores()` (line 315-325)
- `hybridAlpha` IS already used: `search.ts` line 491 reads from kbConfig
- No `fusionStrategy` field yet — RRF is the only fusion strategy (Bayesian is future work)

**Tasks:**

- [x] C3.1 — Decision: Option B — ported Bayesian calibration to TypeScript (no Python subprocess needed)
  - Sigmoid transform: `P(relevant | rank) = 1 / (1 + exp(-(a - b * rank)))` with a=2.0, b=0.15
  - Tuned for typical BM25 rank distributions, graceful decay at high ranks
- [x] C3.2 — Added `fusionStrategy String @default("rrf")` to KnowledgeBase model:
  - Added to `kbConfigUpdateSchema` and `kbConfigResponseSchema` in `src/lib/schemas/kb-config.ts`
  - Fetched via raw SQL in `loadKBConfig()` (generated types pending)
- [x] C3.3 — Implemented `bayesianFusion()` in `search.ts`:
  - Sigmoid calibration of BM25 rank → posterior probability (0-1 range, no normalization needed)
  - Weighted sum fusion: `semanticWeight * cosineScore + keywordWeight * calibratedKeywordScore`
  - Activated when `kbConfig.fusionStrategy === "bayesian"`, applied in both `hybridSearch()` and `runSingleSearch()`
- [ ] C3.4 — Benchmark: deferred (requires production data for meaningful NDCG/MRR comparison)
- [x] C3.5 — Tests: 11 tests in `bayesian-fusion.test.ts` (empty inputs, merge, sigmoid decay, weights, metadata preservation)

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
>
> **Kontrolni ček (2026-04-04):**
> - TASKS.md originally specified "run each command via sandbox (code_interpreter or python_code handler)"
>   but both sandboxes block os/subprocess imports. `execFile` with whitelist is the correct approach,
>   identical to A3.2's design deviation.
> - `ShieldCheck` icon is already used by `guardrails` node — use `CircleCheckBig` instead.
> - `validateCommand()` and `runVerificationCommands()` in reflexive-loop-handler.ts are private.
>   Must extract to shared module before D1.1 can import them.

**Tasks:**

- [x] D0 — **PREREQUISITE**: Extract `validateCommand()` + `runVerificationCommands()` from
  `reflexive-loop-handler.ts` → `src/lib/runtime/verification-commands.ts` (shared module).
  Both `reflexive-loop-handler.ts` and new `verification-handler.ts` import from shared module.
- [x] D1.1 — Create `src/lib/runtime/handlers/verification-handler.ts`:
  - New node type: `verification`
  - Config: `checks: Array<{ type: "build" | "test" | "lint" | "custom", command: string, label?: string }>`
  - Execution: `execFile` + whitelist (imports from `verification-commands.ts`)
  - Per-check timeout: 60s, overall timeout: 300s
  - Output variable: `verificationResults: Array<{ type, command, label, exitCode, output, durationMs }>`
  - Routes: `findNextNode(context, node.id, "passed")` or `findNextNode(context, node.id, "failed")`
  - **Design deviation**: Uses `execFile` (not sandbox) — same rationale as A3.2
- [x] D1.2 — Register `verification` node type:
  - `src/types/index.ts` → add `"verification"` to NodeType union
  - `src/lib/validators/flow-content.ts` → add to NODE_TYPES array
  - `src/lib/runtime/handlers/index.ts` → register handler
  - `src/components/builder/flow-builder.tsx` → add to NODE_TYPES map
  - Do NOT add to SELF_ROUTING_NODES (uses sourceHandles via findNextNode)
- [x] D1.3 — Create `src/components/builder/nodes/verification-node.tsx`:
  - Icon: `CircleCheckBig` (NOT ShieldCheck — already used by guardrails)
  - Theme: green (`bg-green-950 border-green-600`)
  - Shows: list of checks with type badges
- [x] D1.4 — Add to node picker + property panel:
  - Node picker: category `"utilities"` (alongside guardrails), count 56→57
  - Property panel: checks CRUD (add/remove/edit rows), command + label input
  - OUTPUT_VAR_TYPES: add `"verification"`
  - Mock `CircleCheckBig` in `node-picker.test.tsx`, update counts
- [x] D1.5 — Starter flow template `"verification-pipeline"` in `src/data/starter-flows.ts`:
  - `ai_response` → `verification` (checks: npm run build, npm run test) → passed: end / failed: ai_response (fix)
- [x] D1.6 — Tests:
  - `src/lib/runtime/__tests__/verification-commands.test.ts` — shared module (whitelist, metachar blocking)
  - `src/lib/runtime/handlers/__tests__/verification-handler.test.ts` — handler (all pass → passed, one fail → failed, timeout, empty checks → passed, output variable)

**Files to create/modify:**
- `src/lib/runtime/verification-commands.ts` (NEW — extracted from reflexive-loop-handler)
- `src/lib/runtime/handlers/reflexive-loop-handler.ts` (MODIFIED — import from shared module)
- `src/lib/runtime/handlers/verification-handler.ts` (NEW)
- `src/types/index.ts` (add to NodeType union)
- `src/lib/validators/flow-content.ts` (add to NODE_TYPES)
- `src/lib/runtime/handlers/index.ts` (register)
- `src/components/builder/flow-builder.tsx` (add to NODE_TYPES map)
- `src/components/builder/nodes/verification-node.tsx` (NEW)
- `src/components/builder/node-picker.tsx` (add node definition)
- `src/components/builder/property-panel.tsx` (add property editor)
- `src/data/starter-flows.ts` (new template)

**Estimated effort:** Medium (2-3 days)
**Impact:** Agents can verify their own work with real commands — production quality

---

### D2. Cross-Provider Orchestration

> **Gap**: `call_agent` handler calls sibling agents but they all use the same
> provider ecosystem. OMC's `omc ask` sends tasks to Claude, Codex, and Gemini
> separately and synthesizes results. OMC's `ccg` skill fans out to Codex+Gemini
> with Claude synthesizing.
>
> **Kontrolni ček (2026-04-04):**
> - `providerOverride` must be applied to CALLEE's FlowContent.nodes (not caller's).
>   Mechanism: same as `evalModelOverride` in chat route.ts lines 209-215 — override
>   `data.model` on all `ai_response` nodes in-memory before sub-engine execution.
>   call-agent-handler.ts already loads callee FlowContent via `parseFlowContent()`.
> - Starter flow should use `ai_response` nodes with different `data.model` values
>   (not `call_agent` — would require pre-existing agents). Works out-of-the-box.
> - Provider availability: `getModel(providerOverride)` throws if API key missing.
>   Handler must catch and fall back to callee's original model.

**Tasks:**

- [x] D2.1 — Add `providerOverride` option to `call_agent` handler:
  - New config field: `providerOverride?: string` (model ID)
  - In internal mode: after loading calleeFlowContent, override `data.model` on all
    `ai_response` nodes in-memory (identical to chat route.ts evalModelOverride logic)
  - Log audit with `providerOverride` value for traceability
  - Graceful fallback: if providerOverride model unavailable, log warning and use original
- [x] D2.2 — Create `"cross-provider-synthesis"` starter flow in `src/data/starter-flows.ts`:
  - `message` → `parallel` (3 branches, each `ai_response` with different model: claude-sonnet-4-6,
    deepseek-chat, gemini-2.5-flash) → `ai_response` (synthesizer, merges outputs) → `end`
  - No `call_agent` dependency — works without pre-existing agents
- [x] D2.3 — Property panel: add `Provider Override` select to `call_agent` node editor:
  - Model dropdown (nullable — "Use agent default" option)
  - Provider badge shown next to selected agent when providerOverride is set
- [x] D2.4 — Tests in `src/lib/runtime/handlers/__tests__/cross-provider.test.ts`:
  - providerOverride applied to callee's ai_response nodes
  - Without providerOverride — original model unchanged
  - Override does not persist to DB
  - Fallback when override model unavailable (missing API key)

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

- [x] E1.1 — Define `SessionEventType` in `src/lib/runtime/types.ts`:
  - `session.started` | `session.blocked` | `session.finished` | `session.failed` |
    `session.timeout` | `session.verification_passed` | `session.verification_failed`
- [x] E1.2 — Emit session events from engine.ts and engine-streaming.ts:
  - `session.started` at flow start
  - `session.finished` at successful flow end
  - `session.failed` on flow error
  - `session.timeout` on MAX_ITERATIONS hit
  - `session.blocked` on human_approval waitForInput
- [x] E1.3 — Auto-fire notifications for session events (configurable per agent):
  - Agent config: `sessionNotifications: { events: SessionEventType[], channel: "webhook" | "in_app", webhookUrl?: string }`
- [x] E1.4 — Add Discord and Slack webhook presets to notification config:
  - Discord: format message with embed (title, color by event type, fields)
  - Slack: format as Block Kit message
- [x] E1.5 — Write tests for each session event type emission

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

- [x] E2.1 — Refactor notification-handler.ts into renderer + sink pattern:
  - `NotificationRenderer` interface: `render(event, options) -> RenderedMessage`
  - `NotificationSink` interface: `deliver(rendered, config) -> DeliveryResult`
- [x] E2.2 — Create renderers:
  - `PlainTextRenderer` — current behavior
  - `DiscordRenderer` — Discord embed format (rich)
  - `SlackRenderer` — Slack Block Kit format (mrkdwn)
  - `MarkdownRenderer` — for in-app display
- [x] E2.3 — Create sinks:
  - `WebhookSink` — current HTTP POST behavior
  - `InAppSink` — current in-app behavior
  - `LogSink` — current logger behavior
- [x] E2.4 — Config: `{ renderer: "plain" | "discord" | "slack" | "markdown", sink: "webhook" | "in_app" | "log" }`
- [x] E2.5 — Write tests for each renderer x sink combination

**Files to modify:**
- `src/lib/runtime/handlers/notification-handler.ts` (refactor)
- `src/lib/notifications/renderers/` (NEW directory)
- `src/lib/notifications/sinks/` (NEW directory)

**Estimated effort:** Medium (2-3 days)
**Impact:** Extensible notification system — easy to add Telegram, email, Teams, etc.

---

## FAZA F — Advanced Capabilities (P3 — Long Term)

> **Redosled implementacije:** F3 → F2 → F1 (najlakše → najteže, sve tri su međusobno nezavisne)
> **Kontrolni ček datum:** 2026-04-04 — sve pretpostavke verifikovane čitanjem koda

---

### F3. Dynamic Skill Injection (Context-Aware)

> **Gap**: ECC skills are loaded statically via `composeSkillPipeline()` (C2.3).
> claw-code/clawhip approach: auto-detect which skill is relevant for the current
> task and inject ONLY that skill. Reduces context bloat dramatically.
>
> **Kontrolni ček (2026-04-04):**
> - `Skill` model has NO embedding field — cache embeddings in memory + Redis,
>   key prefix `"skill-emb:"`, TTL 600s (same pattern as `embedding-cache.ts`).
> - `generateEmbedding(text)` from `embeddings.ts` is directly reusable for single strings.
> - `cosineSimilarity(a, b)` from `src/lib/evals/semantic.ts` is exported and handles
>   all edge cases — directly reusable, no duplication needed.
> - C2.3 `composeSkillPipeline()` is called WITHOUT any `isECCEnabled()` guard in BOTH
>   ai-response handlers. F3 must REPLACE step 5 (skill composition), not add a new step.
>   Logic: `if (isECCEnabled() && routedSkills.length > 0)` → use dynamic;
>   else → fall back to `composeSkillPipeline()` (C2.3 static pipeline).
> - Injection point is step 5 in system prompt assembly (after hot memory).
> - `acquireEmbeddingSemaphore()` must be respected — batch skill embeddings
>   sequentially on first load, NOT Promise.all for 60 skills simultaneously.
> - Scope: ONLY `ai-response-handler.ts` and `ai-response-streaming-handler.ts`.

**Tasks:**

- [x] F3.1 — Create `src/lib/ecc/skill-router.ts`:
  - `getCachedSkillEmbedding(skillId, description)` → `number[]` — in-memory Map + Redis 600s TTL
  - `routeToSkill(prompt, agentId, topN=3)` → `Promise<Skill[]>` — cosine similarity, threshold 0.35
  - `invalidateSkillCache(skillId)` — call on skill update/delete
  - Uses `generateEmbedding()` from `embeddings.ts`, `cosineSimilarity()` from `semantic.ts`
  - Respects `acquireEmbeddingSemaphore()` / `releaseEmbeddingSemaphore()` for batch init
  - Guard: `isECCEnabled()` returns `[]` immediately when ECC disabled
- [x] F3.2 — Integrate into both ai-response handlers (step 5 replacement):
  - `if (isECCEnabled() && routedSkills.length > 0)` → inject routed skills
  - else → fall back to `composeSkillPipeline()` (non-breaking, C2.3 preserved)
  - Non-fatal: router error always falls back to static, never blocks AI call
- [x] F3.3 — Tests (12 tests):
  - `src/lib/ecc/__tests__/skill-router.test.ts` — cache hit/miss, cosine threshold, topN,
    ECC disabled → `[]`, error swallowing, semaphore, invalidation
  - `src/lib/ecc/__tests__/skill-router-integration.test.ts` — handler uses routed skills,
    fallback to static composition on empty result, no injection when ECC off

**Files to create/modify:**
- `src/lib/ecc/skill-router.ts` (NEW)
- `src/lib/runtime/handlers/ai-response-handler.ts` (replace step 5)
- `src/lib/runtime/handlers/ai-response-streaming-handler.ts` (replace step 5)

**Estimated effort:** Medium (2-3 days)
**Impact:** Less context bloat, more relevant skill context — quality + cost improvement

---

### F2. AST-Grep Pattern Matching

> **Gap**: No AST-level code analysis. OMC integrates ast-grep for precise
> pattern matching and refactoring via syntax trees.
>
> **Kontrolni ček (2026-04-04):**
> - `code-interpreter-handler.ts` has NO `mode` field — safe to add
>   `"eval" | "ast_match" | "ast_replace"` with default `"eval"` (existing behavior unchanged).
> - `GitBranch` icon is TAKEN (Logic category + 2 node definitions). Use `Braces` for `ast_transform`.
> - `Code2` icon is TAKEN (1 node). `Braces`, `TreePine`, `FileCode` are all free.
> - `code_interpreter` is NOT in `OUTPUT_VAR_TYPES` set — existing bug. Fix alongside F2 work.
> - `@ast-grep/napi` is a Rust native addon — use dynamic `import()` with try/catch,
>   never top-level require. Graceful fallback: return `[]` / original code if unavailable.
> - `ast_transform` is NOT self-routing — standard `nextNodeId`, NOT in `SELF_ROUTING_NODES`.
> - Node count baseline: **57** (verified). `ast_transform` = node **58**.

**Tasks:**

- [x] F2.1 — Add `@ast-grep/napi` as optional dependency (`pnpm add @ast-grep/napi`)
- [x] F2.2 — Create `src/lib/ast/pattern-matcher.ts`:
  - `loadAstGrep()` → module | null — dynamic import, try/catch, logger.warn on fail
  - `isAstGrepAvailable()` → boolean
  - `matchPattern(code, pattern, language: SgLang)` → `AstMatch[]` — graceful `[]` if unavailable
  - `replacePattern(code, pattern, replacement, language)` → string — returns original if unavailable
  - `getSupportedLanguages()` → `SgLang[]`
  - `SgLang = "TypeScript" | "JavaScript" | "Python" | "Rust" | "Go" | "Java" | "Css" | "Html"`
  - `AstMatch = { text, range: { start, end }, metaVariables: Record<string,string> }`
- [x] F2.3 — Extend `code-interpreter-handler.ts`:
  - New `mode` field: `"eval" | "ast_match" | "ast_replace"` (default `"eval"`)
  - New fields: `pattern?: string`, `replacement?: string`, `language?: SgLang`
  - `ast_match` output: `{ matches: AstMatch[], count: number }`
  - `ast_replace` output: `{ result: string, originalLength: number, newLength: number }`
  - Fallback: if ast-grep unavailable and mode != `"eval"` → return warning in output
- [x] F2.4 — Create `ast_transform` node type (58th):
  - Config: `operation: "match" | "replace"`, `pattern`, `replacement?`, `language`,
    `inputVariable`, `outputVariable`
  - Icon: `Braces` (FREE — verified), theme: purple (`bg-purple-950 border-purple-600`)
  - Register in: `types/index.ts`, `flow-content.ts`, `handlers/index.ts`, `flow-builder.tsx`
  - NOT in `SELF_ROUTING_NODES`
  - Add `"ast_transform"` to `OUTPUT_VAR_TYPES`; also add missing `"code_interpreter"` (bug fix)
- [x] F2.5 — Update node picker + property panel + tests:
  - `node-picker.tsx`: add `ast_transform` to utilities (57→58, utilities 8→9, import `Braces`)
  - `property-panel.tsx`: `AstTransformProperties` + `mode/pattern/replacement` for code_interpreter
  - `node-picker.test.tsx`: count 57→58, add `"Braces"` to lucide mock (55→56 icons)
- [x] F2.6 — Tests (20 tests):
  - `src/lib/ast/__tests__/pattern-matcher.test.ts` — match/replace, graceful unavailable,
    metaVariables capture, all language enum values, empty input, invalid pattern
  - `src/lib/runtime/handlers/__tests__/ast-transform-handler.test.ts` — match/replace operations,
    inputVariable resolution, outputVariable set, error never throws

**Files to create/modify:**
- `src/lib/ast/pattern-matcher.ts` (NEW)
- `src/lib/runtime/handlers/ast-transform-handler.ts` (NEW)
- `src/lib/runtime/handlers/code-interpreter-handler.ts` (add mode field)
- `src/types/index.ts` (add `"ast_transform"`)
- `src/lib/validators/flow-content.ts` (add to NODE_TYPES array)
- `src/lib/runtime/handlers/index.ts` (register handler)
- `src/components/builder/nodes/ast-transform-node.tsx` (NEW — Braces icon, purple)
- `src/components/builder/flow-builder.tsx` (add to NODE_TYPES map)
- `src/components/builder/node-picker.tsx` (count 57→58, Braces import)
- `src/components/builder/property-panel.tsx` (AstTransformProperties, OUTPUT_VAR_TYPES fix)
- `src/components/builder/__tests__/node-picker.test.tsx` (count 57→58, Braces mock)

**Estimated effort:** Medium (3-4 days)
**Impact:** Precise code transformations — quality improvement for code agents

---

### F1. LSP Integration for Code-Aware Agents

> **Gap**: No Language Server Protocol support. OMC has real LSP integration with
> 15s timeout for semantic analysis, go-to-definition, find-references, rename-symbol.
>
> **Kontrolni ček (2026-04-04):**
> - Use `typescript-language-server` (standard LSP over stdio, wraps tsserver).
>   NOT `tsserver` directly (non-standard protocol).
>   NOT `vscode-languageclient` (designed for VS Code extension context, not Node standalone).
>   Package for types: `vscode-languageserver-protocol` (LSP message types only).
> - Railway uses Dockerfile builder (`railway.toml: builder = "DOCKERFILE"`).
>   Add `typescript-language-server` to Dockerfile RUN step.
>   `nixpacks.toml` is NOT active when Dockerfile builder is used.
> - LSP pool: MAX_LSP_CONNECTIONS = **3** (NOT 5 — tsserver uses 200-500MB RAM each).
>   Idle TTL = 300s. Cleanup interval = 30s (more aggressive than MCP's 60s — LSP is expensive).
>   Pattern: replicate `src/lib/mcp/pool.ts` (LRU, dead detection, SIGTERM shutdown, Redis tracking).
> - `spawn` for persistent stdio process — same pattern as `cli-session-manager.ts`.
> - LSP `initialize` handshake timeout: **30s** (not 15s — tsserver is slow on cold start).
>   Operation timeout: 15s per request. Cache initialized connection in pool.
> - Security: `validateWorkspacePath(path, agentId)` — only `/tmp/agent-{agentId}/` allowed,
>   block `..` path traversal. Analogous to `validateExternalUrlWithDNS()` for file system.
> - `Code2` icon is TAKEN. Use `FileSearch` for `lsp_query` (FREE — verified).
> - `lsp_query` NOT in `SELF_ROUTING_NODES` — standard nextNodeId routing.
> - Node count: depends on F2. If F2 done first: `lsp_query` = 59th. Standalone: 58th.
> - MVP scope: TypeScript/JavaScript only. Python (pylsp) = future work.

**Tasks:**

- [x] F1.1 — Package setup + Dockerfile:
  - `pnpm add vscode-languageserver-protocol`
  - Add `RUN npm install -g typescript-language-server typescript` to Dockerfile
- [x] F1.2 — Create LSP infrastructure (`src/lib/lsp/`):
  - `src/lib/lsp/types.ts` — LSP type re-exports + local interfaces (`LSPConnection`, `LSPQueryResult`)
  - `src/lib/lsp/pool.ts` — `LSPConnectionPool`: MAX=3, TTL=300s, cleanup=30s, LRU eviction,
    SIGTERM graceful shutdown, dead connection detection. Pattern: `src/lib/mcp/pool.ts`.
  - `src/lib/lsp/client.ts`:
    - `startLSPServer(agentId, workspacePath)` — spawn `typescript-language-server --stdio`,
      `initialize` with 30s timeout, store in pool
    - `getDefinition(agentId, file, line, character)` → `Location[]` — 15s timeout
    - `getReferences(agentId, file, line, character)` → `Location[]` — 15s timeout
    - `getDiagnostics(agentId, file, content)` → `Diagnostic[]` — 15s timeout
    - `hoverInfo(agentId, file, line, character)` → `string` — 15s timeout
    - `stopLSPServer(agentId)` — evict from pool
    - `validateWorkspacePath(path, agentId)` — security guard
- [x] F1.3 — Create `lsp_query` node type (58th or 59th — current+1):
  - Config: `operation: "definition" | "references" | "diagnostics" | "hover"`,
    `fileVariable`, `contentVariable?`, `lineVariable?`, `characterVariable?`, `outputVariable`
  - Icon: `FileSearch` (FREE — verified), theme: violet (`bg-violet-950 border-violet-600`)
  - Sets `__lsp_context` variable with formatted LSP result
  - Register in: `types/index.ts`, `flow-content.ts`, `handlers/index.ts`, `flow-builder.tsx`
  - NOT in `SELF_ROUTING_NODES`; add `"lsp_query"` to `OUTPUT_VAR_TYPES`
- [x] F1.4 — Integrate LSP context into ai_response handlers:
  - Check `context.variables["__lsp_context"]` — if set, prepend `<lsp_context>...</lsp_context>`
  - Non-fatal: missing variable → no change to prompt
- [x] F1.5 — Update node picker + property panel + tests:
  - `node-picker.tsx`: add `lsp_query` to utilities (count +1, import `FileSearch`)
  - `property-panel.tsx`: `LSPQueryProperties` component
  - `node-picker.test.tsx`: count +1, add `"FileSearch"` to lucide mock (+1 icon)
- [x] F1.6 — Tests (25 tests):
  - `src/lib/lsp/__tests__/client.test.ts` — mock LSP server over stdio: initialize handshake,
    all 4 operations, 15s timeout enforcement, pool LRU eviction, dead connection cleanup,
    validateWorkspacePath blocks `..` traversal
  - `src/lib/runtime/handlers/__tests__/lsp-query-handler.test.ts` — all 4 operations,
    missing variables graceful fallback, `__lsp_context` set correctly, handler never throws

**Files to create/modify:**
- `src/lib/lsp/types.ts` (NEW)
- `src/lib/lsp/pool.ts` (NEW)
- `src/lib/lsp/client.ts` (NEW)
- `src/lib/runtime/handlers/lsp-query-handler.ts` (NEW)
- `src/types/index.ts` (add `"lsp_query"`)
- `src/lib/validators/flow-content.ts` (add to NODE_TYPES)
- `src/lib/runtime/handlers/index.ts` (register)
- `src/components/builder/nodes/lsp-query-node.tsx` (NEW — FileSearch icon, violet)
- `src/components/builder/flow-builder.tsx` (add to NODE_TYPES map)
- `src/components/builder/node-picker.tsx` (count +1, FileSearch import)
- `src/components/builder/property-panel.tsx` (LSPQueryProperties, OUTPUT_VAR_TYPES)
- `src/components/builder/__tests__/node-picker.test.tsx` (count +1, FileSearch mock)
- `Dockerfile` (add typescript-language-server RUN step)

**Estimated effort:** High (7-10 days)
**Impact:** ENORMOUS for developer agents — semantic code understanding

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
