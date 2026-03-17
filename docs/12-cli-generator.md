# CLI Generator — Complete Guide

## What is the CLI Generator?

The CLI Generator is a feature that automatically wraps any CLI application as a fully functional
MCP (Model Context Protocol) server. Instead of manually writing a bridge layer, you provide the
application name and a short description — a 6-phase AI pipeline produces all the necessary
Python files, ready to install and use.

The generated MCP server can then be registered in your Agent Studio account and attached to any
agent, enabling the agent to invoke CLI commands as tools.

Navigate to `/cli-generator` to start a new generation.

---

## The 6-Phase Pipeline

Each generation goes through 6 phases in sequence. Phases run server-side (Vercel serverless),
and the frontend drives progress by calling `/advance` in a loop after each phase completes.

| Phase | Name | Status enum | What happens |
|-------|------|-------------|--------------|
| 0 | Analyze | `ANALYZING` | AI detects CLI binary paths, subcommands, flags, and platform behaviors |
| 1 | Design | `DESIGNING` | AI designs MCP tool signatures: names, parameters, types, descriptions |
| 2 | Implement | `IMPLEMENTING` | AI generates `main.py`, `bridge.py`, `server.py`, `__init__.py` — one file per AI call |
| 3 | Write Tests | `TESTING` | AI generates `conftest.py`, `test_bridge.py`, `test_server.py` |
| 4 | Document | `DOCUMENTING` | AI generates `README.md` |
| 5 | Publish | `PUBLISHING` | AI generates `requirements.txt`, `pyproject.toml`, MCP config; optionally registers MCP server |

---

## Generated Files

After a successful generation, 10 files are available for download:

| File | Purpose |
|------|---------|
| `server.py` | FastMCP server — registers all tools via `@server.tool()` decorators |
| `bridge.py` | Bridge class — translates tool parameters to CLI subprocess arguments |
| `main.py` | Click-based CLI interface mirroring the original application's commands |
| `__init__.py` | Package initializer |
| `conftest.py` | Pytest fixtures (mocked subprocess, config, CLI path) |
| `test_bridge.py` | Unit tests for the Bridge class (mocked subprocess calls) |
| `test_server.py` | Unit tests for FastMCP tool registration and server instance |
| `requirements.txt` | Pinned pip dependencies |
| `pyproject.toml` | PEP 621 project metadata (hatchling build backend) |
| `README.md` | Installation and usage documentation |

---

## FastMCP Pattern (Critical)

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

## Installing and Running Generated Files

```bash
# 1. Create a virtual environment
python -m venv .venv
source .venv/bin/activate    # macOS/Linux
# or .venv\Scripts\activate  # Windows

# 2. Install dependencies
pip install -r requirements.txt
# or: pip install mcp click

# 3. Run the MCP server
python server.py

# 4. Run tests
pytest test_bridge.py test_server.py -v
```

The CLI binary referenced in `bridge.py` must be installed and available in `PATH` for the
bridge methods to actually execute commands. The generated tests mock subprocess calls, so they
pass without the real binary installed.

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
| `/api/cli-generator` | POST | Create a new generation `{ applicationName, description? }` |
| `/api/cli-generator/[id]` | GET | Get generation detail (includes `generatedFiles`, `phases`) |
| `/api/cli-generator/[id]/advance` | POST | Run the next pending phase and persist result |
| `/api/cli-generator/[id]/resume` | POST | Reset stuck phase and re-run it |
| `/api/cli-generator/[id]/files` | GET | List filenames of generated files |
| `/api/cli-generator/[id]/download` | GET | Download all files as a `.zip` archive |
| `/api/cli-generator/[id]/logs` | GET | Per-phase logs and token usage stats |
| `/api/cli-generator/[id]/publish` | POST | Register generated bridge as MCP server |

**Auth:** All endpoints require a valid session (`requireAuth()`). Generations are scoped to the
authenticated user — cross-user access returns 403.

---

## Architecture Notes

### Frontend-driven pipeline loop

The frontend calls `/advance` after every phase completes, rather than the server running all
phases in one long serverless invocation. This avoids Vercel's 60-second function timeout for
AI-heavy pipelines and gives the UI real-time phase-by-phase progress.

### Per-file AI generation (phases 2 and 3)

The implement and test phases call `buildImplementSingleFilePrompt()` once per file. Each call
generates exactly one file's content using `generateObject()` with a `FileContentSchema`. This
avoids context overflow when generating multiple files at once and makes individual file retries
easy.

### Zod schemas for all AI outputs

All 6 phases use `generateObject()` with Zod schemas from `src/lib/cli-generator/schemas.ts`.
This eliminates the need for fragile `JSON.parse` / repair logic and gives type-safe AI outputs.

### System/user prompt separation

Prompts are split into `system` (stable instructions, cacheable) and `user` (dynamic per-run
context). This structure supports Anthropic's prompt caching and reduces token costs on retries.

---

## Troubleshooting

**Generation stuck on "Implementing"**
Click Resume. If it fails again, check the error message in the phase log — it usually indicates
a model timeout or malformed AI output.

**`AttributeError: module 'mcp' has no attribute 'Server'`**
The generated `server.py` used an outdated API. This is fixed in the current prompts. Re-run the
generation to get a corrected `server.py` using FastMCP.

**Tests fail with import errors**
Ensure `mcp` is installed: `pip install mcp>=1.0`. The `from mcp.server.fastmcp import FastMCP`
import requires `mcp>=1.0`.

**Bridge methods call wrong CLI arguments**
The AI infers argument structure from the application name and description. If the generated
bridge doesn't match the real CLI's argument format, edit `bridge.py` manually to align with
the actual command signatures.
