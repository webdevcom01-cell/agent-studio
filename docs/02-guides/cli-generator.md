# CLI Generator — Complete Guide

## What is the CLI Generator?

The CLI Generator is a feature that automatically wraps any CLI application as a fully functional
MCP (Model Context Protocol) server. Instead of manually writing a bridge layer, you provide the
application name, a short description, and a **target runtime** — a 6-phase AI pipeline produces
all the necessary files, ready to install and use.

Two targets are supported:

- **Python** (default) — generates a [FastMCP](https://github.com/jlowin/fastmcp) server (`mcp>=1.0`)
- **TypeScript** — generates a [Node.js MCP SDK](https://github.com/modelcontextprotocol/typescript-sdk) server (`@modelcontextprotocol/sdk>=1.0`)

The generated MCP server can then be registered in your Agent Studio account and attached to any
agent, enabling the agent to invoke CLI commands as tools.

Navigate to `/cli-generator` to start a new generation.

---

## The 6-Phase Pipeline

Each generation goes through 6 phases in sequence. Phases run server-side (Vercel serverless),
and the frontend drives progress by calling `/advance` in a loop after each phase completes.

Phases 0–1 are **language-agnostic**. Phases 2–5 branch by target.

| Phase | Name | Status enum | Python output | TypeScript output |
|-------|------|-------------|---------------|-------------------|
| 0 | Analyze | `ANALYZING` | CLI binary paths, subcommands, flags, platform behaviors | ← same |
| 1 | Design | `DESIGNING` | MCP tool signatures: names, parameters, types, descriptions | ← same |
| 2 | Implement | `IMPLEMENTING` | `main.py`, `bridge.py`, `server.py`, `__init__.py` | `index.ts`, `bridge.ts`, `server.ts` |
| 3 | Write Tests | `TESTING` | `conftest.py`, `test_bridge.py`, `test_server.py` | `bridge.test.ts`, `server.test.ts` |
| 4 | Document | `DOCUMENTING` | `README.md` (pip/Python focused) | `README.md` (npm/Node.js focused) |
| 5 | Publish | `PUBLISHING` | `requirements.txt`, `pyproject.toml`, MCP config | `package.json`, `tsconfig.json`, MCP config |

---

## Generated Files

### Python target (10 files)

| File | Purpose |
|------|---------|
| `server.py` | FastMCP server — registers tools via `@server.tool()` decorators |
| `bridge.py` | Bridge class — translates tool parameters to CLI subprocess arguments (`subprocess.run`) |
| `main.py` | Click-based CLI interface mirroring the original application's commands |
| `__init__.py` | Package initializer |
| `conftest.py` | Pytest fixtures (mocked subprocess, config, CLI path) |
| `test_bridge.py` | Unit tests for the Bridge class (mocked subprocess calls) |
| `test_server.py` | Unit tests for FastMCP tool registration and server instance |
| `requirements.txt` | Pinned pip dependencies |
| `pyproject.toml` | PEP 621 project metadata (hatchling build backend) |
| `README.md` | Installation and usage documentation |

### TypeScript target (8 files)

| File | Purpose |
|------|---------|
| `server.ts` | MCP server — registers tools via `server.registerTool()` (Node.js MCP SDK 2026 standard) |
| `bridge.ts` | Bridge class — translates tool parameters to CLI subprocess arguments (`child_process.spawnSync`) |
| `index.ts` | Entry point — instantiates the bridge and starts the server |
| `bridge.test.ts` | Vitest unit tests for the Bridge class (mocked `spawnSync`) |
| `server.test.ts` | Vitest unit tests for tool registration and server instance |
| `package.json` | npm manifest — `"type": "module"`, MCP SDK + Zod deps, Vitest dev dep |
| `tsconfig.json` | TypeScript config — ES2022, NodeNext module resolution, strict |
| `README.md` | Installation and usage documentation |

---

## Python FastMCP Pattern (Critical)

`server.py` always uses **FastMCP** from `mcp.server.fastmcp`. The old `mcp.Server` API does not
exist in `mcp>=1.0`. The correct pattern is:

```python
from mcp.server.fastmcp import FastMCP

server = FastMCP("app-name")

@server.tool()
def app_subcommand(arg: str, flag: bool = False) -> str:
    """Tool description."""
    bridge = Bridge()
    result = bridge.app_subcommand(arg, flag=flag)
    return result["output"]

if __name__ == "__main__":
    server.run()
```

If you encounter `AttributeError: module 'mcp' has no attribute 'Server'`, the generation used
an outdated prompt. Re-run or resume the generation — the prompts in `prompts.ts` enforce FastMCP.

---

## TypeScript Node.js MCP SDK Pattern (Critical)

`server.ts` always uses **`McpServer`** from `@modelcontextprotocol/sdk/server/mcp.js` with
`server.registerTool()`. The old `server.tool()` method is **deprecated** and must never be used.
All imports use ESM `.js` extension even for `.ts` source files.

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { bridge } from "./bridge.js";

export const server = new McpServer({
  name: "app-name",
  version: "1.0.0",
});

server.registerTool("app_subcommand", {
  title: "Subcommand",
  description: "What this tool does.",
  inputSchema: {
    arg: z.string().describe("The argument"),
    flag: z.boolean().optional().describe("Optional flag"),
  },
  async execute({ arg, flag }) {
    const result = bridge.execute("app", ["subcommand", arg, ...(flag ? ["--flag"] : [])]);
    if (!result.success) throw new Error(result.error);
    return { content: [{ type: "text", text: result.output }] };
  },
});

const transport = new StdioServerTransport();
await server.connect(transport);
```

`bridge.ts` uses `child_process.spawnSync` (synchronous, no callbacks):

```typescript
import { spawnSync, SpawnSyncOptionsWithStringEncoding } from "child_process";

export interface BridgeResult {
  success: boolean;
  output: string;
  error: string;
}

export class Bridge {
  private timeout: number;

  constructor(timeout = 30_000) {
    this.timeout = timeout;
  }

  execute(command: string, args: string[]): BridgeResult {
    const options: SpawnSyncOptionsWithStringEncoding = {
      encoding: "utf-8",
      timeout: this.timeout,
    };
    const result = spawnSync(command, args, options);
    return {
      success: result.status === 0,
      output: result.stdout ?? "",
      error: result.stderr ?? "",
    };
  }
}

export const bridge = new Bridge();
```

---

## Installing and Running Generated Files

### Python

```bash
# 1. Create a virtual environment
python -m venv .venv
source .venv/bin/activate    # macOS/Linux
# or .venv\Scripts\activate  # Windows

# 2. Install dependencies
pip install -r requirements.txt
# or: pip install "mcp>=1.0" click

# 3. Run the MCP server
python server.py

# 4. Run tests
pytest test_bridge.py test_server.py -v
```

### TypeScript

```bash
# 1. Install dependencies
npm install

# 2. Build
npm run build          # tsc → dist/

# 3. Run the MCP server
npm start              # node dist/server.js

# 4. Run tests
npm test               # vitest run

# Development (no build step)
npm run dev            # npx tsx server.ts
```

The CLI binary referenced in the bridge must be installed and available in `PATH` for the
bridge methods to actually execute commands. The generated tests mock subprocess calls, so they
pass without the real binary installed.

---

## MCP Client Configuration

The publish phase outputs the correct MCP config for each target:

**Python:**
```json
{
  "command": "python",
  "args": ["server.py"]
}
```

**TypeScript (after `npm run build`):**
```json
{
  "command": "node",
  "args": ["dist/server.js"]
}
```

---

## Stuck Detection and Resume

A generation is considered **stuck** if its `updatedAt` timestamp has not changed for more than
5 minutes while still in a non-terminal status (not COMPLETED or FAILED).

The UI displays an `⚠` icon next to stuck generations. Clicking **Resume** calls
`POST /api/cli-generator/[generationId]/resume`, which:

1. Resets the current phase status to `pending`
2. Sets the generation status back to the appropriate in-progress enum
3. Re-invokes the phase runner for the stuck phase

The `STUCK_THRESHOLD_MS` constant (5 minutes) lives in `src/lib/cli-generator/types.ts`.

---

## Publishing as an MCP Server

After a generation reaches `COMPLETED`, click **Publish** to register the bridge as an MCP
server in your Agent Studio account. This calls `POST /api/cli-generator/[generationId]/publish`,
which:

1. Creates a new `MCPServer` record for the user
2. Links it to the `CLIGeneration` record via `mcpServerId`
3. Sets the server URL and transport type based on the generated `mcp_config`

Once published, the MCP server appears in your global MCP Servers list and can be attached to
any agent via the flow builder.

---

## API Reference

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/cli-generator` | GET | List all generations for the current user |
| `/api/cli-generator` | POST | Create a new generation `{ applicationName, description?, target? }` |
| `/api/cli-generator/[id]` | GET | Get generation detail (includes `generatedFiles`, `phases`, `target`) |
| `/api/cli-generator/[id]/advance` | POST | Run the next pending phase and persist result |
| `/api/cli-generator/[id]/resume` | POST | Reset stuck phase and re-run it |
| `/api/cli-generator/[id]/files` | GET | List filenames of generated files |
| `/api/cli-generator/[id]/download` | GET | Download all files as a `.zip` archive |
| `/api/cli-generator/[id]/logs` | GET | Per-phase logs and token usage stats |
| `/api/cli-generator/[id]/publish` | POST | Register generated bridge as MCP server |

**`target` field:** Pass `"typescript"` in the POST body to generate a TypeScript bridge.
Omit or pass `"python"` for the default Python output.

**Auth:** All endpoints require a valid session (`requireAuth()`). Generations are scoped to the
authenticated user — cross-user access returns 403.

---

## Architecture Notes

### Frontend-driven pipeline loop

The frontend calls `/advance` after every phase completes, rather than the server running all
phases in one long serverless invocation. This avoids Vercel's function timeout for AI-heavy
pipelines and gives the UI real-time phase-by-phase progress.

### Target branching in ai-phases.ts

Phases 0–1 (`aiAnalyze`, `aiDesign`) are language-agnostic. From phase 2 onward, each runner
checks `config.target`:

- `aiImplement`: uses `IMPLEMENT_FILES` (Python) or `TS_IMPLEMENT_FILES` (TypeScript)
- `aiTest`: uses `extractPythonSignatures` or `extractTypeScriptSignatures` + matching file specs
- `aiDocs`: calls `buildDocsPrompt` or `buildTSDocsPrompt`
- `aiPublish`: uses `PublishOutputSchema` or `TSPublishOutputSchema`

### Per-file AI generation (phases 2 and 3)

The implement and test phases call a single-file prompt builder once per file. Each call
generates exactly one file's content using `generateObject()` with a `FileContentSchema`. This
avoids context overflow when generating multiple files at once and makes individual file retries
easy.

### Zod schemas for all AI outputs

All 6 phases use `generateObject()` with Zod schemas from `src/lib/cli-generator/schemas.ts`.
`TSPublishOutputSchema` covers the TypeScript publish output (`package.json`, `tsconfig.json`,
`mcp_config`). This eliminates fragile `JSON.parse` / repair logic and gives type-safe AI outputs.

### System/user prompt separation

Prompts are split into `system` (stable instructions, cacheable) and `user` (dynamic per-run
context). This structure supports Anthropic's prompt caching and reduces token costs on retries.

### Tool extraction in mcp-registration.ts

`extractToolsFromFiles()` auto-detects the target from the generated file set:

- **Python:** finds `@server.tool()` decorator lines in `.py` files
- **TypeScript:** finds `server.registerTool("tool_name", ...)` calls in `.ts` files (ignores `.test.ts`)

---

## Troubleshooting

**Generation stuck on a phase**
Click Resume. If it fails again, check the error message in the phase log — it usually indicates
a model timeout or malformed AI output.

**Python — `AttributeError: module 'mcp' has no attribute 'Server'`**
The generated `server.py` used an outdated API. This is fixed in the current prompts. Re-run the
generation to get a corrected `server.py` using FastMCP.

**Python — Tests fail with import errors**
Ensure `mcp` is installed: `pip install "mcp>=1.0"`. The `from mcp.server.fastmcp import FastMCP`
import requires `mcp>=1.0`.

**TypeScript — `server.tool is not a function`**
The generated `server.ts` used the deprecated `server.tool()` API instead of `server.registerTool()`.
This is fixed in the current prompts. Re-run the generation.

**TypeScript — `ERR_MODULE_NOT_FOUND` on `.js` imports**
TypeScript with `"module": "NodeNext"` requires `.js` extensions on imports even for `.ts` source
files. This is enforced by the current prompts. Re-run the generation if older files are missing
the extensions.

**TypeScript — Tests fail with `Cannot find module 'vitest'`**
Run `npm install` first. Vitest is listed under `devDependencies` in the generated `package.json`.

**Bridge methods call wrong CLI arguments**
The AI infers argument structure from the application name and description. If the generated
bridge doesn't match the real CLI's argument format, edit the bridge file manually to align with
the actual command signatures.
