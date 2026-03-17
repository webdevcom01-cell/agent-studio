import { describe, it, expect } from "vitest";
import {
  buildAnalyzePrompt,
  buildDesignPrompt,
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
  // ─── Verify Phase 3 split: all builders return { system, user } ────────────
  describe("PromptParts shape", () => {
    it("buildAnalyzePrompt returns { system, user }", () => {
      const parts = buildAnalyzePrompt(BASE_CTX);
      expect(typeof parts.system).toBe("string");
      expect(typeof parts.user).toBe("string");
      expect(parts.system.length).toBeGreaterThan(0);
      expect(parts.user.length).toBeGreaterThan(0);
    });

    it("buildDesignPrompt returns { system, user }", () => {
      const parts = buildDesignPrompt(BASE_CTX);
      expect(typeof parts.system).toBe("string");
      expect(typeof parts.user).toBe("string");
    });
  });

  describe("buildAnalyzePrompt", () => {
    it("includes application name in user part", () => {
      const { user } = buildAnalyzePrompt(BASE_CTX);
      expect(user).toContain("Blender");
    });

    it("includes description in user part", () => {
      const { user } = buildAnalyzePrompt(BASE_CTX);
      expect(user).toContain("3D modeling and rendering tool");
    });

    it("includes platform in user part", () => {
      const { user } = buildAnalyzePrompt(BASE_CTX);
      expect(user).toContain("macos");
    });

    it("includes capabilities in user part", () => {
      const { user } = buildAnalyzePrompt(BASE_CTX);
      expect(user).toContain("render");
      expect(user).toContain("export-png");
    });

    it("uses fallback when no description", () => {
      const { user } = buildAnalyzePrompt({ applicationName: "App" });
      expect(user).toContain("No description provided");
    });

    it("system part contains CLI analysis instructions", () => {
      const { system } = buildAnalyzePrompt(BASE_CTX);
      expect(system).toContain("CLI reverse-engineer");
      expect(system).toContain("subcommands");
      expect(system).toContain("scripting");
    });
  });

  describe("buildDesignPrompt", () => {
    it("includes application name and description in user part", () => {
      const { user } = buildDesignPrompt(BASE_CTX);
      expect(user).toContain("Blender");
      expect(user).toContain("3D modeling and rendering tool");
    });

    it("includes previous results in user part", () => {
      const { user } = buildDesignPrompt({
        ...BASE_CTX,
        previousResults: [{ detectedCLIPaths: ["/usr/bin/blender"] }],
      });
      expect(user).toContain("/usr/bin/blender");
    });

    it("system part contains MCP tool schema conventions", () => {
      const { system } = buildDesignPrompt(BASE_CTX);
      expect(system).toContain("Parameters");
      expect(system).toContain("required");
      expect(system).toContain("snake_case");
    });
  });

  describe("buildTestPrompt", () => {
    it("includes application name in user part", () => {
      const { user } = buildTestPrompt(BASE_CTX);
      expect(user).toContain("Blender");
    });

    it("includes previous implementation results in user part", () => {
      const { user } = buildTestPrompt({
        ...BASE_CTX,
        previousResults: [{ "main.py": "import click" }],
      });
      expect(user).toContain("import click");
    });

    it("system part requests pytest conventions", () => {
      const { system } = buildTestPrompt(BASE_CTX);
      expect(system).toContain("conftest.py");
      expect(system).toContain("pytest");
      expect(system).toContain("subprocess");
    });
  });

  describe("buildDocsPrompt", () => {
    it("includes application name in user part", () => {
      const { user } = buildDocsPrompt(BASE_CTX);
      expect(user).toContain("Blender");
    });

    it("system part requests README structure", () => {
      const { system } = buildDocsPrompt(BASE_CTX);
      expect(system).toContain("README.md");
      expect(system).toContain("Installation");
      expect(system).toContain("Quick Start");
    });
  });

  describe("buildPublishPrompt", () => {
    it("includes application name in user part", () => {
      const { user } = buildPublishPrompt(BASE_CTX);
      expect(user).toContain("Blender");
    });

    it("system part requests packaging files", () => {
      const { system } = buildPublishPrompt(BASE_CTX);
      expect(system).toContain("requirements.txt");
      expect(system).toContain("pyproject.toml");
      expect(system).toContain("mcp_config");
    });

    it("system part mentions PEP 621", () => {
      const { system } = buildPublishPrompt(BASE_CTX);
      expect(system).toContain("PEP 621");
    });
  });

  describe("edge cases", () => {
    it("handles empty capabilities", () => {
      const { user } = buildAnalyzePrompt({
        applicationName: "App",
        capabilities: [],
      });
      expect(user).toContain("general-purpose");
    });

    it("handles no previousResults", () => {
      const { user } = buildDesignPrompt({ applicationName: "App" });
      expect(user).toContain("None yet");
    });

    it("handles cross-platform default", () => {
      const { user } = buildAnalyzePrompt({ applicationName: "App" });
      expect(user).toContain("cross-platform");
    });
  });
});
