# Multi-Agent Orchestration Improvement Plan — Final Version

**Date:** 2026-03-28
**Status:** Ready for Implementation
**Author:** Claude (AI) + buky (review)

---

## Executive Summary

This plan upgrades agent-studio's multi-agent orchestration from static routing to intelligent,
cost-optimized, self-correcting pipelines. It builds on the existing infrastructure (53 node
handlers, agent-as-tool, A2A protocol, circuit breaker, parallel execution) without replacing
anything — only adding new capabilities and connecting existing ones.

**Expected outcomes:**
- 40-60% cost reduction via heterogeneous model routing
- Higher output quality via reflexive self-correction loops
- Full observability via agent performance dashboard
- Interoperability via A2A v0.3 compliance

---

## Current State Analysis

### What Already Works Well
| Capability | Implementation | Status |
|---|---|---|
| Agent-as-Tool | `agent-tools.ts` — 10 sibling agents as AI SDK tools | ✅ Production |
| Parallel Execution | `parallel-handler.ts` — 5 branches, allSettled, merge strategies | ✅ Production |
| Circuit Breaker | `circuit-breaker.ts` — CLOSED/OPEN/HALF_OPEN, 3-failure threshold | ✅ Production |
| Rate Limiting | `rate-limiter.ts` — 60 calls/min per user+agent | ✅ Production |
| Depth/Cycle Detection | Max 10 depth, callStack tracking, JSON-RPC error codes | ✅ Production |
| Cost Tracking | `cost-monitor-handler.ts` — monitor/budget/alert modes | ✅ Production |
| Semantic Routing | `semantic-router-handler.ts` — LLM intent classification | ✅ Production |
| Trajectory Evaluation | `trajectory-evaluator-handler.ts` — execution path scoring | ✅ Production |
| Meta-Orchestrator | `meta-orchestrator.ts` — keyword-based task routing, 13 types | ✅ Production |
| A/B Testing | `ab-test-handler.ts` — weighted traffic splitting | ✅ Production |
| Retry | `retry-handler.ts` — exponential backoff with jitter | ✅ Production |
| Evaluator | `evaluator-handler.ts` — LLM scoring against criteria | ✅ Production |
| Call Monitoring | `agent-call-monitor.tsx` — metrics, charts, circuit state | ✅ Production |
| Model Catalog | `models.ts` — 18 models, 7 providers, fast/balanced/powerful tiers | ✅ Production |
| Token Pricing | `token-pricing.ts` — per-model USD/1M token rates | ✅ Production |
| Distributed Tracing | AgentCallLog with traceId, spanId, parentSpanId | ✅ Production |

### What's Missing (Gaps Identified)
| Gap | Impact | Addressed In |
|---|---|---|
| Model selection is static per node — no dynamic tier routing | No cost optimization | Phase 1 |
| Meta-orchestrator uses keyword matching, not LLM analysis | Poor task classification | Phase 1 |
| Cost monitor can't influence model selection | Spend tracking without action | Phase 1 |
| No model fallback chain on failure | Single point of failure | Phase 1 |
| Retry handler doesn't check quality (only errors) | Low quality passes through | Phase 2 |
| Evaluator and retry aren't composable | Can't self-correct | Phase 2 |
| No aggregated agent performance metrics over time | Can't optimize routing | Phase 3 |
| AgentCallLog raw data not summarized | Dashboard gaps | Phase 3 |
| A2A card lacks security signing | Trust verification missing | Phase 4 |
| No starter flow template for Plan-and-Execute | Users can't learn pattern | Phase 1 |
| Parallel handler max 5 branches (may limit plan decomposition) | Plan-and-Execute constrained | Phase 1 |

---

## Phase 1: Heterogeneous Model Routing (Plan-and-Execute Pattern)

**Goal:** A powerful model plans, cheap models execute. 40-60% cost reduction.
**Effort:** ~3-4 days
**Risk:** Low — additive, no breaking changes

### 1.1 New Node: `plan_and_execute`

**File:** `src/lib/runtime/handlers/plan-and-execute-handler.ts`

This is a compound node that:
1. Takes user input + context
2. Calls a **powerful** model (configurable, default: `deepseek-reasoner`) to decompose into sub-tasks
3. For each sub-task, selects a model tier based on complexity
4. Executes sub-tasks sequentially or in parallel (configurable)
5. Aggregates results back to the planner for final synthesis

**Plan Schema (Zod):**
```typescript
const SubTaskSchema = z.object({
  id: z.string(),
  description: z.string(),
  complexity: z.enum(["simple", "moderate", "complex"]),
  dependencies: z.array(z.string()).default([]),  // other subtask IDs
  requiredCapabilities: z.array(z.string()).optional(), // "code", "analysis", "creative"
});

const ExecutionPlanSchema = z.object({
  goal: z.string(),
  subtasks: z.array(SubTaskSchema),
  executionStrategy: z.enum(["sequential", "parallel", "dependency_graph"]),
  reasoning: z.string(),
});
```

**Model Tier Selection Logic:**
```
simple    → fast tier    (DeepSeek V3, GPT-4.1 Mini, Haiku)     ~$0.10-0.40/M tokens
moderate  → balanced tier (DeepSeek R1, GPT-4.1, Sonnet)         ~$1-4/M tokens
complex   → powerful tier (o3, Opus, Gemini Pro)                  ~$10-15/M tokens
```

**Planner always uses powerful tier** (it's the most critical step — bad plans waste more money than the model costs).

**Node Configuration (property panel):**
```typescript
interface PlanAndExecuteConfig {
  plannerModel: string;           // default: "deepseek-reasoner"
  maxSubtasks: number;            // default: 8, max: 12
  executionStrategy: "sequential" | "parallel" | "auto"; // auto = use plan's recommendation
  tierOverrides?: Record<string, string>;  // force specific model per complexity
  enableSynthesis: boolean;       // default: true — planner summarizes results
  timeoutPerSubtask: number;      // default: 30000ms
  parallelLimit: number;          // default: 5 (matches existing parallel handler)
}
```

**Implementation Steps:**
1. Create `plan-and-execute-handler.ts` with `generateObject()` for planning step
2. Use `getModelByTier(complexity)` helper (new function in `ai.ts`)
3. Execute sub-tasks via existing `generateText()` / `streamText()`
4. Route to `done` or `failed` sourceHandle
5. Store plan + results in `${outputVariable}`

### 1.2 Model Tier Router — New Helper in `ai.ts`

**Add to `src/lib/ai.ts`:**
```typescript
export function getModelByTier(
  tier: "fast" | "balanced" | "powerful",
  preferredProvider?: string
): ReturnType<typeof getModel> {
  // 1. Filter ALL_MODELS by tier
  // 2. If preferredProvider, try that first
  // 3. Fall back to available models (check env keys)
  // 4. Return first available match
}

export function getModelFallbackChain(modelId: string): string[] {
  // Returns fallback models in order: same-tier alternatives → cheaper tier
  // e.g., "claude-sonnet-4-6" → ["gpt-4.1", "deepseek-chat", "deepseek-chat"]
}
```

**Fallback chain** — When a model call fails (rate limit, timeout, 5xx):
1. Try next model in same tier (different provider)
2. If all same-tier fail, downgrade one tier
3. Log fallback event for observability
4. Never upgrade tier on fallback (cost protection)

### 1.3 Upgrade Meta-Orchestrator to LLM-Based

**File:** `src/lib/ecc/meta-orchestrator.ts` (79 lines → ~200 lines)

Current state: keyword string matching (`description.includes("security")`).
Upgrade to: `generateObject()` with structured output.

```typescript
const TaskAnalysisSchema = z.object({
  taskType: z.enum([...TASK_TYPES]),
  complexity: z.enum(["simple", "moderate", "complex"]),
  subtasks: z.array(z.object({
    description: z.string(),
    requiredAgent: z.string().optional(),
    estimatedComplexity: z.enum(["simple", "moderate", "complex"]),
  })),
  suggestedPipeline: z.array(z.string()),  // agent slugs in order
  reasoning: z.string(),
});
```

**Use a fast model** for classification (DeepSeek V3 or Haiku) — this is a routing decision,
not a complex reasoning task. Cost per classification: ~$0.001.

**Keep keyword matching as fallback** if LLM classification fails or ECC is disabled.

### 1.4 Connect Cost Monitor → Model Selection

**Modify `cost-monitor-handler.ts`** to support a new mode: `"adaptive"`.

When `mode: "adaptive"`:
- If budget usage > 60%: downgrade `complex` tasks to `balanced` tier
- If budget usage > 80%: downgrade all tasks to `fast` tier
- If budget usage > 95%: stop flow (existing `budget` behavior)

This creates a feedback loop:
```
cost_monitor(adaptive) → sets __model_tier_override in variables
  → plan_and_execute reads __model_tier_override
    → sub-tasks use downgraded tier
```

### 1.5 New Starter Flow Template

**Add to `src/data/starter-flows.ts`:**

"Plan-and-Execute Pipeline" template:
```
[Start] → [plan_and_execute] → [cost_monitor(adaptive)] → [evaluator] → [End]
                                                              ↓ (failed)
                                                         [ai_response(fix)] → [evaluator]
```

This gives users a working example of the pattern.

### 1.6 Registration Steps
1. Add `plan_and_execute` to `NodeType` union in `src/types/index.ts`
2. Register handler in `src/lib/runtime/handlers/index.ts`
3. Create node component in `src/components/builder/nodes/plan-and-execute-node.tsx`
4. Add to node picker in `node-picker.tsx`
5. Add property editor in `property-panel.tsx`
6. Write unit tests

---

## Phase 2: Reflexive Self-Correcting Node

**Goal:** Automatic quality improvement through evaluate → retry loops.
**Effort:** ~2-3 days
**Risk:** Low — composes existing handlers, no new infrastructure

### 2.1 New Node: `reflexive_loop`

**File:** `src/lib/runtime/handlers/reflexive-loop-handler.ts`

Combines evaluator + retry into a single composable node:

```
Input → Execute (ai_response) → Evaluate (quality score)
                    ↑                    ↓
                    └── Retry ←── Score < threshold?
                                         ↓ (pass)
                                       Output
```

**Node Configuration:**
```typescript
interface ReflexiveLoopConfig {
  executorModel: string;          // model for the main task
  evaluatorModel: string;         // model for quality checking (can be different/cheaper)
  maxIterations: number;          // default: 3, max: 5
  passingScore: number;           // 0-10, default: 7
  evaluationCriteria: Array<{
    name: string;
    description: string;
    weight: number;
  }>;
  improvementPrompt: string;      // template: "Previous score: {{score}}. Feedback: {{feedback}}. Improve:"
  includeHistory: boolean;        // pass previous attempts to executor (default: true)
}
```

**Key Design Decisions:**
- **Evaluator uses a different model** than executor — avoids self-bias. Recommended: if executor
  is Sonnet, evaluator should be a different provider (e.g., DeepSeek or GPT-4.1).
- **Max 5 iterations** — hard cap to prevent runaway loops and cost explosion.
- **Include history** — each retry includes previous attempts + evaluator feedback, so the
  model learns from its mistakes within the conversation.
- **Score trajectory tracking** — store `[{iteration, score, feedback}]` in output variable
  for debugging and trajectory evaluation.

### 2.2 Implementation Details

The handler internally reuses existing logic:
- `generateText()` from Vercel AI SDK (same as `ai-response-handler`)
- Evaluation prompt structure from `evaluator-handler.ts`
- Backoff timing from `retry-handler.ts`

**NOT a wrapper around other handlers** — it's a self-contained handler that uses the same
underlying AI SDK calls. This avoids handler composition complexity.

**Output variable structure:**
```typescript
{
  finalOutput: string,
  finalScore: number,
  iterations: number,
  trajectory: Array<{
    iteration: number,
    output: string,
    score: number,
    feedback: string,
    model: string,
    durationMs: number,
  }>,
  improved: boolean,  // true if score improved over iterations
}
```

### 2.3 Integration with Plan-and-Execute

The `plan_and_execute` node from Phase 1 can optionally wrap each sub-task in a reflexive
loop. Configuration:

```typescript
interface PlanAndExecuteConfig {
  // ... existing fields ...
  enableReflexiveLoop: boolean;   // default: false
  reflexiveConfig?: {
    maxIterations: number;
    passingScore: number;
    criteria: EvaluationCriteria[];
  };
}
```

When enabled, each sub-task runs through evaluate → retry before the planner sees the result.

### 2.4 Registration Steps
1. Add `reflexive_loop` to `NodeType` union
2. Register handler
3. Create node component (show iteration count + score visually)
4. Add to node picker (under "AI" category)
5. Add property editor with criteria builder (reuse from eval suite editor)
6. Write unit tests (test convergence, max iterations, score improvement)

---

## Phase 3: Agent Performance Dashboard

**Goal:** Aggregated metrics that feed intelligent routing decisions.
**Effort:** ~2-3 days
**Risk:** Very low — read-only analytics, no engine changes

### 3.1 Performance Aggregation Service

**File:** `src/lib/agents/performance-stats.ts`

Aggregate raw `AgentCallLog` data into actionable metrics:

```typescript
interface AgentPerformanceStats {
  agentId: string;
  period: "1h" | "24h" | "7d" | "30d";
  totalCalls: number;
  successRate: number;          // 0-1
  avgLatencyMs: number;
  p95LatencyMs: number;
  avgTokensPerCall: number;
  avgCostPerCall: number;       // USD
  failureReasons: Record<string, number>;  // error type → count
  modelBreakdown: Array<{
    model: string;
    calls: number;
    successRate: number;
    avgLatency: number;
  }>;
  qualityScore?: number;        // from evaluator results, if available
}
```

**Queries use raw SQL** for performance (aggregations on AgentCallLog + EvalResult tables).
Cache results in Redis (5-min TTL) or in-memory fallback.

### 3.2 API Routes

| Route | Method | Purpose |
|---|---|---|
| `/api/agent-calls/performance` | GET | Aggregated stats for all agents |
| `/api/agent-calls/performance/[agentId]` | GET | Per-agent detailed stats |
| `/api/agent-calls/performance/compare` | POST | Compare two agents head-to-head |
| `/api/agent-calls/heatmap` | GET | Agent pair interaction heatmap data |

### 3.3 Dashboard UI Enhancement

**Extend `src/components/a2a/agent-call-monitor.tsx`** with new tabs:

1. **Performance Tab** — Agent leaderboard (sortable by success rate, latency, cost)
2. **Model Efficiency Tab** — Which models perform best for which task types
3. **Cost Analysis Tab** — Spend breakdown by agent, model tier, time period
4. **Routing Insights Tab** — Meta-orchestrator routing decisions + outcomes

**Charts (recharts, already a dependency):**
- Agent success rate over time (line chart)
- Model cost vs. quality scatter plot
- Task type distribution (pie chart)
- Latency percentiles (area chart)

### 3.4 Feed Performance Data into Routing

**Modify meta-orchestrator** to consider performance history:

```typescript
async function analyzeTask(description: string, options?: {
  considerPerformance?: boolean;  // default: true
}): Promise<TaskAnalysis> {
  // 1. LLM classifies task (Phase 1 upgrade)
  // 2. Load agent performance stats from cache
  // 3. If agent A has <70% success rate, prefer agent B for same task type
  // 4. If model X is 2x cheaper with same quality, prefer model X
}
```

This creates an **adaptive routing system** that improves over time based on actual results.

---

## Phase 4: A2A v0.3 Compliance

**Goal:** Full interoperability with external agent ecosystems.
**Effort:** ~2 days
**Risk:** Low — extends existing A2A implementation

### 4.1 Agent Card v0.3 Upgrade

**Modify `src/lib/a2a/card-generator.ts`:**

Current card structure is basic. Upgrade to full v0.3 spec:

```typescript
interface AgentCardV03 {
  // Existing fields
  name: string;
  description: string;
  url: string;
  version: string;
  skills: AgentSkill[];

  // NEW v0.3 fields
  provider: {
    organization: string;
    url: string;
  };
  securitySchemes: {
    type: "bearer" | "oauth2" | "apiKey";
    description: string;
  }[];
  capabilities: {
    streaming: boolean;
    pushNotifications: boolean;
    stateTransitionHistory: boolean;
  };
  defaultInputModes: string[];   // ["text/plain", "application/json"]
  defaultOutputModes: string[];
  supportsMultiTurn: boolean;
}
```

### 4.2 Card Signing (Trust Verification)

**New file:** `src/lib/a2a/card-signing.ts`

```typescript
// Sign agent card with server's private key
export function signAgentCard(card: AgentCardV03, privateKey: string): SignedCard;

// Verify a remote agent's card signature
export function verifyCardSignature(signedCard: SignedCard, publicKey: string): boolean;

// Generate keypair for card signing
export function generateCardKeyPair(): { publicKey: string; privateKey: string };
```

**Storage:** Card signing keys stored in `AgentCard` model (add `publicKey`, `signatureHash` fields).

**Trust model:**
- Cards signed by the agent-studio instance are trusted by default
- External cards require explicit user trust approval (first-contact verification)
- Signed cards cached with 24h TTL

### 4.3 Streaming A2A Tasks

**Modify `src/lib/runtime/handlers/call-agent-handler.ts`:**

Current external A2A calls are synchronous (wait for full response).
Add streaming support for long-running tasks:

```typescript
// New: streaming A2A call
async function executeExternalAgentStreaming(
  agentCardUrl: string,
  input: string,
  writer: StreamWriter,
): Promise<string> {
  // 1. Fetch agent card
  // 2. Check capabilities.streaming
  // 3. If supported: SSE connection to remote agent
  // 4. Forward stream_delta chunks to writer
  // 5. Return final aggregated response
}
```

### 4.4 Discovery Enhancement

**Modify `GET /api/a2a/agents`:**

Add filtering by capability:
```
GET /api/a2a/agents?capability=streaming&inputMode=text/plain&skill=code-review
```

This allows external agents to discover compatible agents programmatically.

---

## Implementation Priority & Dependencies

```
Phase 1 (Week 1)          Phase 2 (Week 2)         Phase 3 (Week 2-3)      Phase 4 (Week 3)
┌─────────────────┐       ┌──────────────────┐      ┌──────────────────┐    ┌──────────────────┐
│ 1.2 Tier Router │──┐    │ 2.1 Reflexive    │      │ 3.1 Perf Stats   │    │ 4.1 Card v0.3    │
│     (ai.ts)     │  │    │     Loop Node    │      │    Service       │    │                  │
└─────────────────┘  │    └──────────────────┘      └──────────────────┘    └──────────────────┘
                     │              │                         │                       │
┌─────────────────┐  │    ┌──────────────────┐      ┌──────────────────┐    ┌──────────────────┐
│ 1.1 Plan+Execute│──┤    │ 2.3 Integration  │      │ 3.2 API Routes   │    │ 4.2 Card Signing │
│     Node        │  │    │  with Phase 1    │      │                  │    │                  │
└─────────────────┘  │    └──────────────────┘      └──────────────────┘    └──────────────────┘
                     │                               ┌──────────────────┐    ┌──────────────────┐
┌─────────────────┐  │                               │ 3.3 Dashboard UI │    │ 4.3 Streaming    │
│ 1.3 LLM Meta-  │──┤                               │                  │    │     A2A          │
│   Orchestrator  │  │                               └──────────────────┘    └──────────────────┘
└─────────────────┘  │                               ┌──────────────────┐    ┌──────────────────┐
                     │                               │ 3.4 Adaptive     │    │ 4.4 Discovery    │
┌─────────────────┐  │                               │   Routing Feed   │    │   Enhancement    │
│ 1.4 Adaptive    │──┘                               └──────────────────┘    └──────────────────┘
│  Cost Monitor   │
└─────────────────┘
┌─────────────────┐
│ 1.5 Starter Flow│
│   Template      │
└─────────────────┘
```

**Dependencies:**
- Phase 2 depends on Phase 1 (reflexive loop uses tier router for evaluator model)
- Phase 3 depends on Phase 1 (performance stats include tier routing data)
- Phase 4 is independent (can be done in parallel with Phase 3)
- Phase 3.4 depends on Phase 3.1 + Phase 1.3

---

## Files to Create/Modify

### New Files (8)
| File | Phase | Purpose |
|---|---|---|
| `src/lib/runtime/handlers/plan-and-execute-handler.ts` | 1 | Plan-and-Execute compound node |
| `src/lib/runtime/handlers/reflexive-loop-handler.ts` | 2 | Self-correcting evaluation loop |
| `src/components/builder/nodes/plan-and-execute-node.tsx` | 1 | Flow editor display component |
| `src/components/builder/nodes/reflexive-loop-node.tsx` | 2 | Flow editor display component |
| `src/lib/agents/performance-stats.ts` | 3 | Aggregation queries + caching |
| `src/lib/a2a/card-signing.ts` | 4 | Card signing + verification |
| `src/lib/runtime/handlers/__tests__/plan-and-execute-handler.test.ts` | 1 | Unit tests |
| `src/lib/runtime/handlers/__tests__/reflexive-loop-handler.test.ts` | 2 | Unit tests |

### Modified Files (14)
| File | Phase | Change |
|---|---|---|
| `src/lib/ai.ts` | 1 | Add `getModelByTier()`, `getModelFallbackChain()` |
| `src/lib/models.ts` | 1 | Export tier lookup helpers (client-safe) |
| `src/lib/ecc/meta-orchestrator.ts` | 1 | LLM-based classification upgrade |
| `src/lib/runtime/handlers/cost-monitor-handler.ts` | 1 | Add `adaptive` mode |
| `src/lib/runtime/handlers/index.ts` | 1,2 | Register 2 new handlers |
| `src/types/index.ts` | 1,2 | Add 2 new NodeType values |
| `src/components/builder/node-picker.tsx` | 1,2 | Add 2 nodes to picker |
| `src/components/builder/property-panel.tsx` | 1,2 | Add 2 property editors |
| `src/data/starter-flows.ts` | 1 | Add Plan-and-Execute template |
| `src/components/a2a/agent-call-monitor.tsx` | 3 | Add performance/cost tabs |
| `src/lib/a2a/card-generator.ts` | 4 | Upgrade to v0.3 schema |
| `src/lib/runtime/handlers/call-agent-handler.ts` | 4 | Add streaming A2A |
| `prisma/schema.prisma` | 4 | Add publicKey/signatureHash to AgentCard |
| `CLAUDE.md` | All | Document new capabilities |

### Prisma Schema Changes (Phase 4 only)
```prisma
model AgentCard {
  // ... existing fields ...
  publicKey      String?  @db.Text   // NEW: card signing public key
  signatureHash  String?             // NEW: SHA-256 of signed card
  capabilities   Json     @default("{}")  // MODIFY: structured v0.3 capabilities
}
```

---

## Cost Analysis

### Development Cost (AI tokens for implementation)
- Phase 1: ~$2-5 (LLM calls for testing plan-and-execute)
- Phase 2: ~$1-3 (reflexive loop testing with multiple iterations)
- Phase 3: ~$0 (SQL aggregation, no AI calls)
- Phase 4: ~$0.50 (card generation testing)

### Runtime Cost Impact
| Scenario | Before | After | Savings |
|---|---|---|---|
| 10-step agent pipeline (all Sonnet) | ~$0.12 | ~$0.05 (mixed tiers) | 58% |
| Code review (3 agents) | ~$0.08 | ~$0.04 (fast classifier + mixed) | 50% |
| Simple Q&A routing | ~$0.04 | ~$0.001 (Haiku classifier) | 97% |
| Complex analysis with retry | ~$0.15 | ~$0.18 (+ evaluator cost) | -20% (quality gain) |

**Net effect:** Cost reduction on routine tasks funds quality improvement on complex tasks.

---

## Testing Strategy

### Unit Tests (per phase)
- **Phase 1:** Plan generation with mocked AI, tier selection logic, fallback chain, adaptive cost monitor, meta-orchestrator classification
- **Phase 2:** Reflexive loop convergence, max iteration cap, score improvement tracking, cross-model evaluation
- **Phase 3:** SQL aggregation correctness, cache hit/miss, period filtering
- **Phase 4:** Card schema validation, signature verify/reject, streaming chunk forwarding

### Integration Tests
- Plan-and-Execute → Parallel → Aggregate → Evaluate (full pipeline)
- Reflexive loop with real evaluator (mock AI responses with known quality levels)
- Cost monitor adaptive mode triggering tier downgrade mid-flow
- A2A streaming between two local agents

### E2E Tests
- Create agent with Plan-and-Execute flow → execute → verify sub-task routing
- Dashboard shows correct performance metrics after 10+ agent calls

---

## Risk Mitigation

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| LLM plan decomposition produces poor sub-tasks | Medium | High | Evaluator catches bad sub-tasks; fallback to keyword meta-orchestrator |
| Reflexive loop infinite cost (bad criteria) | Low | High | Hard cap at 5 iterations; adaptive cost monitor kills at budget% |
| Model fallback changes output quality | Medium | Medium | Log fallback events; evaluator re-checks after fallback |
| A2A streaming connection drops | Medium | Low | Fallback to non-streaming; circuit breaker on repeated failures |
| Performance aggregation query slow on large dataset | Low | Medium | Redis cache + time-bounded queries (max 30d) |

---

## Success Metrics

| Metric | Target | Measurement |
|---|---|---|
| Average cost per agent pipeline | -40% vs. baseline | token-pricing.ts tracking |
| Meta-orchestrator routing accuracy | >85% correct task type | Manual eval on 50 diverse tasks |
| Reflexive loop quality improvement | >15% score increase after retry | trajectory data from reflexive-loop |
| Dashboard query latency | <500ms P95 | Redis cache hit rate + SQL EXPLAIN |
| A2A card generation compliance | 100% v0.3 schema valid | JSON Schema validation in tests |

---

## Rollback Plan

Each phase is independently deployable and reversible:

- **Phase 1:** `plan_and_execute` node is opt-in. Existing flows unaffected. Remove handler + node type to rollback.
- **Phase 2:** `reflexive_loop` node is opt-in. Remove handler to rollback.
- **Phase 3:** Dashboard is read-only. Remove API routes + UI tabs to rollback.
- **Phase 4:** A2A v0.3 is backward-compatible (old cards still work). Revert card-generator to rollback.

No database migrations required for Phases 1-3. Phase 4 adds optional columns (nullable).
