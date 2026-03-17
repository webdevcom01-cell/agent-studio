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

export function buildImplementPrompt(ctx: PromptContext): string {
  return `You are an expert Python developer specializing in CLI bridges and MCP servers. Implement the CLI bridge for "${ctx.applicationName}".

Application description: ${ctx.description ?? "No description provided."}
Target capabilities: ${formatCapabilities(ctx.capabilities)}
Target platform: ${ctx.platform ?? "cross-platform"}

Previous analysis and design results:
${formatPreviousResults(ctx.previousResults)}

Generate Python files following CLI-Anything framework conventions:
- Python 3.10+, click for CLI entry points, subprocess.run for executing commands
- mcp package for MCP server implementation
- Proper argument translation, stdout/stderr capture, configurable timeout
- Clean error handling with structured error responses

IMPORTANT: Keep each file CONCISE (under 150 lines). Focus on core functionality, avoid lengthy docstrings or comments. Use minimal but clear code.

Respond with ONLY a JSON object mapping filenames to file contents (no markdown, no code fences, no explanation).
Each value must be a complete, valid Python file as a single string. Ensure all JSON strings are properly escaped (newlines as \\n, quotes as \\").

{
  "__init__.py": "<module init with version>",
  "main.py": "<click CLI entry point with commands that call subprocess>",
  "server.py": "<MCP server using Python mcp package, registers tools from design phase>",
  "bridge.py": "<core logic: argument translation to CLI flags, subprocess execution with timeout, stdout/stderr parsing, structured result objects>"
}`;
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
