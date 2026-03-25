import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  initializeCLIBridge,
  callCLITool,
  getCLIBridgeTools,
  shutdownCLIBridge,
} from "../cli-mcp-server";
import { clearRegistry, getRegistrySize } from "../cli-registry";
import { clearAllSessions } from "../cli-session-manager";

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

describe("cli-mcp-server", () => {
  beforeEach(() => {
    clearRegistry();
    clearAllSessions();
  });

  it("rejects invalid config", async () => {
    const result = await initializeCLIBridge("server-1", { invalid: true });

    expect(result.success).toBe(false);
    expect(result.error).toContain("Invalid CLI config");
  });

  it("rejects config without cliPath", async () => {
    const result = await initializeCLIBridge("server-1", {
      cliName: "test",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("Invalid CLI config");
  });

  it("initializes bridge for /bin/echo", async () => {
    const result = await initializeCLIBridge("server-echo", {
      cliPath: "/bin/echo",
      cliName: "echo",
    });

    expect(result.success).toBe(true);
    expect(result.tools.length).toBeGreaterThan(0);
    expect(getRegistrySize()).toBe(1);
  });

  it("returns tools after initialization", async () => {
    await initializeCLIBridge("server-echo", {
      cliPath: "/bin/echo",
      cliName: "echo",
    });

    const tools = getCLIBridgeTools("server-echo");
    expect(tools.length).toBeGreaterThan(0);
  });

  it("returns empty tools for uninitialized bridge", () => {
    const tools = getCLIBridgeTools("nonexistent");
    expect(tools).toEqual([]);
  });

  it("calls a CLI tool via bridge", async () => {
    await initializeCLIBridge("server-echo", {
      cliPath: "/bin/echo",
      cliName: "echo",
    });

    const tools = getCLIBridgeTools("server-echo");
    const toolName = tools[0].name;

    const result = await callCLITool("server-echo", toolName, {
      _args: "hello bridge",
    });

    expect(result.success).toBe(true);
    expect(result.output).toContain("hello bridge");
    expect(result.exitCode).toBe(0);
  });

  it("returns error for uninitialized bridge call", async () => {
    const result = await callCLITool("nonexistent", "some_tool", {});

    expect(result.success).toBe(false);
    expect(result.error).toContain("not initialized");
  });

  it("returns error for unknown tool name", async () => {
    await initializeCLIBridge("server-echo", {
      cliPath: "/bin/echo",
      cliName: "echo",
    });

    const result = await callCLITool("server-echo", "nonexistent_tool", {});

    expect(result.success).toBe(false);
    expect(result.error).toContain("not found");
  });

  it("shuts down bridge cleanly", async () => {
    await initializeCLIBridge("server-echo", {
      cliPath: "/bin/echo",
      cliName: "echo",
    });
    expect(getRegistrySize()).toBe(1);

    shutdownCLIBridge("server-echo");
    expect(getRegistrySize()).toBe(0);
  });
});
