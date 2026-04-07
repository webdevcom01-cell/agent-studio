# Node Reference — All 61 Node Types

This document covers every node type in Agent Studio with all configurable fields. Open the Properties panel by clicking any node in the Builder.

**Every node has a shared `Label` field** — the display name shown on the node in the flow canvas.

**Template variables** — most text fields support `{{variable_name}}` syntax for dynamic values. Use dot notation for nested paths (`{{user.email}}`), bracket notation for arrays (`{{items[0]}}`).

---

## Conversation Nodes

These nodes handle direct interaction with the user.

---

### message — Message

Displays a text message to the user. Use it for greetings, instructions, and notifications.

| Field | Required | Default | Description |
|---|:---:|---|---|
| Message | ✅ | — | Text shown to the user. Supports `{{variables}}`. |

**Example:** `Hello {{user_name}}! How can I help you today?`

---

### capture — Capture

Waits for the user to type a response and saves it to a variable. Required before any node that reads user input.

| Field | Required | Default | Description |
|---|:---:|---|---|
| Variable Name | ✅ | — | Where the user's input is stored (e.g. `user_question`, `user_email`). No `{{}}` here — just the name. |
| Prompt | — | — | Optional text shown to the user as a question. If empty, the flow waits silently. |

> **Tip:** Always place a Capture node before KB Search — it collects the question into a variable that KB Search uses for retrieval.

---

### button — Button

Displays a message with clickable options. Use it for menus, category selection, and confirmations.

| Field | Required | Default | Description |
|---|:---:|---|---|
| Message | ✅ | — | Text shown above the buttons (e.g. `Choose an option:`). |
| Variable Name | ✅ | — | Variable that stores the user's selection (e.g. `user_choice`). |
| Buttons | ✅ | — | List of options. Each has a **Label** (button text) and **Value** (stored value). |

---

### end — End

Terminates the flow and optionally displays a closing message.

| Field | Required | Default | Description |
|---|:---:|---|---|
| End Message | — | — | Optional text shown when the flow closes (e.g. `Thank you for chatting!`). |

---

## Flow Control Nodes

These nodes manage routing, loops, branching, and variable state.

---

### condition — Condition

Routes the flow based on a true/false check. Has two output handles: **true** and **false**.

| Field | Required | Default | Description |
|---|:---:|---|---|
| *(none)* | — | — | Conditions are configured on the **edges** (connections) in the Builder, not in the Properties panel. Click an edge to set its condition. |

---

### set_variable — Set Variable

Assigns a value to a variable without user interaction. Use it to initialize state, compute values, or transform data.

| Field | Required | Default | Description |
|---|:---:|---|---|
| Variable Name | ✅ | — | The variable to set (e.g. `score`, `is_premium`). |
| Value | ✅ | — | Static text, number, or a reference: `{{last_message}}`, `{{user_score}}`. |

---

### goto — Goto

Redirects the flow to another node. Use it to loop back, skip sections, or build multi-step flows.

| Field | Required | Default | Description |
|---|:---:|---|---|
| Target Node | ✅ | — | Dropdown of all nodes in the flow. Select the destination node. |

---

### wait — Wait

Pauses the flow for a set duration. Use it to add thinking-time delay between messages.

| Field | Required | Default | Description |
|---|:---:|---|---|
| Duration (seconds) | ✅ | — | How long to pause. Minimum 1s, maximum 5s. |

---

### switch — Switch

Routes the flow to one of several branches based on a variable's value. Like a multi-way `if/else`.

| Field | Required | Default | Description |
|---|:---:|---|---|
| Variable | ✅ | — | The variable whose value is matched (name only, no `{{}}`). |
| Operator | — | `equals` | Match operator: `equals`, `not_equals`, `contains`, `greater_than`, `less_than`, `is_truthy`, `is_falsy`. |
| Cases | ✅ | — | List of cases. Each has a **Value** to match and a **Label**. Each case gets its own output handle. |
| Output Variable | — | `switch_result` | Stores match metadata (`{ matched, value }`). |

> **Tip:** Connect each case handle to a different branch. An unmatched value exits through the default handle.

---

### loop — Loop

Repeats a section of the flow. Supports three modes: fixed count, until condition, and while condition.

| Field | Required | Default | Description |
|---|:---:|---|---|
| Mode | ✅ | `count` | `count` — fixed iterations. `condition` — repeat until condition is met. `while` — repeat while condition is true. |
| Max Iterations | — | — | Upper safety limit (1–100). Prevents infinite loops. |
| Loop Variable | — | — | Variable that stores the current iteration index (0-based). |
| Condition Variable | — | — | *(condition/while modes)* Variable to evaluate. |
| Condition Operator | — | — | *(condition/while modes)* One of: `equals`, `not_equals`, `contains`, `greater_than`, `less_than`, `is_truthy`, `is_falsy`. |
| Condition Value | — | — | *(condition/while modes)* Value to compare against. |

---

### parallel — Parallel

Executes up to 5 independent branches simultaneously and merges their results. Use it for fan-out patterns (e.g. run 3 AI calls at once).

| Field | Required | Default | Description |
|---|:---:|---|---|
| Branches | ✅ | — | Up to 5 branches. Each has a **Label** and an **Output Variable** for that branch's result. |

> **Tip:** Each branch runs in isolation on a copy of the current variables. Results are merged back after all branches complete.

---

### learn — Learn *(ECC)*

Extracts patterns from recent agent execution history and stores them as instincts for continuous learning. Part of the ECC module — requires `ECC_ENABLED=true`.

| Field | Required | Default | Description |
|---|:---:|---|---|
| Pattern Name | ✅ | — | Name for the pattern being extracted (e.g. `user_prefers_short_answers`). Supports `{{variables}}`. |
| Pattern Description | — | — | Human-readable description of what this pattern captures. |
| Output Variable | — | `learn_result` | Stores the result: `{ instinctId, confidence, frequency }`. |

> Instincts with confidence ≥ 0.85 are automatically promoted to Skills via the `/api/skills/evolve` endpoint.

---

## AI Nodes

These nodes call language models for generation, classification, extraction, and evaluation.

---

### ai_response — AI Response

Generates text using a language model. The primary node for conversational AI, RAG responses, and reasoning tasks.

| Field | Required | Default | Description |
|---|:---:|---|---|
| System Prompt | — | — | Instructions defining model behavior and persona. Supports `{{variables}}` and `{{kb_context}}`. |
| Model | — | `deepseek-chat` | The AI model to use. See [Supported Models](../README.md#supported-ai-providers). |
| Max Tokens | — | `500` | Maximum response length in tokens. |
| Output Variable | — | — | If set, stores the response in this variable for later use. |
| Output Schema | — | — | Named schema to enforce on the response JSON: `CodeGenOutput`, `PRGateOutput`, `ArchitectureOutput`. When set, uses `generateObject` to force structured output. If the response doesn't match the schema, an error is returned. |
| Enable Agent Orchestration | — | off | When on, the AI can call sibling agents as tools during generation. |

> **Tip:** When connected downstream from a KB Search node, `{{kb_context}}` is automatically available in the system prompt — no manual wiring needed.

> **Typed output schemas:** Use `outputSchema: "CodeGenOutput"` on code-generation nodes and `outputSchema: "PRGateOutput"` on review nodes to get validated, parseable JSON between agents. Schema definitions live in `src/lib/sdlc/schemas.ts`.

---

### ai_classify — AI Classify

Classifies user input into one of several categories using AI. Use it to route the flow based on intent.

| Field | Required | Default | Description |
|---|:---:|---|---|
| Input Variable | ✅ | — | Variable whose content is classified (e.g. `user_question`). |
| Categories | ✅ | — | List of category names (e.g. `complaint`, `inquiry`, `order`). Add one per line. |
| Model | — | `deepseek-chat` | AI model used for classification. |

> The classification result (category name) is stored in a variable named after the node's ID. Connect edges labeled with each category name to route the flow.

---

### ai_extract — AI Extract

Extracts structured fields from unstructured text using AI.

| Field | Required | Default | Description |
|---|:---:|---|---|
| Fields to Extract | ✅ | — | List of fields. Each has a **Name** (e.g. `email`), **Type** (`string`, `number`, `boolean`), and **Description** (what to extract). |
| Model | — | `deepseek-chat` | AI model used for extraction. |

> Extracted fields are stored as individual variables: `{{email}}`, `{{phone}}`, etc.

---

### ai_summarize — AI Summarize

Summarizes text from a variable into a shorter form.

| Field | Required | Default | Description |
|---|:---:|---|---|
| Output Variable | — | `summary` | Variable where the summary is stored. |
| Max Length (chars) | — | `200` | Maximum character length of the summary. |
| Model | — | `deepseek-chat` | AI model used for summarization. |

---

### evaluator — Evaluator

Scores content against custom criteria using AI as a judge. Use it to assess quality, correctness, or alignment within a flow.

| Field | Required | Default | Description |
|---|:---:|---|---|
| Input Variable | ✅ | — | Variable containing the content to evaluate. |
| Criteria | ✅ | — | Description of what to evaluate (e.g. `Is the response factually accurate and under 100 words?`). |
| Output Variable | — | `eval_result` | Stores `{ score, reasoning }` where score is 0.0–1.0. |
| Model | — | `deepseek-chat` | AI model used as judge. |

---

### memory_write — Memory Write

Saves a value to the agent's persistent memory across conversations.

| Field | Required | Default | Description |
|---|:---:|---|---|
| Key | ✅ | — | Unique identifier for this memory entry. Supports `{{variables}}` (e.g. `pref_{{user_id}}`). |
| Value | ✅ | — | Content to store. Supports `{{variables}}`. JSON is auto-parsed if valid. |
| Category | — | `general` | Groups related memories (e.g. `preferences`, `history`). |
| Importance | — | `0.5` | Priority score 0.0–1.0. Higher importance memories are preferred in semantic search. |
| Generate Embedding | — | off | When on, creates a vector embedding for semantic search retrieval. |

---

### memory_read — Memory Read

Reads from the agent's persistent memory. Supports exact key lookup, category listing, and semantic search.

| Field | Required | Default | Description |
|---|:---:|---|---|
| Mode | ✅ | `key` | `key` — fetch by exact key. `category` — list all in a category. `search` — semantic similarity search. |
| Key | — | — | *(key mode)* The exact key to retrieve. |
| Category | — | — | *(category mode)* Category to list. |
| Query | — | — | *(search mode)* Natural language query for semantic search. |
| Output Variable | — | `memory_result` | Variable where the result is stored. |

---

## Knowledge & Trigger Nodes

These nodes handle knowledge base retrieval and flow entry points.

---

### kb_search — KB Search

Searches the agent's Knowledge Base using hybrid retrieval (semantic + BM25) and stores results in `kb_context`.

| Field | Required | Default | Description |
|---|:---:|---|---|
| Query Variable | ✅ | — | Variable name containing the search query — **no `{{}}` brackets**, just the name (e.g. `user_question`). |
| Top K Results | — | `5` | Number of chunks to retrieve. Automatically increases to 8 for longer queries. |

> Results are **always** stored in `{{kb_context}}` — there is no Output Variable field. Connect directly to an AI Response node; `{{kb_context}}` is auto-injected into the system prompt.

---

### schedule_trigger — Schedule Trigger

Flow entry point that fires on a schedule. No input handle — this is where the flow starts.

| Field | Required | Default | Description |
|---|:---:|---|---|
| Mode | ✅ | `manual` | `cron` — cron expression (e.g. `0 9 * * 1` for every Monday at 9am). `interval` — repeat every N minutes. `manual` — triggered only via API. |
| Cron Expression | — | — | *(cron mode)* Standard 5-field cron expression. |
| Interval (minutes) | — | — | *(interval mode)* How often to fire in minutes. |

---

### webhook_trigger — Webhook Trigger

Flow entry point that fires when an inbound webhook is received. No input handle.

| Field | Required | Default | Description |
|---|:---:|---|---|
| Webhook ID | — | auto | Unique identifier for this trigger. Auto-generated. |
| Event Filters | — | — | If set, only fires when the event type matches one of these values. Empty = accept all. |
| Body Mapping | — | — | Maps JSON paths from the payload to variables (e.g. `$.action` → `webhook_action`). |
| Header Mapping | — | — | Maps headers to variables (e.g. `x-github-event` → `event_type`). |

> **Trigger URL:** `POST /api/agents/{agentId}/trigger/{webhookId}`. Authenticated via HMAC-SHA256. Injected variables: `{{__webhook_payload}}`, `{{__webhook_event_type}}`, `{{__webhook_id}}`.

> See [Inbound Webhooks](https://docs.anthropic.com) for provider presets (GitHub, Stripe, Slack).

---

## Integration Nodes

These nodes connect flows to external services, APIs, and tools.

---

### api_call — API Call

Sends an HTTP request to any external API. Use it to read from or write to CRMs, databases, and third-party services.

| Field | Required | Default | Description |
|---|:---:|---|---|
| Method | ✅ | `GET` | HTTP method: `GET`, `POST`, `PUT`, `PATCH`, `DELETE`. |
| URL | ✅ | — | API endpoint. Supports `{{variables}}` (e.g. `https://api.example.com/users/{{user_id}}`). |
| Body | — | — | JSON request body. Supports `{{variables}}` (e.g. `{"name": "{{user_name}}"}`). |
| Output Variable | ✅ | — | Variable where the response JSON is stored. |

---

### webhook — Webhook

Sends an HTTP request as a fire-and-forget notification to an external service. Identical fields to API Call.

| Field | Required | Default | Description |
|---|:---:|---|---|
| Method | ✅ | `POST` | HTTP method. |
| URL | ✅ | — | Webhook endpoint URL. Supports `{{variables}}`. |
| Body | — | — | JSON payload. Supports `{{variables}}`. |
| Output Variable | — | — | Optional — stores the response if needed. |

> **Unlike API Call**, Webhook is semantically for outbound notifications (Slack, Discord, Zapier). Use API Call when you need to read the response.

---

### mcp_tool — MCP Tool

Deterministically calls a specific tool on a connected MCP server. Unlike the AI Response node (which decides when to call tools), this always calls the tool at this exact point in the flow.

| Field | Required | Default | Description |
|---|:---:|---|---|
| MCP Server | ✅ | — | Dropdown of configured MCP servers. Add servers from the dashboard → MCP Servers. |
| Tool | ✅ | — | Dropdown of available tools on the selected server. Use "Test Connection" to refresh the tools cache. |
| Input Mapping | — | — | Maps tool parameters to values. Each row: parameter name (left) + template value (right, e.g. `{{user_question}}`). |
| Output Variable | ✅ | — | Variable where the tool result is stored. |
| Input Schema | — | — | Named schema (e.g. `CodeGenOutput`) to validate input args before calling the tool. Rejects the call with `[Error: Input validation failed ...]` if invalid. |
| Output Schema | — | — | Named schema (e.g. `PRGateOutput`) to validate the tool's response. Sets output variable to `[Error: Output validation failed ...]` if invalid. |

**Schema enforcement:** If the MCP server's `toolsCache` contains a JSON Schema for the tool's input parameters, those are automatically validated before the call (checks required fields and types). Named schemas use the Zod registry in `src/lib/sdlc/schemas.ts`.

**Example pattern:** Capture → MCP Tool (`search` tool with `{{user_question}}`) → AI Response (uses `{{search_results}}` in system prompt).

---

### call_agent — Call Agent

Calls another agent and waits for its response. Use it for agent-to-agent orchestration and task delegation.

| Field | Required | Default | Description |
|---|:---:|---|---|
| Agent | ✅ | — | Searchable dropdown of available agents in your workspace. |
| Input Mapping | — | — | Key-value pairs sent to the called agent (e.g. `code → {{generatedCode}}`). |
| Output Variable | — | `agent_result` | Variable where the called agent's response is stored. |
| Input Schema | — | — | Named schema to validate the input mapping before calling the agent. Call is rejected if invalid. |
| Output Schema | — | — | Named schema (e.g. `PRGateOutput`) to validate the agent's response. Sets output variable to `null` and adds an error message if the response doesn't match. |
| On Error | — | `continue` | `continue` — flow proceeds with error in variable, `stop` — halts flow on failure. |

> Protected by circuit breaker (OPEN/CLOSED/HALF_OPEN), rate limiter, and cycle detection. Maximum call depth: 3.

---

### human_approval — Human Approval

Pauses the flow and waits for a human to approve or reject before continuing. Use it for high-stakes actions that need oversight.

| Field | Required | Default | Description |
|---|:---:|---|---|
| Title | ✅ | — | Short approval request title (e.g. `Approve refund for {{user_name}}`). |
| Description | — | — | Detailed context for the reviewer. Supports `{{variables}}`. |
| Options | — | `Approve / Reject` | Custom button labels for the reviewer. |

> Pending requests appear in `/api/approvals`. Flow resumes after a response via `POST /api/approvals/{requestId}/respond`.

---

### web_fetch — Web Fetch

Fetches content from a URL and stores the result. Use it to read web pages, APIs, or public data sources.

| Field | Required | Default | Description |
|---|:---:|---|---|
| URL | ✅ | — | The URL to fetch. Supports `{{variables}}`. Validated against SSRF blocklist. |
| Method | — | `GET` | HTTP method. |
| Output Variable | ✅ | — | Variable where the fetched content is stored. |

> Private IP ranges (10.x, 192.168.x, 127.x) are blocked. Use API Call for authenticated requests with custom headers.

---

### browser_action — Browser Action

Performs browser automation actions via a connected Playwright MCP server. Use it for web scraping, form filling, and multi-step site navigation.

| Field | Required | Default | Description |
|---|:---:|---|---|
| MCP Server | ✅ | — | A Playwright-compatible MCP server (e.g. `@playwright/mcp`). |
| Action | ✅ | — | Browser action type: `navigate`, `click`, `type`, `screenshot`, `extract`, etc. |
| Parameters | — | — | Action-specific parameters. Supports `{{variables}}`. |
| Output Variable | — | `browser_result` | Variable where the action result is stored. |

> For multi-step navigation, use an AI Response node with the Playwright MCP attached — the AI drives the browser autonomously across up to 20 tool steps.

---

### email_send — Email Send

Sends an email via an external email service endpoint (webhook-style, provider-agnostic).

| Field | Required | Default | Description |
|---|:---:|---|---|
| To | ✅ | — | Recipient email address. Supports `{{variables}}` (e.g. `{{user_email}}`). |
| Subject | ✅ | — | Email subject line. Supports `{{variables}}`. |
| Body | ✅ | — | Email body. Supports `{{variables}}`. Enable **HTML** toggle for HTML emails. |
| From Name | — | `Agent Studio` | Sender display name. |
| Reply To | — | — | Optional reply-to address. |
| Webhook URL | ✅ | — | Your email provider's webhook endpoint (SendGrid, Resend, Mailgun, etc.). |
| HTML | — | off | When on, body is sent as HTML rather than plain text. |
| Output Variable | — | `email_result` | Stores the send result. |

---

### notification — Notification

Sends a notification through one of several channels. Lighter-weight than Email Send for internal alerts and logs.

| Field | Required | Default | Description |
|---|:---:|---|---|
| Channel | ✅ | `log` | `log` — server log only. `in_app` — in-app notification. `webhook` — POST to a URL. |
| Message | ✅ | — | Notification content. Supports `{{variables}}`. |
| Webhook URL | — | — | *(webhook channel)* Destination URL. |
| Output Variable | — | — | Optional — stores delivery result. |

---

### format_transform — Format Transform

Transforms data between formats (JSON, CSV, text, template). Use it to reshape data between nodes.

| Field | Required | Default | Description |
|---|:---:|---|---|
| Format | ✅ | — | Target format: `json_to_text`, `text_to_json`, `csv_to_json`, `json_to_csv`, `template`. |
| Input Variable | ✅ | — | Variable containing the source data. |
| Direct Input Value | — | — | Literal value to transform (alternative to Input Variable). |
| Output Variable | ✅ | — | Variable where the transformed result is stored. |
| Template | — | — | *(template format)* Handlebars-style template with `{{variables}}`. |
| Separator | — | `,` | *(CSV formats)* Column separator character. |

---

### function — Function

Executes custom JavaScript within the flow. Use it for calculations, data transformations, and logic that no built-in node covers.

| Field | Required | Default | Description |
|---|:---:|---|---|
| Code | ✅ | — | JavaScript code. Access flow variables via the `variables` object (e.g. `return variables.x + variables.y;`). Must `return` a value. |
| Output Variable | ✅ | — | Variable where the return value is stored. |

> **Security:** Runs in a `vm.Script` sandbox — no access to `process`, `require`, or `global`. 5-second execution timeout.

---

### desktop_app — Desktop App

Controls a desktop application via a CLI bridge generated by the CLI Generator. Requires a linked MCP server from a published CLI generation.

| Field | Required | Default | Description |
|---|:---:|---|---|
| MCP Server | ✅ | — | CLI bridge MCP server (generated and published via CLI Generator). |
| App ID | ✅ | — | Identifier of the target application from the bridge config. |
| Actions | ✅ | — | List of actions to perform. Each has a **Command** and **Parameters** (supports `{{variables}}`). |
| Session Mode | — | `new` | `new` — start a fresh session per run. `reuse` — reuse an existing session. |
| Output Variable | — | `desktop_result` | Variable where the combined action results are stored. |

> **Tip:** Use the CLI Generator at `/cli-generator` to wrap any CLI tool as an MCP server, then link that server here.

---

## Appendix

### Template Variable Syntax

| Syntax | Example | Description |
|---|---|---|
| Simple | `{{user_name}}` | Single variable |
| Dot notation | `{{user.address.city}}` | Nested object path |
| Bracket notation | `{{items[0]}}` | Array index |
| In URLs | `https://api.example.com/{{id}}` | Embedded in strings |
| In JSON | `{"name": "{{user_name}}"}` | Inside JSON bodies |

### Common Flow Patterns

**RAG (Retrieval-Augmented Generation)**
```
Capture → KB Search → AI Response → Message
```
The Capture node saves the user's question, KB Search retrieves relevant context into `{{kb_context}}`, and AI Response generates an answer with that context auto-injected.

**Intent-based Routing**
```
Capture → AI Classify → [branch per category] → ...
```
AI Classify categorizes the input; connect edges labeled with each category name to separate sub-flows.

**Human-in-the-Loop Approval**
```
... → Human Approval → [approved branch] → Action Node
                     → [rejected branch] → Message
```
The flow pauses until a human responds via the Approvals dashboard. Use it before irreversible actions.

---

## Advanced AI Nodes

---

### python_code — Python Code

Executes Python code in a sandboxed environment (Pyodide WASM in browser, Node.js subprocess on server).

| Field | Required | Default | Description |
|---|:---:|---|---|
| Code | ✅ | — | Python code to execute. Access flow variables via `inputs` dict. |
| Input Variables | — | — | Variables passed into the sandbox as `inputs`. |
| Output Variable | — | `python_result` | Variable to store the return value. |
| Timeout (ms) | — | `5000` | Max execution time before the node fails. |

**Example:** `return inputs["items"].count(lambda x: x > 0)`

---

### structured_output — Structured Output

Generates typed JSON output using an AI model with Zod schema validation. Guarantees the output matches the defined schema.

| Field | Required | Default | Description |
|---|:---:|---|---|
| Schema | ✅ | — | JSON Schema definition for the expected output shape. |
| Prompt | ✅ | — | Instructions for the AI to generate structured data. |
| Model | — | default | AI model to use for generation. |
| Output Variable | — | `structured_result` | Variable to store the validated JSON object. |

---

### plan_and_execute — Plan and Execute

Decomposes complex tasks using a powerful model, then routes sub-tasks to cheaper models based on complexity tier. Achieves 40-60% cost savings on multi-step workflows.

| Field | Required | Default | Description |
|---|:---:|---|---|
| Task | ✅ | — | High-level task description or `{{variable}}`. |
| Planner Model | — | powerful tier | Model used for task decomposition. |
| Max Steps | — | `10` | Maximum sub-tasks to generate. |
| Output Variable | — | `plan_result` | Variable with final aggregated output. |

**Routes:** `completed` → next node, `failed` → error branch.

---

### reflexive_loop — Reflexive Loop

Generates output, evaluates it against criteria, and retries with feedback until quality passes. Combines generation + evaluation + retry in one node.

| Field | Required | Default | Description |
|---|:---:|---|---|
| Prompt | ✅ | — | Generation instruction. |
| Evaluation Criteria | ✅ | — | Quality criteria for the evaluator model. |
| Passing Score | — | `7` | Minimum score (0-10) to exit the loop. |
| Max Iterations | — | `5` | Hard cap on retry attempts. |
| Executor Model | — | default | Model for generation. |
| Evaluator Model | — | default | Separate model for scoring (avoids self-bias). |
| Output Variable | — | `loop_result` | Variable with final passing output. |

**Routes:** `passed` → success branch, `failed` → failure branch.

---

### trajectory_evaluator — Trajectory Evaluator

Evaluates multi-step agent reasoning trajectories for coherence, efficiency, and goal attainment. Used after complex agent workflows to score decision quality.

| Field | Required | Default | Description |
|---|:---:|---|---|
| Trajectory Variable | ✅ | — | Variable containing the step-by-step execution trace. |
| Evaluation Criteria | — | — | Custom scoring criteria. |
| Output Variable | — | `trajectory_score` | Variable with score and reasoning. |

---

## Control & Routing Nodes

---


### ab_test — A/B Test

Splits traffic between two variants (A and B) for controlled experiments. Supports weighted routing and sticky assignment by conversation ID.

| Field | Required | Default | Description |
|---|:---:|---|---|
| Weight A (%) | — | `50` | Percentage of traffic routed to variant A. |
| Weight B (%) | — | `50` | Percentage of traffic routed to variant B. |
| Sticky | — | `false` | When true, same conversation ID always gets same variant. |

**Routes:** `A` or `B` output handles.

---

### semantic_router — Semantic Router

Routes messages to different branches based on semantic similarity to intent labels. More flexible than keyword matching; uses embedding cosine similarity.

| Field | Required | Default | Description |
|---|:---:|---|---|
| Input Variable | ✅ | — | Variable containing the text to classify. |
| Routes | ✅ | — | List of intent labels; each becomes an output handle. |
| Threshold | — | `0.7` | Minimum similarity score to match a route. |
| Default Handle | — | `default` | Route taken when no intent exceeds the threshold. |

---

### retry — Retry

Executes a target node and retries it on failure with exponential backoff. Supports escalating context injection for SDLC pipelines — each retry adds richer feedback to guide the model toward a correct result.

| Field | Required | Default | Description |
|---|:---:|---|---|
| Target Node ID | ✅ | — | ID of the node to execute and retry (e.g. `codegen`). |
| Max Retries | — | `3` | Maximum number of retry attempts after the initial failure. |
| Base Delay (ms) | — | `1000` | Initial delay before first retry. |
| Backoff Multiplier | — | `2` | Delay multiplier per attempt (exponential backoff). |
| Failure Variable | — | — | Variable to check for structured failure (e.g. `sandboxResult`). |
| Failure Values | — | `["FAIL","BLOCK"]` | Values of Failure Variable that trigger a retry. |
| Output Variable | — | — | Target node's output variable name (used for error tagging on exhaustion). |
| **Escalating Context** | | | |
| Enable Escalation | — | off | When on, injects progressively richer context into the target node on each retry. |
| PR Gate Variable | — | `gateResult` | Variable holding PR Gate review issues (injected on attempt 1+). |
| Sandbox Errors Variable | — | `sandboxResult` | Variable holding sandbox failure details (injected on attempt 2+). |
| Project Context Variable | — | `projectContext` | Variable holding project context loaded by `project_context` node. |
| Code Examples Variable | — | `codeExamples` | Variable with few-shot code examples (injected on attempt 2+). |

**Escalation logic:**
- Attempt 1: injects PR Gate fix fields + project context into `__retry_escalation` variable
- Attempt 2+: above + sandbox error details + code examples
- On exhaustion: sets output variable to `[Error: Failed after N attempts: ...]` and stops flow (`nextNodeId: null`)

**Example:** `sandbox_verify (failed) → retry (targetNodeId: "codegen", enableEscalation: true, maxRetries: 2)`

---

### aggregate — Aggregate

Collects and merges outputs from multiple parallel branches. Waits for all branches to complete before proceeding.

| Field | Required | Default | Description |
|---|:---:|---|---|
| Input Variables | ✅ | — | Variables from each branch to collect. |
| Merge Strategy | — | `array` | `array` (list), `object` (keyed map), `concat` (string join). |
| Output Variable | — | `aggregated` | Variable with merged results. |

---

## Data & Search Nodes

---

### web_search — Web Search

Searches the web using configured provider APIs (Google, Bing, Brave) and returns structured results.

| Field | Required | Default | Description |
|---|:---:|---|---|
| Query | ✅ | — | Search query string or `{{variable}}`. |
| Provider | — | `brave` | Search provider: `google`, `bing`, `brave`. |
| Result Count | — | `5` | Number of results to return. |
| Output Variable | — | `search_results` | Variable with array of `{title, url, snippet}` objects. |

---

### embeddings — Embeddings

Generates and optionally stores vector embeddings for text. Used for semantic search pipelines and similarity computations.

| Field | Required | Default | Description |
|---|:---:|---|---|
| Input Variable | ✅ | — | Variable containing text to embed. |
| Model | — | `text-embedding-3-small` | Embedding model to use. |
| Store in KB | — | `false` | Whether to persist the embedding to the agent's knowledge base. |
| Output Variable | — | `embedding_result` | Variable with the embedding vector. |

---

### cache — Cache

Stores and retrieves values from in-memory or Redis cache with configurable TTL. Reduces repeated API calls and speeds up repeated queries.

| Field | Required | Default | Description |
|---|:---:|---|---|
| Operation | ✅ | `get` | `get` — read from cache, `set` — write to cache, `delete` — remove. |
| Cache Key | ✅ | — | Unique key string or `{{variable}}`. |
| Value Variable | — | — | Variable to store (for `set`), or variable to write result into (for `get`). |
| TTL (seconds) | — | `300` | Time-to-live for cached values (set operations). |

---

### database_query — Database Query

Executes SQL or NoSQL queries against connected databases.

| Field | Required | Default | Description |
|---|:---:|---|---|
| Query | ✅ | — | SQL query or NoSQL operation. Supports `{{variable}}` interpolation. |
| Connection | ✅ | — | Database connection identifier configured in agent settings. |
| Output Variable | — | `query_result` | Variable with query results as an array of objects. |

---

### file_operations — File Operations

Reads and writes files in the agent's workspace (S3, Google Drive, or local storage).

| Field | Required | Default | Description |
|---|:---:|---|---|
| Operation | ✅ | `read` | `read`, `write`, `delete`, `list`. |
| Path | ✅ | — | File path or `{{variable}}`. |
| Content Variable | — | — | Variable with content to write (write operations). |
| Output Variable | — | `file_result` | Variable with file contents or operation result. |

---

## Multimodal Nodes

---

### multimodal_input — Multimodal Input

Accepts image, audio, or file inputs from the user and makes them available as variables for downstream nodes.

| Field | Required | Default | Description |
|---|:---:|---|---|
| Input Types | ✅ | — | Accepted types: `image`, `audio`, `file`. |
| Max Size (MB) | — | `10` | Maximum file size. |
| Output Variable | — | `media_input` | Variable with the uploaded content (base64 or URL). |

---

### image_generation — Image Generation

Generates images via provider APIs (DALL-E, Stable Diffusion/Flux via Fal.ai).

| Field | Required | Default | Description |
|---|:---:|---|---|
| Prompt | ✅ | — | Image description. Supports `{{variables}}`. |
| Provider | — | `dall-e` | `dall-e` (OpenAI) or `fal-ai` (Stable Diffusion, Flux). |
| Size | — | `1024x1024` | Output image dimensions. |
| Output Variable | — | `image_url` | Variable with the generated image URL. |

---

### speech_audio — Speech / Audio

Converts text to speech (TTS) or speech to text (STT).

| Field | Required | Default | Description |
|---|:---:|---|---|
| Mode | ✅ | `tts` | `tts` — text to speech, `stt` — speech to text. |
| Input Variable | ✅ | — | Variable with text (TTS) or audio data (STT). |
| Voice | — | `alloy` | Voice preset (TTS only). |
| Output Variable | — | `audio_result` | Variable with audio URL (TTS) or transcribed text (STT). |

---

## Safety & Observability Nodes

---

### guardrails — Guardrails

Applies content moderation, PII detection, and prompt injection defense to any input or output in the flow.

| Field | Required | Default | Description |
|---|:---:|---|---|
| Input Variable | ✅ | — | Variable to inspect. |
| Check Content | — | `true` | Enable content moderation (hate speech, violence, etc.). |
| Check PII | — | `true` | Enable PII detection and optional redaction. |
| Check Injection | — | `true` | Enable prompt injection detection. |
| On Violation | — | `block` | `block` — stop flow, `redact` — sanitize and continue. |
| Output Variable | — | `guardrails_result` | Variable with sanitized content and violation report. |

**Routes:** `safe` → continue, `blocked` → violation branch.

---

### cost_monitor — Cost Monitor

Tracks token usage and spend per agent. Triggers alerts or adaptive model downgrade when budget thresholds are reached.

| Field | Required | Default | Description |
|---|:---:|---|---|
| Budget (USD) | — | — | Total spend limit to enforce. |
| Alert at (%) | — | `80` | Percentage of budget that triggers an alert. |
| Mode | — | `monitor` | `monitor` — alert only, `adaptive` — auto-downgrade model tier at 60%/80%/95%. |
| Output Variable | — | `cost_data` | Variable with `{inputTokens, outputTokens, spend}`. |

---

### mcp_task_runner — MCP Task Runner

Executes long-running MCP tasks with progress tracking. Unlike the MCP Tool node (synchronous), this node supports streaming progress updates.

| Field | Required | Default | Description |
|---|:---:|---|---|
| MCP Server | ✅ | — | Linked MCP server to invoke. |
| Tool Name | ✅ | — | Tool to call on the MCP server. |
| Input Mapping | — | — | Map flow variables to tool input parameters. |
| Output Variable | — | `task_result` | Variable with the final tool output. |
| Timeout (ms) | — | `30000` | Maximum wait time for task completion. |

---


### verification — Verification

Runs a set of deterministic checks against generated artifacts (build, lint, tests). Routes to `passed` or `failed` based on results. Unlike `sandbox_verify` (which works on `CodeGenOutput` objects), this node runs arbitrary shell commands.

| Field | Required | Default | Description |
|---|:---:|---|---|
| Checks | ✅ | — | List of checks to run. Each has: `type` (`build`/`lint`/`test`), `command` (shell cmd), `label` (display name). |
| Output Variable | — | `verificationResults` | Variable with structured results: `{ passed, failed, details[] }`. |

**Routes:** `passed` → all checks passed, `failed` → at least one check failed.

---

### ast_transform — AST Transform

Applies structural code transformations using AST (Abstract Syntax Tree) analysis via `@ast-grep/napi`. Use it for automated refactoring, pattern detection, and code normalization at the syntax level.

| Field | Required | Default | Description |
|---|:---:|---|---|
| Input Variable | ✅ | — | Variable holding the source code string to transform. |
| Pattern | ✅ | — | AST pattern to match (ast-grep syntax). |
| Replacement | — | — | Replacement template. Omit to use as a detector only. |
| Language | — | `typescript` | Source language: `typescript`, `javascript`, `python`, `go`, `rust`. |
| Output Variable | — | `transformResult` | Variable with `{ transformed, matchCount, code }`. |

---

### lsp_query — LSP Query

Queries a Language Server Protocol (LSP) endpoint for semantic code intelligence: hover info, go-to-definition, find-references, diagnostics. Use it in code analysis pipelines to provide AI agents with accurate type and symbol information.

| Field | Required | Default | Description |
|---|:---:|---|---|
| LSP Server URL | ✅ | — | URL of the LSP server (e.g. `http://localhost:2089`). |
| Query Type | ✅ | — | Operation: `hover`, `definition`, `references`, `diagnostics`, `completion`. |
| File Path | ✅ | — | Repository-relative path of the file to query (e.g. `src/lib/auth.ts`). |
| Line | — | — | 0-based line number for positional queries. |
| Character | — | — | 0-based character offset for positional queries. |
| Output Variable | — | `lspResult` | Variable with the LSP response payload. |

---

### swarm — Swarm

Spawns multiple parallel agent instances that share a scratchpad and collectively solve a task. Agents can read/write to shared state, delegate to each other, and self-organize. Experimental — use for research or batch processing tasks that benefit from collective intelligence.

| Field | Required | Default | Description |
|---|:---:|---|---|
| Agent Count | — | `3` | Number of parallel agent instances to spawn. |
| Task Prompt | ✅ | — | The task description shared with all agents. Supports `{{variables}}`. |
| Shared Variables | — | — | Variables made available to all agents in the swarm's shared context. |
| Max Rounds | — | `5` | Maximum coordination rounds between agents. |
| Output Variable | — | `swarmResult` | Variable with the synthesized final answer. |

---

### code_interpreter — Code Interpreter

Executes Python code in an isolated sandbox and returns the result. Use it for data analysis, mathematical computations, and custom scripting that would be unreliable if delegated to an LLM.

| Field | Required | Default | Description |
|---|:---:|---|---|
| Code | ✅ | — | Python code to execute. Supports `{{variables}}` interpolation. |
| Input Variables | — | — | Variables injected into the sandbox's scope before execution. |
| Output Variable | — | `codeResult` | Variable with stdout output and any returned value. |
| Timeout (ms) | — | `10000` | Maximum execution time before kill. |

> Runs in a separate process with no network access and read-only filesystem. `pandas`, `numpy`, and `json` are pre-installed.

---

### project_context — Project Context

Reads files from the project directory and injects their content into a flow variable. Place at the start of any pipeline to give downstream agents awareness of coding conventions, rules, and CLAUDE.md instructions.

| Field | Required | Default | Description |
|---|:---:|---|---|
| Context Files | — | `["CLAUDE.md"]` | Glob patterns or exact paths to load (e.g. `["CLAUDE.md", ".claude/rules/*.md"]`). |
| Example Files | — | — | Additional files loaded as fenced code blocks (e.g. reference implementations). |
| Context Label | — | `Project Context` | Human-readable label for the loaded context. |
| Max Tokens | — | `4000` | Truncation limit. Loaded content is trimmed to this many tokens. |
| Output Variable | — | `projectContext` | Variable with the concatenated file contents. |

**Typical use:** First node in SDLC and DevSecOps pipelines — ensures Code Gen, Review, and Retry agents all see project conventions.

---

### sandbox_verify — Sandbox Verify

Runs deterministic quality checks on generated code before it reaches the PR Gate. Catches TypeScript errors, ESLint violations, and forbidden patterns (e.g. `@prisma/client`, `any` types, `console.log`) without spending AI tokens.

| Field | Required | Default | Description |
|---|:---:|---|---|
| Input Variable | ✅ | `generatedCode` | Variable holding a `CodeGenOutput` JSON object (with a `files` array). |
| Checks | — | `["forbidden_patterns"]` | Which checks to run: `typecheck`, `lint`, `forbidden_patterns`. |
| Forbidden Patterns | — | Built-in set | Extra regex patterns to flag as failures. |
| Input Schema | — | — | Optional named schema (e.g. `CodeGenOutput`) to validate the input before running checks. |
| Output Variable | — | `sandboxResult` | Variable with `PASS` or `FAIL: <details>`. |

**Routes:** `passed` → next node on success, `failed` → retry or failure branch.

**Built-in forbidden patterns:**
- `@prisma/client` — use `@/generated/prisma` instead
- `: any` — no `any` types allowed
- `console.log/warn/error` — use `logger` from `@/lib/logger`

---
