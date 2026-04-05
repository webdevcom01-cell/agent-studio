---
name: agent-creator
description: >
  Enterprise AI agent creation skill following Anthropic/Google DeepMind 2026 standards.
  Use this skill ANY TIME the user wants to create a new agent, add an agent, build an AI agent,
  define a new agent's purpose, or design an agent's system prompt — even if they just say
  "I want an agent that does X" or "kreiraj novog agenta" or "napravi agenta za Y".
  Produces complete, production-ready system prompts with all required XML sections:
  <role>, <output_format>, <constraints>, <failure_modes>, and <example> blocks.
  Never lets an agent go live with a generic "You are a helpful assistant" prompt.
---

# Agent Creator — 2026 Enterprise Standard

You are creating a new AI agent for agent-studio. Your job is to produce a complete, production-ready
system prompt that meets the full 2026 enterprise quality bar on the first attempt.

The 2026 standard (Anthropic + Google DeepMind Contract-First) means every agent must have:
- A **crisp role identity** — not "helpful assistant", but a specific expert with a clear mission
- A **verifiable output contract** — JSON schema or structured format so orchestrators can parse results
- **Hard constraints** — explicit never-do rules that prevent misuse and drift
- **Failure modes** — what the agent does when inputs are missing, ambiguous, or downstream agents fail
- **Examples** — at least one concrete illustration of good output

Agents without these sections cause pipeline failures, produce inconsistent outputs, and create
maintenance headaches. Take the time to get them right upfront.

---

## Step 1 — Capture Intent (ask these questions)

Before writing anything, understand the agent's context. Ask the user:

1. **What does this agent do?** (1-2 sentences — the core job)
2. **Who calls it?** (a human user directly, or an orchestrator like SDLC Pipeline, PR Security Gate?)
3. **What are its inputs?** (free text, JSON from another agent, a file, a PR diff?)
4. **What should it output?** (prose report, JSON verdict, code, structured plan?)
5. **What are the hard rules?** (things it must never do, tool restrictions, scope limits)
6. **Does it have sub-agents it coordinates, or is it a leaf node?**

If the user gives you enough context without prompting (e.g., "make me a GDPR compliance checker agent
that scans code for personal data violations and returns a JSON report"), extract the answers from
their description and confirm before writing.

---

## Step 2 — Classify the Agent

Once you understand the intent, classify it:

| Type | Description | Key requirement |
|---|---|---|
| **Leaf agent** | Executes a specific analysis or task, called by orchestrators | Machine-readable JSON output |
| **Orchestrator** | Coordinates multiple sub-agents, manages pipeline flow | Agent roster, handoff schemas, retry logic |
| **User-facing** | Directly responds to human queries | Natural language output + helpful tone |
| **Hybrid** | Both user-facing and callable by orchestrators | Both JSON + human-readable output |

The type determines the output format requirements. Orchestrators need handoff schemas.
Leaf agents need strict JSON. User-facing agents need clear prose structure.

**Always state the classification explicitly in your response.** Example: "Classification: **Orchestrator** — coordinates 3 sub-agents in the CI/CD pipeline."

---

## Step 3 — Write the System Prompt

Use this exact XML structure. Every section is required — do not skip any.

```
<role>
[2-4 sentences. Answer: who is this agent, what is their specialty, what is their mission,
and where do they sit in the pipeline? Be specific — no "helpful assistant" language.]
</role>

[Main body: methodology, frameworks, domain knowledge, decision criteria, scoring formulas.
This is the largest section. Use ## headers and tables. Be specific about the agent-studio
tech stack, relevant standards (OWASP 2025, WCAG 2.2, CVSS v4.0), and domain expertise.]

<output_format>
## Required Output

[Define EXACTLY what the agent returns. For orchestrator-facing agents: JSON schema first,
then optional human-readable section. For user-facing agents: clear markdown structure.]

### JSON Schema (for pipeline agents)
```json
{
  "result_id": "prefix-[timestamp]",
  "verdict": "PASS | FAIL | REVIEW",
  ...all fields with types and allowed values...
}
```

[Define verdict thresholds, scoring formulas, or decision rules here.]
</output_format>

<failure_modes>
## Failure Handling

[Define what the agent does in each failure scenario. Cover:]
- If required input is missing or malformed
- If a dependency (sub-agent or tool) times out or returns invalid data
- If confidence is too low to produce a reliable verdict
- If the request is outside the agent's scope
[Each entry: condition → what the agent does instead]
</failure_modes>

<example>
## Example

[One concrete, realistic example showing input → output. **CRITICAL: this must be a POPULATED
example with realistic data values — NOT a template with placeholder fields.**

✅ Good: `"verdict": "FAIL", "findings": [{"id": "SEC-001", "category": "A03-Injection", "severity": "HIGH", "cvss": 8.1, "file": "src/app/api/agents/[agentId]/route.ts", "line": 42}]`
❌ Bad: `"verdict": "PASS|FAIL|REVIEW", "findings": [{"id": "string", "category": "string"}]`

For JSON agents: show the full JSON response with real-looking data.
For user-facing agents: show the structured markdown with realistic content.
The example proves the schema is viable — a template proves nothing.]
</example>

<constraints>
## Hard Rules

[Bullet list of specific, unambiguous never-do rules. Include:]
- Scope boundaries (what this agent does NOT handle)
- Tech stack constraints (agent-studio specific rules that apply)
- Quality gates (conditions that always trigger a specific verdict)
- Safety rules (what to do if harmful/dangerous patterns are detected)
[Be specific, not generic. "Never use any type" is better than "follow coding standards".]
</constraints>
```

---

## Step 3b — Orchestrator-Specific Sections (only for orchestrator/hybrid agents)

If the agent is classified as **orchestrator** or **hybrid**, the system prompt MUST also include:

### Agent Roster
List every sub-agent the orchestrator can call, with:
- **Name** — exact agent name or tool identifier
- **Purpose** — what it does (1 sentence)
- **Input schema** — what JSON the orchestrator sends to it
- **Output schema** — what JSON it returns (with verdict/findings/status fields)
- **Timeout** — how long to wait (e.g., 250s per agent, 300s global)

### Invocation Pattern
Specify HOW the orchestrator calls sub-agents:
- **MCP tools**: `getMCPToolsForAgent(agentId)` → `tool.execute(input)`
- **A2A protocol**: `POST /api/a2a/{agentId}/tasks` with JSON-RPC envelope
- **Internal function**: direct function call within the same flow

### Parallel vs Sequential
Explicitly state: "Invoke all sub-agents in parallel" or "Invoke sequentially: A → B → C"

### Consolidation Logic
Define exactly how sub-agent results are merged into the final verdict:
```
IF any sub-agent returns FAIL → overall verdict = FAIL
IF any sub-agent returns REVIEW and none FAIL → overall verdict = REVIEW
IF all sub-agents return PASS → overall verdict = PASS
IF any sub-agent times out → mark it as REVIEW, continue with partial results
```

### Retry and Timeout
- Per-agent timeout (e.g., 250s)
- Global timeout (e.g., 300s)
- Retry policy (e.g., 0 retries — fail fast for CI/CD, or 1 retry for user-facing)
- What happens when a sub-agent fails: exclude from verdict? mark as REVIEW? fail the pipeline?

---

## Step 4 — Quality Check

Before delivering, score the prompt against the 10-dimension rubric. Aim for 8+/10.

| Dimension | Check |
|---|---|
| `<role>` block present | Yes / No |
| `<output_format>` defined | Yes / No |
| `<constraints>` present | Yes / No |
| `<failure_modes>` present | Yes / No |
| `<example>` present | Yes / No |
| JSON schema (for pipeline agents) | Yes / No / N/A |
| Verification criteria defined | Yes / No |
| Decomposition / phased approach | Yes / No / N/A |
| Domain-specific rules (not generic) | Yes / No |
| Minimum 4000 characters | Yes / No |

If the score is below 8, expand the weakest sections before delivering.

---

## Step 5 — Deliver + Offer to Deploy

Present the complete system prompt to the user.

Then ask: **"Do you want me to create this agent in the Railway database now?"**

If yes, use the Railway PostgreSQL connection to insert the agent:
```python
import psycopg2
conn = psycopg2.connect(RAILWAY_URL)
cur = conn.cursor()
cur.execute('''
    INSERT INTO "Agent" (id, name, description, model, "systemPrompt", "isPublic", "userId", "createdAt", "updatedAt")
    VALUES (gen_random_uuid()::text, %s, %s, %s, %s, false, %s, NOW(), NOW())
    RETURNING id, name
''', (name, description, model, system_prompt, user_id))
```

Default model: `deepseek-chat`
Ask the user for: agent name, short description, and their userId (or use existing userId from DB)

---

## agent-studio Stack Reference

When writing constraints for agents that work with agent-studio code, always include relevant rules:

**TypeScript/Next.js**
- No `any` type — ever
- No `@ts-ignore`
- Import from `@/generated/prisma` not `@prisma/client`
- `console.log` → `logger` from `@/lib/logger`
- API routes return `{ success: boolean, data | error }` only
- `params` must be awaited in Next.js 15

**Database**
- Production = Railway PostgreSQL (postgres.railway.internal) — NOT Supabase
- pgvector 0.8.2 for vector search
- Never edit `src/generated/` or `prisma/migrations/` directly
- Always use `pnpm`, never npm/yarn

**Security**
- Use `requireAgentOwner()` / `requireAuth()` from `@/lib/api/auth-guard`
- Never expose internal error details in API responses
- CVSS v4.0 for severity scoring (not v3.1)
- OWASP Top 10 2025 for security coverage

**Standards**
- WCAG 2.2 AA for accessibility (not 2.1)
- OWASP LLM Top 10 2025 for AI/LLM security
