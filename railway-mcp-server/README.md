# railway-mcp-server

Custom [MCP](https://modelcontextprotocol.io) server for the **Railway** public GraphQL API.
Scope: **read + limited write** (no deletes). Local **stdio** transport.

Built against Railway's official API docs (`docs.railway.com/integrations/api`).
Endpoint: `https://backboard.railway.com/graphql/v2`.

## Tools

| Tool | Type | Description |
|---|---|---|
| `railway_whoami` | read | Authenticated user (verify token). Account tokens only. |
| `railway_list_projects` | read | List projects (optional `workspaceId`). |
| `railway_get_project` | read | Project by ID with services + environments. |
| `railway_list_environments` | read | Environments (excludes ephemeral by default), flags production. |
| `railway_get_variables` | read | Variables for a service/environment — **passwords masked**. |
| `railway_inspect_databases` | read | Finds Postgres DBs, reports `host:port/db` **without password**, flags production. |
| `railway_set_variables` | write* | Upsert variables (never deletes; no `replace`). |
| `railway_redeploy_service` | write* | Redeploy a service's latest deployment. |

\* Write tools are marked `destructiveHint: true`; MCP clients prompt before running them. No delete/transfer operations are exposed.

## Setup

```bash
npm install
npm run build
export RAILWAY_TOKEN="..."   # from https://railway.com/account/tokens
npm test                     # unit tests (no token / network needed)
node dist/index.js           # runs the stdio server
```

### Smoke test the token (optional, no MCP)

```bash
curl -X POST https://backboard.railway.com/graphql/v2 \
  -H "Authorization: Bearer $RAILWAY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query":"query { me { name email } }"}'
```

## Connect to an MCP client (stdio)

Example client config entry:

```json
{
  "mcpServers": {
    "railway": {
      "command": "node",
      "args": ["/absolute/path/to/railway-mcp-server/dist/index.js"],
      "env": { "RAILWAY_TOKEN": "your-token" }
    }
  }
}
```

## Security

- Token read only from `RAILWAY_TOKEN`; never logged.
- Passwords inside connection strings are masked at a single choke point (`src/util/redact.ts`, `parseConnectionUrl.ts`) and covered by unit tests.
- Honors HTTP 429 (`Retry-After`) with bounded retries.
- Token types: **account** / **workspace** use `Authorization: Bearer`; project tokens (`Project-Access-Token`) are out of scope.
