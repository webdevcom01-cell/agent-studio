/**
 * Prompt builders for all 6 CLI generator pipeline phases.
 *
 * Each builder returns { system, user } parts (Phase 3 — prompt caching):
 *   - system: stable expert persona + conventions + format schema (cacheable)
 *   - user:   dynamic input — applicationName, capabilities, previousResults
 *
 * This separation enables Anthropic prompt caching (~90% cost reduction on
 * repeated identical system prefixes) and improves behavior with all providers
 * by using proper role-based messages instead of a single mixed string.
 */

interface PromptContext {
  applicationName: string;
  description?: string;
  capabilities?: string[];
  platform?: string;
  previousResults?: unknown[];
}

/** Structured prompt split for system/user role separation. */
export interface PromptParts {
  /** Static expert persona + conventions. Same across calls of the same phase type. */
  system: string;
  /** Dynamic input: applicationName, capabilities, previousResults, etc. */
  user: string;
}

function formatCapabilities(capabilities?: string[]): string {
  if (!capabilities || capabilities.length === 0) return "general-purpose";
  return capabilities.join(", ");
}

function formatPreviousResults(results?: unknown[]): string {
  if (!results || results.length === 0) return "None yet.";
  return JSON.stringify(results, null, 2);
}

/**
 * Extracts Python class/function signatures and decorators from generated files.
 * Used by test phase to give accurate function names/signatures without sending
 * full file content (which gets truncated to 200 chars in summarizeOutput).
 */
export function extractPythonSignatures(output: unknown): Record<string, string> {
  if (typeof output !== "object" || output === null) return {};
  const record = output as Record<string, unknown>;
  const signatures: Record<string, string> = {};

  for (const [filename, content] of Object.entries(record)) {
    if (typeof content !== "string") continue;
    // Content now has real newlines (generateObject returns unescaped strings).
    // Also handle legacy \\n-escaped content from older DB records.
    const lines = content.includes("\\n")
      ? content.split("\\n")
      : content.split("\n");
    const sigLines = lines.filter((line) =>
      /^\s*(class |def |@click\.|@cli\.|@server\.)/.test(line),
    );
    if (sigLines.length > 0) {
      signatures[filename] = sigLines.join("\n");
    }
  }
  return signatures;
}

/**
 * Extracts TypeScript class/function/tool signatures from generated files.
 * Parses export class, export function, export const (arrow functions),
 * and server.registerTool() calls.
 * Used by the test phase to give accurate names/signatures without sending
 * full file content.
 */
export function extractTypeScriptSignatures(output: unknown): Record<string, string> {
  if (typeof output !== "object" || output === null) return {};
  const record = output as Record<string, unknown>;
  const signatures: Record<string, string> = {};

  for (const [filename, content] of Object.entries(record)) {
    if (typeof content !== "string") continue;
    if (!filename.endsWith(".ts")) continue;
    const lines = content.includes("\\n")
      ? content.split("\\n")
      : content.split("\n");
    const sigLines = lines.filter((line) =>
      /^\s*(export\s+(class|function|const|async\s+function)|server\.(registerTool|registerResource)|import\s+)/.test(line),
    );
    if (sigLines.length > 0) {
      signatures[filename] = sigLines.join("\n");
    }
  }
  return signatures;
}

export interface TestFileSpec {
  filename: string;
  description: string;
  guidance: string;
}

// ─── Phase 0: Analyze ────────────────────────────────────────────────────────

export function buildAnalyzePrompt(ctx: PromptContext): PromptParts {
  return {
    system: `You are an expert CLI reverse-engineer. Your task is to analyze desktop applications and determine exactly how they can be controlled via command-line interface.

For any application provided, investigate:
1. Where the CLI binary is typically installed on each platform (macOS/Linux/Windows absolute paths)
2. What subcommands and flags are available
3. Whether the app supports scripting interfaces (AppleScript, COM, D-Bus, pipes, sockets)
4. Platform-specific behaviors, path conventions, and environment requirements

Respond with a JSON object matching the provided schema. No markdown, no code fences, no explanation outside the JSON.`,

    user: `Application: ${ctx.applicationName}
Description: ${ctx.description ?? "No description provided."}
Target capabilities: ${formatCapabilities(ctx.capabilities)}
Target platform: ${ctx.platform ?? "cross-platform"}`,
  };
}

// ─── Phase 1: Design ─────────────────────────────────────────────────────────

export function buildDesignPrompt(ctx: PromptContext): PromptParts {
  return {
    system: `You are an expert MCP tool designer. Design CLI tool schemas compatible with the MCP (Model Context Protocol) tool format.

Tool design conventions:
- Python 3.10+, click for CLI, subprocess.run for execution
- Each tool maps to a CLI subcommand or scripting operation
- Parameters must have type (string|number|boolean), a description, required flag, and optional default
- Tool names must be snake_case, descriptive, and prefixed with the application name

Respond with a JSON object containing a "tools" array matching the provided schema. No markdown, no code fences, no explanation outside the JSON.`,

    user: `Application: ${ctx.applicationName}
Description: ${ctx.description ?? "No description provided."}
Target capabilities: ${formatCapabilities(ctx.capabilities)}
Target platform: ${ctx.platform ?? "cross-platform"}

Previous analysis results:
${formatPreviousResults(ctx.previousResults)}`,
  };
}

// ─── Phase 2: Implement ──────────────────────────────────────────────────────

export interface ImplementFileSpec {
  filename: string;
  description: string;
  guidance: string;
}

export const IMPLEMENT_FILES: ImplementFileSpec[] = [
  {
    filename: "__init__.py",
    description: "Package init with version and public exports",
    guidance: "Simple module init: __version__ = '1.0.0', __author__, and import of main Bridge class. Under 20 lines.",
  },
  {
    filename: "bridge.py",
    description: "Core bridge: argument translation and subprocess execution",
    guidance: "Class Bridge with methods per capability. Use subprocess.run, capture stdout/stderr, configurable timeout=30. Return dict with success, output, error. Under 80 lines.",
  },
  {
    filename: "server.py",
    description: "MCP server that registers tools from the design phase",
    guidance: "Use FastMCP: `from mcp.server.fastmcp import FastMCP`. Create `server = FastMCP('app-name')`. Register each tool from design as `@server.tool()`. Each tool calls Bridge instance methods. Under 80 lines. Do NOT use `mcp.Server` — that API does not exist.",
  },
  {
    filename: "main.py",
    description: "Click CLI entry point with subcommands",
    guidance: "Use click. @click.group() with @cli.command() per capability. Call Bridge. Add --timeout option. Under 60 lines.",
  },
];

export function buildImplementSingleFilePrompt(
  ctx: PromptContext,
  fileSpec: ImplementFileSpec,
): PromptParts {
  return {
    system: `You are an expert Python developer generating CLI bridge source files.

File to generate: ${fileSpec.filename}
Purpose: ${fileSpec.description}
Requirements: ${fileSpec.guidance}

CRITICAL — for server.py only: Use FastMCP, NOT mcp.Server (which does not exist).
Correct pattern:
  from mcp.server.fastmcp import FastMCP
  server = FastMCP("app-name")
  @server.tool()
  def my_tool(arg: str) -> str: ...

Respond with a JSON object with a single key "content" containing the complete file content.
No markdown, no code fences, no explanation outside the JSON.

{"content": "<complete Python file content>"}`,

    user: `Application: ${ctx.applicationName}
Description: ${ctx.description ?? "No description provided."}
Capabilities: ${formatCapabilities(ctx.capabilities)}
Platform: ${ctx.platform ?? "cross-platform"}

Design (tools to implement):
${formatPreviousResults(ctx.previousResults)}`,
  };
}

// ─── Phase 3: Test ───────────────────────────────────────────────────────────

// Legacy single-call test prompt (kept for backwards compat)
export function buildTestPrompt(ctx: PromptContext): PromptParts {
  return {
    system: `You are an expert Python test engineer. Write comprehensive pytest tests for CLI bridge packages.

Test file conventions:
- pytest with subprocess mocking (unittest.mock.patch)
- Test bridge.py: mock subprocess.run, verify argument translation, test timeout handling, test error cases
- Test server.py: verify FastMCP tool registration (from mcp.server.fastmcp import FastMCP), test each @server.tool() function exists and calls Bridge correctly
- Fixtures in conftest.py for reusable test state
- Keep each file CONCISE (under 120 lines). Write focused tests, avoid verbose docstrings.

Respond with a JSON object mapping filenames to file contents. No markdown, no code fences.`,

    user: `Application: ${ctx.applicationName}
Description: ${ctx.description ?? "No description provided."}
Target capabilities: ${formatCapabilities(ctx.capabilities)}
Target platform: ${ctx.platform ?? "cross-platform"}

Previous implementation results:
${formatPreviousResults(ctx.previousResults)}`,
  };
}

export const TEST_FILES: TestFileSpec[] = [
  {
    filename: "conftest.py",
    description: "Shared pytest fixtures",
    guidance: "Mock CLI binary paths, sample subprocess outputs, reusable test configs. Under 40 lines.",
  },
  {
    filename: "test_bridge.py",
    description: "Bridge unit tests",
    guidance: "Mock subprocess.run. Test each Bridge method matches function signatures below. Under 80 lines.",
  },
  {
    filename: "test_server.py",
    description: "MCP server tests",
    guidance: "Test FastMCP server: import server from server.py, verify all tool functions exist and have correct signatures. Mock Bridge._execute via unittest.mock.patch. Test each tool returns expected dict. Under 80 lines. Import Bridge from log_analyzer_bridge.bridge.",
  },
];

export function buildTestSingleFilePrompt(
  ctx: PromptContext,
  fileSpec: TestFileSpec,
  signatures: Record<string, string>,
): PromptParts {
  const sigSummary = Object.entries(signatures)
    .map(([file, sigs]) => `# ${file}\n${sigs}`)
    .join("\n\n");

  return {
    system: `You are an expert Python test engineer generating pytest test files for CLI bridge packages.

File to generate: ${fileSpec.filename}
Purpose: ${fileSpec.description}
Requirements: ${fileSpec.guidance}

Respond with a JSON object with a single key "content" containing the complete file content.
No markdown, no code fences, no explanation outside the JSON.

{"content": "<complete Python test file content>"}`,

    user: `Application: ${ctx.applicationName}
Capabilities: ${formatCapabilities(ctx.capabilities)}
Platform: ${ctx.platform ?? "cross-platform"}

Implementation signatures (actual function names to test against):
${sigSummary || "No signatures extracted — use bridge.py / server.py structure from design."}`,
  };
}

// ─── Phase 4: Docs ───────────────────────────────────────────────────────────

export function buildDocsPrompt(ctx: PromptContext): PromptParts {
  return {
    system: `You are a technical writer specializing in developer documentation for Python CLI tools.

Documentation requirements:
- README.md: concise doc under 80 lines covering exactly these sections:
  ## Installation (pip install command only)
  ## Quick Start (3-step example)
  ## Commands (brief list with 1-line descriptions per command)
  ## MCP Server (config snippet only, no prose)

Respond with a JSON object matching the provided schema. No markdown, no code fences, no explanation outside the JSON.`,

    user: `Application: ${ctx.applicationName}
Description: ${ctx.description ?? "No description provided."}
Target capabilities: ${formatCapabilities(ctx.capabilities)}
Target platform: ${ctx.platform ?? "cross-platform"}

Previous results:
${formatPreviousResults(ctx.previousResults)}`,
  };
}

// ─── Phase 5: Publish ────────────────────────────────────────────────────────

export function buildPublishPrompt(ctx: PromptContext): PromptParts {
  return {
    system: `You are a Python packaging expert. Generate packaging and configuration files for distributable Python CLI bridge packages.

Follow modern Python conventions:
- pyproject.toml: PEP 621 compliant with [project] metadata, dependencies (click>=8.0, mcp>=1.0), [project.scripts] entry points, [build-system] hatchling config
- requirements.txt: pinned direct dependencies for pip install
- mcp_config: JSON object for auto-registration with MCP-compatible hosts

Respond with a JSON object matching the provided schema. No markdown, no code fences, no explanation outside the JSON.`,

    user: `Application: ${ctx.applicationName}
Description: ${ctx.description ?? "No description provided."}
Target capabilities: ${formatCapabilities(ctx.capabilities)}
Target platform: ${ctx.platform ?? "cross-platform"}

Previous implementation results:
${formatPreviousResults(ctx.previousResults)}`,
  };
}

// ─── TypeScript / Node.js MCP SDK variants ───────────────────────────────────
//
// 2026 standard: @modelcontextprotocol/sdk v1.x, McpServer, registerTool(),
// StdioServerTransport, Zod v3 inputSchema, ESM with .js imports.
//

// ─── Phase 2 (TS): Implement ─────────────────────────────────────────────────

export const TS_IMPLEMENT_FILES: ImplementFileSpec[] = [
  {
    filename: "index.ts",
    description: "Package entry — re-exports Bridge class and VERSION constant",
    guidance: "Export Bridge from './bridge.js' and export const VERSION = '1.0.0'. Under 10 lines.",
  },
  {
    filename: "bridge.ts",
    description: "Core bridge: child_process execution and result wrapping",
    guidance:
      "Export interface BridgeResult { success: boolean; output: string; error: string }. " +
      "Export class Bridge with constructor(timeout = 30_000) and method execute(command: string, args: string[]): BridgeResult " +
      "using spawnSync from 'child_process' (encoding: 'utf-8', timeout). " +
      "Return { success: status === 0, output: stdout ?? '', error: stderr ?? '' }. Under 50 lines.",
  },
  {
    filename: "server.ts",
    description: "MCP server using Node.js MCP SDK 2026 standard",
    guidance:
      "Use 'import { McpServer } from \"@modelcontextprotocol/sdk/server/mcp.js\"' and " +
      "'import { StdioServerTransport } from \"@modelcontextprotocol/sdk/server/stdio.js\"'. " +
      "Create 'export const server = new McpServer({ name, version: \"1.0.0\" })'. " +
      "Use server.registerTool(name, { title, description, inputSchema: { param: z.string() }, " +
      "annotations: { readOnlyHint: true } }, async (args) => ({ content: [{ type: \"text\", text: ... }] })) " +
      "for each tool. NEVER use deprecated server.tool(). " +
      "End with: const transport = new StdioServerTransport(); await server.connect(transport). Under 100 lines.",
  },
];

export function buildTSImplementSingleFilePrompt(
  ctx: PromptContext,
  fileSpec: ImplementFileSpec,
): PromptParts {
  return {
    system: `You are an expert TypeScript developer generating Node.js MCP bridge source files.

File to generate: ${fileSpec.filename}
Purpose: ${fileSpec.description}
Requirements: ${fileSpec.guidance}

CRITICAL — for server.ts only: Use the 2026 Node.js MCP SDK standard.
Correct pattern:
  import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
  import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
  import { z } from "zod";
  export const server = new McpServer({ name: "app-name", version: "1.0.0" });
  server.registerTool("tool_name", {
    title: "Tool Title",
    description: "What this tool does",
    inputSchema: { param: z.string().describe("description") },
    annotations: { readOnlyHint: true },
  }, async ({ param }) => ({
    content: [{ type: "text", text: JSON.stringify(bridge.execute("cmd", [param])) }],
  }));
  const transport = new StdioServerTransport();
  await server.connect(transport);

NEVER use server.tool() — it is deprecated and does not exist in 2026 SDK.
Use ESM imports with .js extension for local imports (e.g. './bridge.js').
Use TypeScript strict mode. Zod v3 for inputSchema.

Respond with a JSON object with a single key "content" containing the complete file content.
No markdown, no code fences, no explanation outside the JSON.

{"content": "<complete TypeScript file content>"}`,

    user: `Application: ${ctx.applicationName}
Description: ${ctx.description ?? "No description provided."}
Capabilities: ${formatCapabilities(ctx.capabilities)}
Platform: ${ctx.platform ?? "cross-platform"}

Design (tools to implement):
${formatPreviousResults(ctx.previousResults)}`,
  };
}

// ─── Phase 3 (TS): Test ──────────────────────────────────────────────────────

export const TS_TEST_FILES: TestFileSpec[] = [
  {
    filename: "bridge.test.ts",
    description: "Bridge unit tests using Vitest",
    guidance:
      "Import { describe, it, expect, vi, beforeEach } from 'vitest'. " +
      "Import { Bridge } from '../bridge.js'. " +
      "Mock spawnSync with vi.spyOn(childProcess, 'spawnSync'). " +
      "Test: execute returns success:true with stdout, execute returns success:false on non-zero status, " +
      "execute includes stderr in error field, timeout is passed to spawnSync. Under 70 lines.",
  },
  {
    filename: "server.test.ts",
    description: "MCP server registration tests using Vitest",
    guidance:
      "Import { describe, it, expect, vi } from 'vitest'. " +
      "Mock '../bridge.js' with vi.mock. Import { server } from '../server.js'. " +
      "Test: server is an instance of McpServer, " +
      "verify each expected tool is registered (check server._registeredTools or call listTools()). " +
      "Do NOT call server.connect() in tests. Under 70 lines.",
  },
];

export function buildTSTestSingleFilePrompt(
  ctx: PromptContext,
  fileSpec: TestFileSpec,
  signatures: Record<string, string>,
): PromptParts {
  const sigSummary = Object.entries(signatures)
    .map(([file, sigs]) => `# ${file}\n${sigs}`)
    .join("\n\n");

  return {
    system: `You are an expert TypeScript test engineer generating Vitest test files for Node.js MCP bridge packages.

File to generate: ${fileSpec.filename}
Purpose: ${fileSpec.description}
Requirements: ${fileSpec.guidance}

Use Vitest (import from 'vitest'). Do NOT import from 'jest' or '@jest/globals'.
Mock child_process using vi.spyOn or vi.mock. Use ESM .js imports for local modules.

Respond with a JSON object with a single key "content" containing the complete file content.
No markdown, no code fences, no explanation outside the JSON.

{"content": "<complete TypeScript test file content>"}`,

    user: `Application: ${ctx.applicationName}
Capabilities: ${formatCapabilities(ctx.capabilities)}
Platform: ${ctx.platform ?? "cross-platform"}

Implementation signatures (actual names to test against):
${sigSummary || "No signatures extracted — use bridge.ts / server.ts structure from design."}`,
  };
}

// ─── Phase 4 (TS): Docs ──────────────────────────────────────────────────────

export function buildTSDocsPrompt(ctx: PromptContext): PromptParts {
  return {
    system: `You are a technical writer specializing in developer documentation for Node.js MCP bridge packages.

Documentation requirements:
- README.md: concise doc under 80 lines covering exactly these sections:
  ## Installation (npm install command only)
  ## Quick Start (3-step example using npx tsx server.ts or node dist/server.js)
  ## Commands (brief list with 1-line descriptions per tool)
  ## MCP Server (config snippet only — command: "node", args: ["dist/server.js"])

Respond with a JSON object matching the provided schema. No markdown, no code fences, no explanation outside the JSON.`,

    user: `Application: ${ctx.applicationName}
Description: ${ctx.description ?? "No description provided."}
Target capabilities: ${formatCapabilities(ctx.capabilities)}
Target platform: ${ctx.platform ?? "cross-platform"}

Previous results:
${formatPreviousResults(ctx.previousResults)}`,
  };
}

// ─── Phase 5 (TS): Publish ───────────────────────────────────────────────────

export function buildTSPublishPrompt(ctx: PromptContext): PromptParts {
  return {
    system: `You are a Node.js packaging expert. Generate packaging and configuration files for distributable TypeScript MCP bridge packages.

Follow modern Node.js/TypeScript conventions:
- package.json: "type": "module", dependencies (@modelcontextprotocol/sdk ^1.0.0, zod ^3.24.0),
  devDependencies (typescript ^5.4.0, tsx ^4.19.0, vitest ^2.0.0, @types/node ^22.0.0),
  scripts: { "build": "tsc", "start": "node dist/server.js", "dev": "npx tsx server.ts", "test": "vitest run" }
- tsconfig.json: strict ES2022, NodeNext module resolution, outDir: "dist"
- mcp_config: JSON object with command: "node", args: ["dist/server.js"] for MCP-compatible hosts

Respond with a JSON object matching the provided schema. No markdown, no code fences, no explanation outside the JSON.`,

    user: `Application: ${ctx.applicationName}
Description: ${ctx.description ?? "No description provided."}
Target capabilities: ${formatCapabilities(ctx.capabilities)}
Target platform: ${ctx.platform ?? "cross-platform"}

Previous implementation results:
${formatPreviousResults(ctx.previousResults)}`,
  };
}
