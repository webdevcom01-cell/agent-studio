import { describe, it, expect } from "vitest";
import {
  buildAnalyzePrompt,
  buildDesignPrompt,
  buildImplementPrompt,
  buildTestPrompt,
  buildDocsPrompt,
  buildPublishPrompt,
} from "../prompts";

const BASE_CTX = {
  applicationName: "Blender",
  description: "3D modeling and rendering tool",
  capabilities: ["render", "export-png"],
  platform: "macos",
};

describe("prompt builders", () => {
  describe("buildAnalyzePrompt", () => {
    it("includes application name", () => {
      const prompt = buildAnalyzePrompt(BASE_CTX);
      expect(prompt).toContain("Blender");
    });

    it("includes description", () => {
      const prompt = buildAnalyzePrompt(BASE_CTX);
      expect(prompt).toContain("3D modeling and rendering tool");
    });

    it("includes platform", () => {
      const prompt = buildAnalyzePrompt(BASE_CTX);
      expect(prompt).toContain("macos");
    });

    it("includes capabilities", () => {
      const prompt = buildAnalyzePrompt(BASE_CTX);
      expect(prompt).toContain("render");
      expect(prompt).toContain("export-png");
    });

    it("uses fallback when no description", () => {
      const prompt = buildAnalyzePrompt({ applicationName: "App" });
      expect(prompt).toContain("No description provided");
    });

    it("requests JSON output format", () => {
      const prompt = buildAnalyzePrompt(BASE_CTX);
      expect(prompt).toContain("detectedCLIPaths");
      expect(prompt).toContain("commonSubcommands");
      expect(prompt).toContain("scriptingInterfaces");
      expect(prompt).toContain("platformBehaviors");
    });
  });

  describe("buildDesignPrompt", () => {
    it("includes application name and description", () => {
      const prompt = buildDesignPrompt(BASE_CTX);
      expect(prompt).toContain("Blender");
      expect(prompt).toContain("3D modeling and rendering tool");
    });

    it("includes previous results when provided", () => {
      const prompt = buildDesignPrompt({
        ...BASE_CTX,
        previousResults: [{ detectedCLIPaths: ["/usr/bin/blender"] }],
      });
      expect(prompt).toContain("/usr/bin/blender");
    });

    it("requests MCP-compatible tool schema format", () => {
      const prompt = buildDesignPrompt(BASE_CTX);
      expect(prompt).toContain("parameters");
      expect(prompt).toContain("required");
      expect(prompt).toContain("snake_case");
    });
  });

  describe("buildImplementPrompt", () => {
    it("includes application name", () => {
      const prompt = buildImplementPrompt(BASE_CTX);
      expect(prompt).toContain("Blender");
    });

    it("includes previous results", () => {
      const prompt = buildImplementPrompt({
        ...BASE_CTX,
        previousResults: [{ commands: [{ name: "blender_render" }] }],
      });
      expect(prompt).toContain("blender_render");
    });

    it("requests Python file structure", () => {
      const prompt = buildImplementPrompt(BASE_CTX);
      expect(prompt).toContain("__init__.py");
      expect(prompt).toContain("main.py");
      expect(prompt).toContain("server.py");
      expect(prompt).toContain("bridge.py");
    });

    it("mentions click and subprocess conventions", () => {
      const prompt = buildImplementPrompt(BASE_CTX);
      expect(prompt).toContain("click");
      expect(prompt).toContain("subprocess");
    });
  });

  describe("buildTestPrompt", () => {
    it("includes application name", () => {
      const prompt = buildTestPrompt(BASE_CTX);
      expect(prompt).toContain("Blender");
    });

    it("includes previous implementation results", () => {
      const prompt = buildTestPrompt({
        ...BASE_CTX,
        previousResults: [{ "main.py": "import click" }],
      });
      expect(prompt).toContain("import click");
    });

    it("requests pytest test files", () => {
      const prompt = buildTestPrompt(BASE_CTX);
      expect(prompt).toContain("conftest.py");
      expect(prompt).toContain("test_bridge.py");
      expect(prompt).toContain("test_server.py");
    });
  });

  describe("buildDocsPrompt", () => {
    it("includes application name", () => {
      const prompt = buildDocsPrompt(BASE_CTX);
      expect(prompt).toContain("Blender");
    });

    it("requests README structure", () => {
      const prompt = buildDocsPrompt(BASE_CTX);
      expect(prompt).toContain("README.md");
      expect(prompt).toContain("Installation");
      expect(prompt).toContain("Troubleshooting");
    });
  });

  describe("buildPublishPrompt", () => {
    it("includes application name", () => {
      const prompt = buildPublishPrompt(BASE_CTX);
      expect(prompt).toContain("Blender");
    });

    it("requests packaging files", () => {
      const prompt = buildPublishPrompt(BASE_CTX);
      expect(prompt).toContain("requirements.txt");
      expect(prompt).toContain("pyproject.toml");
      expect(prompt).toContain("mcp_config");
    });

    it("mentions PEP 621", () => {
      const prompt = buildPublishPrompt(BASE_CTX);
      expect(prompt).toContain("PEP 621");
    });
  });

  describe("edge cases", () => {
    it("handles empty capabilities", () => {
      const prompt = buildAnalyzePrompt({
        applicationName: "App",
        capabilities: [],
      });
      expect(prompt).toContain("general-purpose");
    });

    it("handles no previousResults", () => {
      const prompt = buildDesignPrompt({ applicationName: "App" });
      expect(prompt).toContain("None yet");
    });

    it("handles cross-platform default", () => {
      const prompt = buildAnalyzePrompt({ applicationName: "App" });
      expect(prompt).toContain("cross-platform");
    });
  });
});
