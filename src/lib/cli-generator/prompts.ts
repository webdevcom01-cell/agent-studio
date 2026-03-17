interface PromptContext {
  applicationName: string;
  description?: string;
  capabilities?: string[];
  platform?: string;
  previousResults?: unknown[];
}

function formatCapabilities(capabilities?: string[]): string {
  if (!capabilities || capabilities.length === 0) return "general-purpose";
  return capabilities.join(", ");
}

function formatPreviousResults(results?: unknown[]): string {
  if (!results || results.length === 0) return "None yet.";
  return JSON.stringify(results, null, 2);
}

export function buildAnalyzePrompt(ctx: PromptContext): string {
  return `You are an expert CLI reverse-engineer. Analyze the desktop application "${ctx.applicationName}" and determine how it can be controlled via command-line interface.

Application description: ${ctx.description ?? "No description provided."}
Target capabilities: ${formatCapabilities(ctx.capabilities)}
Target platform: ${ctx.platform ?? "cross-platform"}

Investigate:
1. Where the CLI binary is typically installed on ${ctx.platform ?? "macOS/Linux/Windows"}
2. What subcommands and flags are available
3. Whether it supports scripting interfaces (AppleScript, COM, D-Bus, etc.)
4. Platform-specific behaviors and path conventions

Respond with ONLY a JSON object (no markdown, no code fences, no explanation):
{
  "detectedCLIPaths": ["<absolute path to CLI binary per platform>"],
  "commonSubcommands": [
    {
      "name": "<subcommand name>",
      "description": "<what it does>",
      "flags": ["<common flags>"]
    }
  ],
  "scriptingInterfaces": [
    {
      "type": "<applescript|com|dbus|pipe|socket>",
      "description": "<how it works>",
      "example": "<usage example>"
    }
  ],
  "platformBehaviors": {
    "macOS": "<notes>",
    "linux": "<notes>",
    "windows": "<notes>"
  }
}`;
}

export function buildDesignPrompt(ctx: PromptContext): string {
  return `You are an expert MCP tool designer. Design CLI tool schemas for "${ctx.applicationName}" that are compatible with the MCP (Model Context Protocol) tool format.

Application description: ${ctx.description ?? "No description provided."}
Target capabilities: ${formatCapabilities(ctx.capabilities)}
Target platform: ${ctx.platform ?? "cross-platform"}

Previous analysis results:
${formatPreviousResults(ctx.previousResults)}

Design tools following these conventions:
- Python 3.10+, click for CLI, subprocess.run for execution
- Each tool maps to a CLI subcommand or scripting operation
- Parameters must have type (string|number|boolean), required flag, and optional default
- Tool names must be snake_case, descriptive, and prefixed with the app name

Respond with ONLY a JSON array (no markdown, no code fences, no explanation):
[
  {
    "name": "<app_name>_<action>",
    "description": "<Clear description of what this tool does>",
    "parameters": {
      "<param_name>": {
        "type": "string|number|boolean",
        "description": "<what this parameter controls>",
        "required": true|false,
        "default": "<optional default value>"
      }
    }
  }
]`;
}

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

export function buildImplementSingleFilePrompt(ctx: PromptContext, fileSpec: ImplementFileSpec): string {
  return `You are an expert Python developer. Generate ONLY the file "${fileSpec.filename}" for the "${ctx.applicationName}" CLI bridge.

Application: ${ctx.applicationName}
Description: ${ctx.description ?? "No description provided."}
Capabilities: ${formatCapabilities(ctx.capabilities)}
Platform: ${ctx.platform ?? "cross-platform"}

Design (tools to implement):
${formatPreviousResults(ctx.previousResults)}

File to generate: ${fileSpec.filename}
Purpose: ${fileSpec.description}
Requirements: ${fileSpec.guidance}

CRITICAL: Respond with ONLY a JSON object with a single key — the filename — mapping to the complete file content as a string.
Newlines must be escaped as \\n. Quotes inside the code must be escaped as \\".
No markdown, no code fences, no explanation outside the JSON.

{"${fileSpec.filename}": "<complete Python file content with all newlines escaped as \\n>"}`;
}

// Legacy: kept for test compatibility
export function buildImplementPrompt(ctx: PromptContext): string {
  return buildImplementSingleFilePrompt(ctx, IMPLEMENT_FILES[1]);
}

export function buildTestPrompt(ctx: PromptContext): string {
  return `You are an expert Python test engineer. Write comprehensive pytest tests for the "${ctx.applicationName}" CLI bridge.

Application description: ${ctx.description ?? "No description provided."}
Target capabilities: ${formatCapabilities(ctx.capabilities)}
Target platform: ${ctx.platform ?? "cross-platform"}

Previous implementation results:
${formatPreviousResults(ctx.previousResults)}

Generate test files following these conventions:
- pytest with subprocess mocking (unittest.mock.patch)
- Test bridge.py: mock subprocess.run, verify argument translation, test timeout handling, test error cases
- Test server.py: verify MCP protocol compliance, test tool registration, test request/response cycle
- Fixtures in conftest.py for reusable test state

IMPORTANT: Keep each file CONCISE (under 120 lines). Write focused tests, avoid verbose docstrings. Ensure all JSON strings are properly escaped (newlines as \\n, quotes as \\").

Respond with ONLY a JSON object mapping filenames to file contents (no markdown, no code fences, no explanation):
{
  "conftest.py": "<shared fixtures: mock CLI paths, sample outputs, test configurations>",
  "test_bridge.py": "<bridge tests: mocked subprocess calls, argument translation, timeout, error handling>",
  "test_server.py": "<MCP server tests: protocol compliance, tool registration, request handling>"
}`;
}

export function buildDocsPrompt(ctx: PromptContext): string {
  return `You are a technical writer specializing in developer documentation. Write documentation for the "${ctx.applicationName}" CLI bridge.

Application description: ${ctx.description ?? "No description provided."}
Target capabilities: ${formatCapabilities(ctx.capabilities)}
Target platform: ${ctx.platform ?? "cross-platform"}

Previous implementation and test results:
${formatPreviousResults(ctx.previousResults)}

Generate documentation covering the key essentials only.

IMPORTANT: Keep README.md CONCISE (under 80 lines total). Write short, focused sections without verbose explanations. Ensure all JSON strings are properly escaped (newlines as \\n, quotes as \\").

Respond with ONLY a JSON object mapping filenames to file contents (no markdown, no code fences, no explanation):
{
  "README.md": "<Concise doc with: ## Installation (pip install command), ## Quick Start (3-step example), ## Commands (brief list with 1-line descriptions), ## MCP Server (config snippet only)>"
}`;
}

export function buildPublishPrompt(ctx: PromptContext): string {
  return `You are a Python packaging expert. Generate the packaging and configuration files needed to publish the "${ctx.applicationName}" CLI bridge as a distributable package.

Application description: ${ctx.description ?? "No description provided."}
Target capabilities: ${formatCapabilities(ctx.capabilities)}
Target platform: ${ctx.platform ?? "cross-platform"}

Previous implementation results:
${formatPreviousResults(ctx.previousResults)}

Generate packaging files following modern Python conventions:
- pyproject.toml with project metadata, dependencies (click, mcp), and entry points
- requirements.txt for direct pip install
- MCP config JSON for auto-registration with MCP-compatible hosts

Respond with ONLY a JSON object (no markdown, no code fences, no explanation):
{
  "requirements.txt": "<pinned dependencies: click>=8.0, mcp>=1.0, plus any app-specific deps>",
  "pyproject.toml": "<PEP 621 compliant with [project] metadata, [project.scripts] entry points, [build-system] config>",
  "mcp_config": {
    "name": "<mcp server name>",
    "version": "1.0.0",
    "description": "<what this MCP server provides>",
    "command": "<python -m package_name.server>",
    "args": [],
    "env": {},
    "tools": ["<list of tool names from design phase>"]
  }
}`;
}
