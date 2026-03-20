import { describe, it, expect, vi } from "vitest";
import { validateTSOutput, type ValidationResult } from "../ts-validator";

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const VALID_SERVER_TS = `import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { Bridge } from "./bridge.js";
const bridge = new Bridge();
export const server = new McpServer({ name: "test-app", version: "1.0.0" });
server.registerTool("run_command", {
  description: "Run a command",
  inputSchema: { command: z.string() },
}, async ({ command }) => ({
  content: [{ type: "text", text: JSON.stringify(bridge.execute(command, [])) }],
}));
const transport = new StdioServerTransport();
await server.connect(transport);`;

const VALID_BRIDGE_TS = `import { spawnSync } from "child_process";
export interface BridgeResult { success: boolean; output: string; error: string; }
export class Bridge {
  execute(command: string, args: string[]): BridgeResult {
    const result = spawnSync(command, args, { encoding: "utf-8" });
    return { success: result.status === 0, output: result.stdout ?? "", error: result.stderr ?? "" };
  }
}`;

const VALID_INDEX_TS = `export { Bridge } from "./bridge.js";
export const VERSION = "1.0.0";`;

const VALID_PACKAGE_JSON = JSON.stringify({
  name: "test-app-mcp",
  version: "1.0.0",
  type: "module",
  scripts: { build: "tsc", test: "vitest run", start: "node dist/server.js" },
  dependencies: { "@modelcontextprotocol/sdk": "^1.0.0", zod: "^3.24.0" },
});

const VALID_TSCONFIG = JSON.stringify({
  compilerOptions: { target: "ES2022", module: "NodeNext", strict: true, outDir: "dist" },
});

function makeValidFiles(): Record<string, string> {
  return {
    "index.ts": VALID_INDEX_TS,
    "bridge.ts": VALID_BRIDGE_TS,
    "server.ts": VALID_SERVER_TS,
    "bridge.test.ts": "import { describe, it, expect } from 'vitest'; describe('bridge', () => {});",
    "server.test.ts": "import { describe, it, expect } from 'vitest'; describe('server', () => {});",
    "package.json": VALID_PACKAGE_JSON,
    "tsconfig.json": VALID_TSCONFIG,
    "README.md": "# Test App MCP\n\nBridge for test-app.",
  };
}

describe("validateTSOutput", () => {
  describe("valid output", () => {
    it("passes with all 8 correct files", () => {
      const result = validateTSOutput(makeValidFiles());
      expect(result.valid).toBe(true);
      expect(result.issues.filter((i) => i.severity === "error")).toHaveLength(0);
    });
  });

  describe("missing files", () => {
    it("errors on missing server.ts", () => {
      const files = makeValidFiles();
      delete files["server.ts"];
      const result = validateTSOutput(files);
      expect(result.valid).toBe(false);
      expect(result.issues).toContainEqual(
        expect.objectContaining({ file: "server.ts", severity: "error" })
      );
    });

    it("errors on missing package.json", () => {
      const files = makeValidFiles();
      delete files["package.json"];
      const result = validateTSOutput(files);
      expect(result.valid).toBe(false);
    });

    it("errors on missing bridge.ts", () => {
      const files = makeValidFiles();
      delete files["bridge.ts"];
      const result = validateTSOutput(files);
      expect(result.issues).toContainEqual(
        expect.objectContaining({ file: "bridge.ts", severity: "error" })
      );
    });
  });

  describe("server.ts validation", () => {
    it("catches deprecated server.tool() usage", () => {
      const files = makeValidFiles();
      files["server.ts"] = `import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
const server = new McpServer({ name: "test" });
server.tool("bad_tool", { description: "wrong API" }, async () => ({ content: [] }));`;

      const result = validateTSOutput(files);
      expect(result.valid).toBe(false);
      expect(result.issues).toContainEqual(
        expect.objectContaining({
          file: "server.ts",
          severity: "error",
          message: expect.stringContaining("deprecated server.tool()"),
        })
      );
    });

    it("catches missing McpServer import", () => {
      const files = makeValidFiles();
      files["server.ts"] = `import { Server } from "some-other-lib";
const server = new Server();
server.registerTool("tool", {}, async () => ({ content: [] }));`;

      const result = validateTSOutput(files);
      expect(result.issues).toContainEqual(
        expect.objectContaining({
          file: "server.ts",
          message: expect.stringContaining("Missing McpServer"),
        })
      );
    });

    it("warns when no registerTool calls found", () => {
      const files = makeValidFiles();
      files["server.ts"] = `import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
const server = new McpServer({ name: "empty" });`;

      const result = validateTSOutput(files);
      expect(result.issues).toContainEqual(
        expect.objectContaining({
          file: "server.ts",
          severity: "warning",
          message: expect.stringContaining("No registerTool"),
        })
      );
    });

    it("warns on missing StdioServerTransport", () => {
      const files = makeValidFiles();
      files["server.ts"] = `import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
const server = new McpServer({ name: "test" });
server.registerTool("tool", {}, async () => ({ content: [] }));`;

      const result = validateTSOutput(files);
      expect(result.issues).toContainEqual(
        expect.objectContaining({
          message: expect.stringContaining("StdioServerTransport"),
        })
      );
    });
  });

  describe("ESM validation", () => {
    it("warns on local imports without .js extension", () => {
      const files = makeValidFiles();
      files["server.ts"] = `import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Bridge } from "./bridge";
const server = new McpServer({ name: "test" });
server.registerTool("tool", {}, async () => ({ content: [] }));`;

      const result = validateTSOutput(files);
      expect(result.issues).toContainEqual(
        expect.objectContaining({
          file: "server.ts",
          severity: "warning",
          message: expect.stringContaining(".js extension"),
        })
      );
    });

    it("passes when local imports have .js extension", () => {
      const result = validateTSOutput(makeValidFiles());
      const esmIssues = result.issues.filter((i) => i.message.includes(".js extension"));
      expect(esmIssues).toHaveLength(0);
    });
  });

  describe("package.json validation", () => {
    it("errors when type:module is missing", () => {
      const files = makeValidFiles();
      files["package.json"] = JSON.stringify({
        name: "test",
        scripts: { build: "tsc", test: "vitest run" },
      });

      const result = validateTSOutput(files);
      expect(result.valid).toBe(false);
      expect(result.issues).toContainEqual(
        expect.objectContaining({
          file: "package.json",
          message: expect.stringContaining('"type": "module"'),
        })
      );
    });

    it("warns on missing build script", () => {
      const files = makeValidFiles();
      files["package.json"] = JSON.stringify({
        name: "test",
        type: "module",
        scripts: { test: "vitest run" },
      });

      const result = validateTSOutput(files);
      expect(result.issues).toContainEqual(
        expect.objectContaining({
          file: "package.json",
          message: expect.stringContaining('"build"'),
        })
      );
    });

    it("warns on missing test script", () => {
      const files = makeValidFiles();
      files["package.json"] = JSON.stringify({
        name: "test",
        type: "module",
        scripts: { build: "tsc" },
      });

      const result = validateTSOutput(files);
      expect(result.issues).toContainEqual(
        expect.objectContaining({
          message: expect.stringContaining('"test"'),
        })
      );
    });

    it("errors on invalid JSON", () => {
      const files = makeValidFiles();
      files["package.json"] = "{ invalid json }";

      const result = validateTSOutput(files);
      expect(result.valid).toBe(false);
      expect(result.issues).toContainEqual(
        expect.objectContaining({
          file: "package.json",
          message: expect.stringContaining("Invalid JSON"),
        })
      );
    });
  });

  describe("tsconfig.json validation", () => {
    it("warns when strict mode not enabled", () => {
      const files = makeValidFiles();
      files["tsconfig.json"] = JSON.stringify({
        compilerOptions: { target: "ES2022", module: "NodeNext" },
      });

      const result = validateTSOutput(files);
      expect(result.issues).toContainEqual(
        expect.objectContaining({
          file: "tsconfig.json",
          message: expect.stringContaining("strict"),
        })
      );
    });

    it("errors on invalid JSON", () => {
      const files = makeValidFiles();
      files["tsconfig.json"] = "not json";

      const result = validateTSOutput(files);
      expect(result.valid).toBe(false);
    });
  });
});
