import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGenerateText = vi.fn();

vi.mock("ai", () => ({
  generateText: (...args: unknown[]) => mockGenerateText(...args),
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
  inputTokenDetails: { noCacheTokens: undefined, cacheReadTokens: undefined, cacheWriteTokens: undefined },
  outputTokenDetails: { reasoningTokens: undefined, acceptedPredictionTokens: undefined, rejectedPredictionTokens: undefined },
};

function mockAIResponse(data: unknown): void {
  mockGenerateText.mockResolvedValueOnce({
    text: JSON.stringify(data),
    usage: MOCK_USAGE,
  });
}

describe("ai-phases", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("aiAnalyze", () => {
    it("returns parsed analysis result", async () => {
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
      mockGenerateText.mockRejectedValueOnce(new Error("API timeout"));

      await expect(aiAnalyze(DEFAULT_CONFIG)).rejects.toThrow(
        'AI generation failed for phase "analyze"',
      );
    });

    it("throws on invalid JSON response", async () => {
      mockGenerateText.mockResolvedValueOnce({
        text: "not valid json at all",
        usage: MOCK_USAGE,
      });

      await expect(aiAnalyze(DEFAULT_CONFIG)).rejects.toThrow();
    });

    it("strips markdown code fences from response", async () => {
      const data = { detectedCLIPaths: ["/usr/bin/blender"] };
      mockGenerateText.mockResolvedValueOnce({
        text: "```json\n" + JSON.stringify(data) + "\n```",
        usage: MOCK_USAGE,
      });

      const output = await aiAnalyze(DEFAULT_CONFIG);
      expect(output.result).toEqual(data);
    });
  });

  describe("aiDesign", () => {
    it("returns parsed design result", async () => {
      const designData = [
        {
          name: "blender_render",
          description: "Render a scene",
          parameters: {
            scene: { type: "string", description: "Scene file", required: true },
          },
        },
      ];
      mockAIResponse(designData);

      const output = await aiDesign(DEFAULT_CONFIG, { detectedCLIPaths: [] });

      expect(output.result).toEqual(designData);
      expect(output.tokensUsed).toEqual({ input: 100, output: 200 });
    });

    it("throws on AI failure", async () => {
      mockGenerateText.mockRejectedValueOnce(new Error("Rate limited"));

      await expect(aiDesign(DEFAULT_CONFIG, {})).rejects.toThrow(
        'AI generation failed for phase "design"',
      );
    });
  });

  describe("aiImplement", () => {
    it("returns result with generatedFiles", async () => {
      const implData = {
        "__init__.py": "# Blender CLI Bridge\n__version__ = '1.0.0'",
        "main.py": "import click\n@click.group()\ndef cli(): pass",
        "server.py": "from mcp import Server",
        "bridge.py": "import subprocess",
      };
      mockAIResponse(implData);

      const output = await aiImplement(DEFAULT_CONFIG, []);

      expect(output.result).toEqual(implData);
      expect(output.generatedFiles).toEqual(implData);
      expect(output.tokensUsed).toEqual({ input: 100, output: 200 });
    });

    it("returns undefined generatedFiles when response has no string values", async () => {
      mockAIResponse({ status: 42, nested: { deep: true } });

      const output = await aiImplement(DEFAULT_CONFIG, []);

      expect(output.generatedFiles).toBeUndefined();
    });

    it("throws on AI failure", async () => {
      mockGenerateText.mockRejectedValueOnce(new Error("Server error"));

      await expect(aiImplement(DEFAULT_CONFIG, {})).rejects.toThrow(
        'AI generation failed for phase "implement"',
      );
    });
  });

  describe("aiTest", () => {
    it("returns result with test file generatedFiles", async () => {
      const testData = {
        "conftest.py": "import pytest\n@pytest.fixture\ndef mock_cli(): pass",
        "test_bridge.py": "def test_render(): assert True",
        "test_server.py": "def test_tool_registration(): assert True",
      };
      mockAIResponse(testData);

      const output = await aiTest(DEFAULT_CONFIG, {});

      expect(output.result).toEqual(testData);
      expect(output.generatedFiles).toEqual(testData);
    });

    it("throws on AI failure", async () => {
      mockGenerateText.mockRejectedValueOnce(new Error("Timeout"));

      await expect(aiTest(DEFAULT_CONFIG, {})).rejects.toThrow(
        'AI generation failed for phase "test"',
      );
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
      mockGenerateText.mockRejectedValueOnce(new Error("Network error"));

      await expect(aiDocs(DEFAULT_CONFIG, {})).rejects.toThrow(
        'AI generation failed for phase "docs"',
      );
    });
  });

  describe("aiPublish", () => {
    it("returns result with requirements.txt and pyproject.toml", async () => {
      const publishData = {
        "requirements.txt": "click>=8.0\nmcp>=1.0",
        "pyproject.toml": "[project]\nname = 'blender-cli'",
        mcp_config: {
          name: "blender-mcp",
          version: "1.0.0",
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

    it("returns undefined generatedFiles when no packaging files present", async () => {
      mockAIResponse({ mcp_config: { name: "test" } });

      const output = await aiPublish(DEFAULT_CONFIG, []);

      expect(output.generatedFiles).toBeUndefined();
    });

    it("throws on AI failure", async () => {
      mockGenerateText.mockRejectedValueOnce(new Error("Quota exceeded"));

      await expect(aiPublish(DEFAULT_CONFIG, {})).rejects.toThrow(
        'AI generation failed for phase "publish"',
      );
    });
  });

  describe("token usage", () => {
    it("returns undefined tokensUsed when usage is missing", async () => {
      mockGenerateText.mockResolvedValueOnce({
        text: JSON.stringify({ test: true }),
        usage: undefined,
      });

      const output = await aiAnalyze(DEFAULT_CONFIG);

      expect(output.tokensUsed).toBeUndefined();
    });

    it("handles undefined token counts as 0", async () => {
      mockGenerateText.mockResolvedValueOnce({
        text: JSON.stringify({ test: true }),
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
