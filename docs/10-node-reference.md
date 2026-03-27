# Node Reference — All 34 Node Types

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
| Enable Agent Orchestration | — | off | When on, the AI can call sibling agents as tools during generation. |

> **Tip:** When connected downstream from a KB Search node, `{{kb_context}}` is automatically available in the system prompt — no manual wiring needed.

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

**Example pattern:** Capture → MCP Tool (`search` tool with `{{user_question}}`) → AI Response (uses `{{search_results}}` in system prompt).

---

### call_agent — Call Agent

Calls another agent and waits for its response. Use it for agent-to-agent orchestration and task delegation.

| Field | Required | Default | Description |
|---|:---:|---|---|
| Agent | ✅ | — | Searchable dropdown of available agents in your workspace. |
| Input | — | — | Message or context to send to the called agent. Supports `{{variables}}`. |
| Output Variable | — | `agent_result` | Variable where the called agent's response is stored. |

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
