# Web Browsing Implementation Plan for Agent Studio

## Overview

Add web browsing capabilities to agent-studio in 3 phases, leveraging
the existing MCP infrastructure (client, pool, per-agent tool filtering, UI).

---

## Phase 1: Playwright MCP Server Integration (No new code)

**Goal:** Agents can navigate, click, type, and read web pages immediately
by connecting to @playwright/mcp as an external MCP server.

**What already exists:**
- `src/lib/mcp/client.ts` — getMCPToolsForAgent, callMCPTool, testMCPConnection
- `src/lib/mcp/pool.ts` — connection pool with 5min TTL, max 50 connections
- `src/lib/runtime/handlers/mcp-tool-handler.ts` — deterministic MCP tool calls
- `src/components/mcp/mcp-server-manager.tsx` — UI for adding MCP servers
- `src/components/mcp/agent-mcp-selector.tsx` — per-agent server picker
- AI Response nodes already auto-inject MCP tools into streamText/generateText

**Steps:**

### 1.1 Install @playwright/mcp as dev dependency
```bash
pnpm add @playwright/mcp
```

### 1.2 Add npm script to start the MCP server locally
In `package.json`, add to scripts:
```json
{
  "mcp:playwright": "npx @playwright/mcp --port 3100"
}
```

### 1.3 Add Playwright MCP as a server through the existing UI
- Open dashboard → MCP Servers → Add Server
- Name: "Playwright Browser"
- URL: http://localhost:3100/mcp
- Transport: Streamable HTTP
- Test Connection → should return browser tools

### 1.4 Connect to an agent
- Open agent in flow builder
- Click MCP button → select "Playwright Browser"
- Optionally filter tools (browser_navigate, browser_click, browser_type,
  browser_snapshot, browser_screenshot)

### 1.5 Test with AI Response node
- Create a flow: Message → AI Response → Message
- System prompt: "You have browser tools. Navigate to https://news.ycombinator.com
  and tell me the top 3 stories."
- The AI will automatically call browser_navigate, then browser_snapshot,
  then respond with extracted content.

**Tools available from @playwright/mcp:**
- browser_navigate — go to URL
- browser_click — click element by ref
- browser_type — type text in input
- browser_snapshot — get accessibility tree (text, no screenshot needed)
- browser_screenshot — take screenshot (requires vision model)
- browser_tab_list — list open tabs
- browser_tab_new — open new tab
- browser_tab_close — close tab
- browser_go_back / browser_go_forward — navigation history
- browser_press_key — keyboard input
- browser_select_option — dropdown selection
- browser_hover — hover over element
- browser_drag — drag and drop
- browser_handle_dialog — accept/dismiss alerts
- browser_file_upload — upload files
- browser_pdf_save — save page as PDF
- browser_wait — wait for page changes
- browser_close — close browser
- browser_resize — resize viewport
- browser_network_requests — capture network requests

**Estimated time:** 15-30 minutes (no code changes needed)

---

## Phase 2: Web Fetch Node (New node type)

**Goal:** Dedicated node for simple content extraction from URLs.
No browser needed — just fetch URL and return clean markdown.
Covers 80% of use cases (reading news, docs, articles).

**Steps:**

### 2.1 Add "web_fetch" to NodeType union
File: `src/types/index.ts`
```typescript
export type NodeType =
  // ... existing types ...
  | "switch"
  | "web_fetch";  // NEW
```

### 2.2 Create web-fetch-handler.ts
File: `src/lib/runtime/handlers/web-fetch-handler.ts`

Properties:
- `url` (string, supports {{variable}} templates)
- `provider` ("jina" | "raw") — jina uses r.jina.ai for clean markdown,
  raw uses the existing scraper.ts (cheerio)
- `outputVariable` (string, default "web_content")
- `maxLength` (number, default 10000 — truncate to prevent context overflow)

Logic:
1. Resolve URL from template variables
2. If provider === "jina":
   - fetch(`https://r.jina.ai/${resolvedUrl}`, { headers: { Accept: "text/markdown" } })
   - Return markdown content
3. If provider === "raw":
   - Use existing `src/lib/knowledge/scraper.ts` (already fetches and parses HTML)
   - Use existing `src/lib/knowledge/parsers.ts` parseHTML (cheerio, strips nav/footer)
4. Truncate to maxLength
5. Store in outputVariable

Handler returns: { messages: [], updatedVariables: { [outputVariable]: content } }

### 2.3 Register handler
File: `src/lib/runtime/handlers/index.ts`
```typescript
import { webFetchHandler } from "./web-fetch-handler";
// ...
const handlers: Record<string, NodeHandler> = {
  // ... existing ...
  web_fetch: webFetchHandler,
};
```

### 2.4 Create node display component
File: `src/components/builder/nodes/web-fetch-node.tsx`

Use BaseNode with Globe icon, cyan color.
Show URL and provider in node body.

### 2.5 Add to node picker
File: `src/components/builder/node-picker.tsx`

Add to NODE_DEFINITIONS array:
```typescript
{
  type: "web_fetch",
  label: "Web Fetch",
  description: "Fetch and extract content from a URL",
  icon: Globe,     // or use GlobeLock from lucide-react
  color: "cyan",
  category: "Integrations",
  defaultData: {
    label: "Web Fetch",
    url: "",
    provider: "jina",
    outputVariable: "web_content",
    maxLength: 10000,
  },
}
```

### 2.6 Add property editor
File: `src/components/builder/property-panel.tsx`

Add case for "web_fetch" node type:
- Input: URL (text field, supports {{variable}})
- Select: Provider (Jina Reader / Raw HTML)
- Input: Output Variable name
- Input: Max Length (number)

### 2.7 Add to flow content validation
File: `src/lib/validators/flow-content.ts`

Add "web_fetch" to the allowed node types.

### 2.8 Write unit tests
File: `src/lib/runtime/handlers/__tests__/web-fetch-handler.test.ts`

Test cases:
- Successful Jina fetch returns markdown
- Successful raw fetch uses scraper
- URL template resolution works
- Content truncation at maxLength
- Network error returns graceful error message
- Missing URL returns error message

### 2.9 Optional: Knowledge base integration
After fetching content, optionally save it as a KB source:
- Add `saveToKB` boolean property to node
- If true, call existing ingest pipeline (chunk → embed → store)
- Reuse: `src/lib/knowledge/ingest.ts`

**Estimated time:** 1 day

---

## Phase 3: Browser Action Node (UX improvement)

**Goal:** Dedicated visual node for browser automation with a friendly UI.
Wraps Playwright MCP tool calls in a purpose-built node with dropdowns
and visual action builder instead of raw MCP tool configuration.

**Steps:**

### 3.1 Add "browser_action" to NodeType union
File: `src/types/index.ts`
```typescript
export type NodeType =
  // ... existing types ...
  | "web_fetch"
  | "browser_action";  // NEW
```

### 3.2 Create browser-action-handler.ts
File: `src/lib/runtime/handlers/browser-action-handler.ts`

Properties:
- `mcpServerId` (string — which Playwright MCP server to use)
- `actions` (array of action steps):
  ```typescript
  type BrowserStep =
    | { action: "navigate"; url: string }
    | { action: "click"; selector: string }
    | { action: "type"; selector: string; text: string }
    | { action: "snapshot"; description?: string }
    | { action: "screenshot" }
    | { action: "wait"; timeout: number }
    | { action: "select"; selector: string; value: string }
    | { action: "save_pdf"; filename: string }
  ```
- `outputVariable` (string, default "browser_result")

Logic:
1. For each action in actions array:
   - Map to corresponding Playwright MCP tool call
   - Use existing `callMCPTool(mcpServerId, toolName, args)`
   - Collect results
2. Store final result in outputVariable
3. Support {{variable}} templates in URLs, selectors, text

This handler is essentially a sequence runner on top of existing
`callMCPTool` — no new MCP infrastructure needed.

### 3.3 Register handler
File: `src/lib/runtime/handlers/index.ts`

### 3.4 Create node display component
File: `src/components/builder/nodes/browser-action-node.tsx`

Show list of actions visually (icons for navigate, click, type).
Use Monitor icon, indigo color.

### 3.5 Add to node picker
File: `src/components/builder/node-picker.tsx`
```typescript
{
  type: "browser_action",
  label: "Browser Action",
  description: "Automate browser: navigate, click, type, extract",
  icon: Monitor,       // from lucide-react
  color: "indigo",
  category: "Integrations",
  defaultData: {
    label: "Browser Action",
    mcpServerId: "",
    actions: [{ action: "navigate", url: "" }],
    outputVariable: "browser_result",
  },
}
```

### 3.6 Add property editor with action builder
File: `src/components/builder/property-panel.tsx`

Custom UI for browser_action:
- Dropdown: Select MCP server (filter to Playwright-compatible)
- Action list builder (add/remove/reorder steps):
  - Each step has action type dropdown + relevant fields
  - Navigate: URL input
  - Click: Selector input (or "description" for AI-based click)
  - Type: Selector + text inputs
  - Snapshot: Optional description
  - Wait: Timeout input
- Output variable name

### 3.7 Add to flow content validation
File: `src/lib/validators/flow-content.ts`

### 3.8 Write unit tests
File: `src/lib/runtime/handlers/__tests__/browser-action-handler.test.ts`

Test cases:
- Single navigate action calls callMCPTool correctly
- Multi-step sequence executes in order
- Template variables resolve in URLs and text
- MCP server not found returns graceful error
- Tool not found returns graceful error
- Empty actions array returns error

### 3.9 Add E2E test
File: `e2e/tests/browser-action.spec.ts`

Test the browser action node appears in picker, can be configured in
property panel, and displays correctly on canvas.

**Estimated time:** 2-3 days

---

## File Change Summary

### Phase 1 (no code changes)
- `package.json` — add mcp:playwright script, add @playwright/mcp dependency

### Phase 2 (web_fetch node)
- `src/types/index.ts` — add "web_fetch" to NodeType
- `src/lib/runtime/handlers/web-fetch-handler.ts` — NEW
- `src/lib/runtime/handlers/index.ts` — register web_fetch
- `src/lib/runtime/handlers/__tests__/web-fetch-handler.test.ts` — NEW
- `src/components/builder/nodes/web-fetch-node.tsx` — NEW
- `src/components/builder/node-picker.tsx` — add web_fetch definition
- `src/components/builder/property-panel.tsx` — add web_fetch case
- `src/lib/validators/flow-content.ts` — add "web_fetch" to allowed types

### Phase 3 (browser_action node)
- `src/types/index.ts` — add "browser_action" to NodeType
- `src/lib/runtime/handlers/browser-action-handler.ts` — NEW
- `src/lib/runtime/handlers/index.ts` — register browser_action
- `src/lib/runtime/handlers/__tests__/browser-action-handler.test.ts` — NEW
- `src/components/builder/nodes/browser-action-node.tsx` — NEW
- `src/components/builder/node-picker.tsx` — add browser_action definition
- `src/components/builder/property-panel.tsx` — add browser_action case
- `src/lib/validators/flow-content.ts` — add "browser_action" to allowed types
- `e2e/tests/browser-action.spec.ts` — NEW

---

## Architecture Diagram

```
User builds flow in editor
        │
        ▼
┌──────────────┐     ┌──────────────┐     ┌──────────────────┐
│  Web Fetch   │     │Browser Action│     │   AI Response    │
│   (Phase 2)  │     │  (Phase 3)   │     │ + MCP Tools      │
│              │     │              │     │   (Phase 1)      │
│ Jina / Raw   │     │ Multi-step   │     │ Auto-injects     │
│ HTTP fetch   │     │ action list  │     │ browser tools    │
└──────┬───────┘     └──────┬───────┘     └────────┬─────────┘
       │                    │                      │
       │                    ▼                      ▼
       │             ┌─────────────────────────────────┐
       │             │      callMCPTool()               │
       │             │  (existing src/lib/mcp/client.ts)│
       │             └──────────────┬──────────────────┘
       │                            │
       │                            ▼
       │             ┌─────────────────────────────────┐
       │             │     MCP Connection Pool          │
       │             │  (existing src/lib/mcp/pool.ts)  │
       │             └──────────────┬──────────────────┘
       │                            │
       ▼                            ▼
┌──────────────┐     ┌─────────────────────────────────┐
│  Jina Reader │     │    @playwright/mcp server        │
│  r.jina.ai   │     │    (localhost:3100)              │
│  (external)  │     │                                  │
└──────────────┘     │  ┌─────────────────────────┐    │
                     │  │   Chromium browser       │    │
                     │  │   (headless)             │    │
                     │  └─────────────────────────┘    │
                     └─────────────────────────────────┘
```

---

## Implementation Order

1. **Phase 1** — Do first (15 min). Gives immediate browsing capability
   through AI Response + MCP. No code changes.

2. **Phase 2** — Do second (1 day). Most commonly needed feature.
   Simple URL → content extraction without browser overhead.

3. **Phase 3** — Do third (2-3 days). UX polish for power users who
   need multi-step browser automation workflows.

## Notes

- @playwright/mcp uses accessibility tree by default (no vision needed)
- MCP server runs as separate process (started with npm script)
- For production: consider Browserbase MCP for cloud-hosted browsers
- All browser tools work through existing MCP infrastructure — no engine changes
- Rate limiting already applies through existing rate-limit.ts
- Connection pooling already handles MCP server lifecycle
