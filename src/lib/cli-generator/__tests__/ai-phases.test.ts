import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGenerateObject = vi.fn();

vi.mock("ai", () => ({
  generateObject: (...args: unknown[]) => mockGenerateObject(...args),
}));

vi.mock("@/lib/ai", () => ({
  getModel: vi.fn().mockReturnValue("mock-model"),
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  aiAnalyze,
  aiDesign,
  aiImplement,
  aiTest,
  aiDocs,
  aiPublish,
} from "../ai-phases";
import type { PipelineConfig } from "../types";

const DEFAULT_CONFIG: PipelineConfig = {
  applicationName: "Blender",
  description: "3D modeling tool",
  capabilities: ["render", "export"],
  platform: "macos",
};

const MOCK_USAGE = {
  inputTokens: 100,
  outputTokens: 200,
  inputTokenDetails: {
    noCacheTokens: undefined,
    cacheReadTokens: undefined,
    cacheWriteTokens: undefined,
  },
  outputTokenDetails: {
    reasoningTokens: undefined,
    acceptedPredictionTokens: undefined,
    rejectedPredictionTokens: undefined,
  },
};

/** Mock a single generateObject call returning a typed object result. */
function mockAIResponse(data: unknown): void {
  mockGenerateObject.mockResolvedValueOnce({
    object: data,
    usage: MOCK_USAGE,
  });
}

/** Mock N successive generateObject calls, each with the same base usage. */
function mockAIResponseN(items: unknown[]): void {
  for (const data of items) {
    mockGenerateObject.mockResolvedValueOnce({ object: data, usage: MOCK_USAGE });
  }
}

describe("ai-phases", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("aiAnalyze", () => {
    it("returns structured analysis result", async () => {
      const analysisData = {
        detectedCLIPaths: ["/usr/bin/blender"],
        commonSubcommands: [{ name: "render", description: "Render scene", flags: ["-o"] }],
        scriptingInterfaces: [],
        platformBehaviors: { macOS: "standard", linux: "standard", windows: "standard" },
      };
      mockAIResponse(analysisData);

      const output = await aiAnalyze(DEFAULT_CONFIG);

      expect(output.result).toEqual(analysisData);
      expect(output.tokensUsed).toEqual({ input: 100, output: 200 });
      expect(output.generatedFiles).toBeUndefined();
    });

    it("throws on AI failure", async () => {
      mockGenerateObject.mockRejectedValue(new Error("API timeout"));

      await expect(aiAnalyze(DEFAULT_CONFIG)).rejects.toThrow(
        'AI generation failed for phase "analyze"',
      );
    });
  });

  describe("aiDesign", () => {
    it("returns tools array as result", async () => {
      const tools = [
        {
          name: "blender_render",
          description: "Render a scene",
          parameters: {
            scene: { type: "string", description: "Scene file", required: true },
          },
        },
      ];
      // generateObject returns { tools: [...] } via DesignOutputSchema
      mockAIResponse({ tools });

      const output = await aiDesign(DEFAULT_CONFIG, { detectedCLIPaths: [] });

      // Result is stored as the raw array for backward compat
      expect(output.result).toEqual(tools);
      expect(output.tokensUsed).toEqual({ input: 100, output: 200 });
    });

    it("throws on AI failure", async () => {
      mockGenerateObject.mockRejectedValue(new Error("Rate limited"));

      await expect(aiDesign(DEFAULT_CONFIG, {})).rejects.toThrow(
        'AI generation failed for phase "design"',
      );
    });
  });

  describe("aiImplement", () => {
    it("returns result with generatedFiles from parallel file generation", async () => {
      // IMPLEMENT_FILES: __init__.py, bridge.py, server.py, main.py
      mockAIResponseN([
        { content: "# Blender CLI Bridge\n__version__ = '1.0.0'" },
        { content: "import subprocess" },
        { content: "from mcp import Server" },
        { content: "import click\n@click.group()\ndef cli(): pass" },
      ]);

      const output = await aiImplement(DEFAULT_CONFIG, []);

      const expected = {
        "__init__.py": "# Blender CLI Bridge\n__version__ = '1.0.0'",
        "bridge.py": "import subprocess",
        "server.py": "from mcp import Server",
        "main.py": "import click\n@click.group()\ndef cli(): pass",
      };
      expect(output.result).toEqual(expected);
      expect(output.generatedFiles).toEqual(expected);
      // 4 files × 100 input + 4 files × 200 output
      expect(output.tokensUsed).toEqual({ input: 400, output: 800 });
    });

    it("returns partial result when some files fail (Promise.allSettled)", async () => {
      // Only 2 of 4 files succeed
      mockGenerateObject
        .mockResolvedValueOnce({ object: { content: "# init" }, usage: MOCK_USAGE })
        .mockRejectedValue(new Error("Server error"));

      const output = await aiImplement(DEFAULT_CONFIG, {});

      // One file succeeded, three failed
      expect(output.result).toEqual({ "__init__.py": "# init" });
      expect(output.generatedFiles).toEqual({ "__init__.py": "# init" });
    });

    it("returns empty result when all files fail (graceful degradation)", async () => {
      mockGenerateObject.mockRejectedValue(new Error("All failed"));

      const output = await aiImplement(DEFAULT_CONFIG, {});

      expect(output.result).toEqual({});
      expect(output.generatedFiles).toBeUndefined();
      expect(output.tokensUsed).toEqual({ input: 0, output: 0 });
    });
  });

  describe("aiTest", () => {
    it("returns result with test file generatedFiles from parallel generation", async () => {
      // TEST_FILES: conftest.py, test_bridge.py, test_server.py
      mockAIResponseN([
        { content: "import pytest\n@pytest.fixture\ndef mock_cli(): pass" },
        { content: "def test_render(): assert True" },
        { content: "def test_tool_registration(): assert True" },
      ]);

      const output = await aiTest(DEFAULT_CONFIG, {});

      expect(output.result).toEqual({
        "conftest.py": "import pytest\n@pytest.fixture\ndef mock_cli(): pass",
        "test_bridge.py": "def test_render(): assert True",
        "test_server.py": "def test_tool_registration(): assert True",
      });
      expect(output.generatedFiles).toEqual(output.result);
    });

    it("returns empty result when all test files fail (graceful degradation)", async () => {
      mockGenerateObject.mockRejectedValue(new Error("Timeout"));

      const output = await aiTest(DEFAULT_CONFIG, {});

      expect(output.result).toEqual({});
      expect(output.generatedFiles).toBeUndefined();
    });
  });

  describe("aiDocs", () => {
    it("returns result with README generatedFiles", async () => {
      const docsData = {
        "README.md": "# Blender CLI Bridge\n\n## Installation\npip install blender-cli",
      };
      mockAIResponse(docsData);

      const output = await aiDocs(DEFAULT_CONFIG, []);

      expect(output.result).toEqual(docsData);
      expect(output.generatedFiles).toEqual(docsData);
    });

    it("throws on AI failure", async () => {
      mockGenerateObject.mockRejectedValue(new Error("Network error"));

      await expect(aiDocs(DEFAULT_CONFIG, {})).rejects.toThrow(
        'AI generation failed for phase "docs"',
      );
    });
  });

  describe("aiPublish", () => {
    it("returns result with requirements.txt, pyproject.toml, and mcp_config", async () => {
      const publishData = {
        "requirements.txt": "click>=8.0\nmcp>=1.0",
        "pyproject.toml": "[project]\nname = 'blender-cli'",
        mcp_config: {
          name: "blender-mcp",
          version: "1.0.0",
          description: "Blender MCP server",
          command: "python -m blender_cli.server",
          args: [],
          env: {},
          tools: ["blender_render"],
        },
      };
      mockAIResponse(publishData);

      const output = await aiPublish(DEFAULT_CONFIG, []);

      expect(output.result).toEqual(publishData);
      expect(output.generatedFiles).toEqual({
        "requirements.txt": "click>=8.0\nmcp>=1.0",
        "pyproject.toml": "[project]\nname = 'blender-cli'",
      });
    });

    it("throws on AI failure", async () => {
      mockGenerateObject.mockRejectedValue(new Error("Quota exceeded"));

      await expect(aiPublish(DEFAULT_CONFIG, {})).rejects.toThrow(
        'AI generation failed for phase "publish"',
      );
    });
  });

  // ─── TypeScript target branching ─────────────────────────────────────────

  describe("TypeScript target (config.target = 'typescript')", () => {
    const TS_CONFIG: PipelineConfig = {
      ...DEFAULT_CONFIG,
      target: "typescript",
    };

    it("aiImplement with typescript target generates 3 files (index.ts, bridge.ts, server.ts)", async () => {
      mockAIResponseN([
        { content: "export { Bridge } from './bridge.js';" },
        { content: "export class Bridge { execute() {} }" },
        { content: "import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';" },
      ]);

      const output = await aiImplement(TS_CONFIG, []);

      const files = output.result as Record<string, string>;
      expect(Object.keys(files)).toEqual(
        expect.arrayContaining(["index.ts", "bridge.ts", "server.ts"]),
      );
      // Not Python files
      expect(Object.keys(files)).not.toContain("main.py");
      expect(Object.keys(files)).not.toContain("__init__.py");
    });

    it("aiTest with typescript target generates 2 files (bridge.test.ts, server.test.ts)", async () => {
      mockAIResponseN([
        { content: "import { describe, it } from 'vitest';" },
        { content: "import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';" },
      ]);

      const output = await aiTest(TS_CONFIG, { "bridge.ts": "export class Bridge {}" });

      const files = output.result as Record<string, string>;
      expect(Object.keys(files)).toEqual(
        expect.arrayContaining(["bridge.test.ts", "server.test.ts"]),
      );
      // Not Python files
      expect(Object.keys(files)).not.toContain("conftest.py");
    });

    it("aiPublish with typescript target returns package.json and tsconfig.json", async () => {
      const tsPublishData = {
        "package.json": JSON.stringify({ name: "blender-mcp", version: "1.0.0" }),
        "tsconfig.json": JSON.stringify({ compilerOptions: { target: "ES2022" } }),
        mcp_config: {
          name: "blender-mcp",
          version: "1.0.0",
          description: "Blender MCP bridge",
          command: "node",
          args: ["dist/server.js"],
          env: {},
          tools: ["blender_render"],
        },
      };
      mockAIResponse(tsPublishData);

      const output = await aiPublish(TS_CONFIG, []);

      expect(output.generatedFiles).toHaveProperty("package.json");
      expect(output.generatedFiles).toHaveProperty("tsconfig.json");
      // Not Python files
      expect(output.generatedFiles).not.toHaveProperty("requirements.txt");
      expect(output.generatedFiles).not.toHaveProperty("pyproject.toml");
    });

    it("aiDocs with typescript target still returns README.md", async () => {
      mockAIResponse({ "README.md": "# Blender MCP\n\n## Installation\nnpm install" });

      const output = await aiDocs(TS_CONFIG, []);

      expect(output.generatedFiles).toHaveProperty("README.md");
      expect((output.generatedFiles?.["README.md"] as string)).toContain("npm install");
    });
  });

  describe("token usage", () => {
    it("returns undefined tokensUsed when usage is missing", async () => {
      mockGenerateObject.mockResolvedValueOnce({
        object: { detectedCLIPaths: [] },
        usage: undefined,
      });

      const output = await aiAnalyze(DEFAULT_CONFIG);

      expect(output.tokensUsed).toBeUndefined();
    });

    it("handles undefined token counts as 0", async () => {
      mockGenerateObject.mockResolvedValueOnce({
        object: { detectedCLIPaths: [] },
        usage: {
          inputTokens: undefined,
          outputTokens: undefined,
          inputTokenDetails: {},
          outputTokenDetails: {},
        },
      });

      const output = await aiAnalyze(DEFAULT_CONFIG);

      expect(output.tokensUsed).toEqual({ input: 0, output: 0 });
    });
  });
});
