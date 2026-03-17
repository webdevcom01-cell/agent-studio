import { describe, it, expect } from "vitest";
import {
  buildAnalyzePrompt,
  buildDesignPrompt,
  buildTestPrompt,
  buildDocsPrompt,
  buildPublishPrompt,
  buildTSImplementSingleFilePrompt,
  buildTSTestSingleFilePrompt,
  buildTSDocsPrompt,
  buildTSPublishPrompt,
  TS_IMPLEMENT_FILES,
  TS_TEST_FILES,
  extractTypeScriptSignatures,
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

  // ─── TypeScript prompt builders ───────────────────────────────────────────

  describe("buildTSImplementSingleFilePrompt", () => {
    it("includes McpServer and registerTool pattern in system for server.ts", () => {
      const serverSpec = TS_IMPLEMENT_FILES.find((f) => f.filename === "server.ts")!;
      const { system } = buildTSImplementSingleFilePrompt(BASE_CTX, serverSpec);
      expect(system).toContain("McpServer");
      expect(system).toContain("registerTool");
      expect(system).toContain("StdioServerTransport");
      expect(system).toContain("NEVER use server.tool()");
    });

    it("includes application name in user part", () => {
      const bridgeSpec = TS_IMPLEMENT_FILES.find((f) => f.filename === "bridge.ts")!;
      const { user } = buildTSImplementSingleFilePrompt(BASE_CTX, bridgeSpec);
      expect(user).toContain("Blender");
    });

    it("returns { system, user } shape", () => {
      const spec = TS_IMPLEMENT_FILES[0];
      const parts = buildTSImplementSingleFilePrompt(BASE_CTX, spec);
      expect(typeof parts.system).toBe("string");
      expect(typeof parts.user).toBe("string");
      expect(parts.system.length).toBeGreaterThan(0);
    });

    it("TS_IMPLEMENT_FILES contains index.ts, bridge.ts, server.ts", () => {
      const names = TS_IMPLEMENT_FILES.map((f) => f.filename);
      expect(names).toContain("index.ts");
      expect(names).toContain("bridge.ts");
      expect(names).toContain("server.ts");
    });
  });

  describe("buildTSTestSingleFilePrompt", () => {
    it("mentions Vitest in system prompt and discourages jest", () => {
      const spec = TS_TEST_FILES[0];
      const { system } = buildTSTestSingleFilePrompt(BASE_CTX, spec, {});
      expect(system).toContain("Vitest");
      // Prompt mentions jest only as an anti-pattern ("Do NOT import from 'jest'")
      expect(system).toContain("Do NOT import from");
    });

    it("includes extracted signatures in user part", () => {
      const spec = TS_TEST_FILES[0];
      const sigs = { "bridge.ts": "export class Bridge\n  execute(cmd: string): BridgeResult" };
      const { user } = buildTSTestSingleFilePrompt(BASE_CTX, spec, sigs);
      expect(user).toContain("export class Bridge");
    });

    it("TS_TEST_FILES contains bridge.test.ts and server.test.ts", () => {
      const names = TS_TEST_FILES.map((f) => f.filename);
      expect(names).toContain("bridge.test.ts");
      expect(names).toContain("server.test.ts");
    });
  });

  describe("buildTSDocsPrompt", () => {
    it("includes application name in user part", () => {
      const { user } = buildTSDocsPrompt(BASE_CTX);
      expect(user).toContain("Blender");
    });

    it("system mentions npm and Node.js MCP config pattern", () => {
      const { system } = buildTSDocsPrompt(BASE_CTX);
      expect(system).toContain("npm");
      expect(system).toContain("README.md");
      expect(system).toContain("node");
    });
  });

  describe("buildTSPublishPrompt", () => {
    it("system mentions package.json and tsconfig.json", () => {
      const { system } = buildTSPublishPrompt(BASE_CTX);
      expect(system).toContain("package.json");
      expect(system).toContain("tsconfig.json");
      expect(system).toContain("mcp_config");
    });

    it("system mentions @modelcontextprotocol/sdk dependency", () => {
      const { system } = buildTSPublishPrompt(BASE_CTX);
      expect(system).toContain("@modelcontextprotocol/sdk");
    });

    it("includes application name in user part", () => {
      const { user } = buildTSPublishPrompt(BASE_CTX);
      expect(user).toContain("Blender");
    });
  });

  describe("extractTypeScriptSignatures", () => {
    it("extracts export class, export function, registerTool from .ts files", () => {
      const files = {
        "server.ts": `import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
export const server = new McpServer({ name: "test", version: "1.0.0" });
server.registerTool("export_svg", { description: "Export" }, async () => ({ content: [] }));`,
        "bridge.ts": `export class Bridge {
  execute(cmd: string, args: string[]): BridgeResult { return {} as BridgeResult; }
}`,
      };
      const sigs = extractTypeScriptSignatures(files);
      expect(sigs["server.ts"]).toContain("server.registerTool");
      expect(sigs["bridge.ts"]).toContain("export class Bridge");
    });

    it("ignores .py files", () => {
      const files = { "main.py": "def render():\n  pass", "bridge.ts": "export class Bridge {}" };
      const sigs = extractTypeScriptSignatures(files);
      expect(sigs["main.py"]).toBeUndefined();
      expect(sigs["bridge.ts"]).toContain("export class Bridge");
    });

    it("returns empty object for non-object input", () => {
      expect(extractTypeScriptSignatures(null)).toEqual({});
      expect(extractTypeScriptSignatures("string")).toEqual({});
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
