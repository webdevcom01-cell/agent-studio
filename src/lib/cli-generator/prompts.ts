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

export interface TestFileSpec {
  filename: "conftest.py" | "test_bridge.py" | "test_server.py";
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
  filename: "__init__.py" | "main.py" | "server.py" | "bridge.py";
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
    guidance: "Use `mcp` package. Create Server, register each tool from design as @server.tool. Each tool calls Bridge methods. Under 80 lines.",
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

// Legacy: kept for test compatibility
export function buildImplementPrompt(ctx: PromptContext): PromptParts {
  return buildImplementSingleFilePrompt(ctx, IMPLEMENT_FILES[1]);
}

// ─── Phase 3: Test ───────────────────────────────────────────────────────────

// Legacy single-call test prompt (kept for backwards compat with pipeline.ts)
export function buildTestPrompt(ctx: PromptContext): PromptParts {
  return {
    system: `You are an expert Python test engineer. Write comprehensive pytest tests for CLI bridge packages.

Test file conventions:
- pytest with subprocess mocking (unittest.mock.patch)
- Test bridge.py: mock subprocess.run, verify argument translation, test timeout handling, test error cases
- Test server.py: verify MCP protocol compliance, test tool registration, test request/response cycle
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
    guidance: "Test tool registration matches function signatures below. Test request/response cycle. Under 60 lines.",
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
