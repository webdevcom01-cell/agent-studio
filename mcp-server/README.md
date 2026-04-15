# agent-studio-mcp-server

MCP server providing direct read/write access to the agent-studio Railway PostgreSQL database.

Enables Claude to inspect agents, patch flows, change models, and run diagnostics — without writing scripts or redeploying the app.

---

## Tools

### Read
| Tool | What it does |
|------|-------------|
| `as_list_agents` | List all agents with model, status, category |
| `as_get_agent` | Full details + flow node summary for one agent |
| `as_inspect_flow` | Complete flow JSON with all node data and prompts |
| `as_get_recent_executions` | Latest AgentExecution records for an agent |

### Write
| Tool | What it does |
|------|-------------|
| `as_update_agent_model` | Switch model on agent + all ai_response nodes in flow |
| `as_set_agent_public` | Toggle agent's `isPublic` flag (marketplace visibility) |
| `as_patch_node_field` | Update any field in a flow node's data |
| `as_update_agent_prompt` | Replace the prompt on an ai_response node |
| `as_delete_agent` | Permanently delete an agent + all FK-dependent rows (transactional, requires `confirm=true`) |
| `as_update_flow` | Replace entire nodes+edges in a flow — for structural rewiring, adding/removing nodes |

### Diagnostics
| Tool | What it does |
|------|-------------|
| `as_health_check` | DB ping + agent/flow/execution counts |
| `as_diagnose_models` | Find agents whose model requires an API key not set on server |
| `as_find_broken_flows` | Scan all flows for empty prompts, missing outputVariables, bad wiring |

---

## Setup

### 1. Railway deployment

Create a new Railway service pointing to the `mcp-server/` directory in this repo.

Set these environment variables in Railway:
```
DATABASE_URL    = <copy from your Postgres service — internal URL preferred>
MCP_API_KEY     = <generate a strong random key, e.g. openssl rand -hex 32>
PORT            = 3000
TRANSPORT       = http
```

For `DATABASE_URL`, use the **internal** Railway URL (`postgres.railway.internal:5432/...`) so the connection stays inside Railway's private network.

### 2. Connect to Claude / Cowork

In Claude settings → MCP Servers, add:
```
URL:    https://<your-mcp-service>.railway.app/mcp
Header: Authorization: Bearer <your MCP_API_KEY>
```

### 3. Local development

```bash
cd mcp-server
npm install
cp .env.example .env.local
# Fill in DATABASE_URL and optionally MCP_API_KEY
npm run dev
```

For stdio mode (e.g. Claude Code):
```bash
TRANSPORT=stdio DATABASE_URL=... node dist/index.js
```

---

## Security notes

- `MCP_API_KEY` is checked on every `/mcp` request. Without it, any caller can access your database.
- Write tools (`as_update_agent_model`, `as_patch_node_field`, etc.) make real DB changes immediately — no undo.
- The `/health` endpoint is intentionally unauthenticated for Railway health checks.
- Never expose `DATABASE_URL` — it's server-side only.
