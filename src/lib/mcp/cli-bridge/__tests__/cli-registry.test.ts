import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  registerCLI,
  unregisterCLI,
  getRegisteredCLI,
  getToolsForCLI,
  getConfigForCLI,
  listRegisteredCLIs,
  getRegistrySize,
  clearRegistry,
} from "../cli-registry";
import type { CLIConfig, CLIToolSchema } from "../types";

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

function makeConfig(overrides: Partial<CLIConfig> = {}): CLIConfig {
  return {
    cliPath: "/usr/bin/git",
    cliName: "git",
    version: "2.40.0",
    commands: [],
    timeout: 30000,
    sessionMode: "oneshot",
    envVars: {},
    ...overrides,
  };
}

function makeTool(name: string): CLIToolSchema {
  return {
    name,
    description: `Tool ${name}`,
    parameters: {},
  };
}

describe("cli-registry", () => {
  beforeEach(() => {
    clearRegistry();
  });

  it("registers and retrieves a CLI", () => {
    const config = makeConfig();
    const tools = [makeTool("git_status")];

    registerCLI("server-1", config, tools);

    const entry = getRegisteredCLI("server-1");
    expect(entry).not.toBeNull();
    expect(entry?.config.cliName).toBe("git");
    expect(entry?.tools).toHaveLength(1);
  });

  it("returns null for unregistered CLI", () => {
    expect(getRegisteredCLI("nonexistent")).toBeNull();
  });

  it("unregisters a CLI", () => {
    registerCLI("server-1", makeConfig(), []);
    expect(getRegistrySize()).toBe(1);

    unregisterCLI("server-1");
    expect(getRegistrySize()).toBe(0);
    expect(getRegisteredCLI("server-1")).toBeNull();
  });

  it("returns tools for a registered CLI", () => {
    const tools = [makeTool("git_status"), makeTool("git_log")];
    registerCLI("server-1", makeConfig(), tools);

    const result = getToolsForCLI("server-1");
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe("git_status");
  });

  it("returns empty tools for unregistered CLI", () => {
    expect(getToolsForCLI("nonexistent")).toEqual([]);
  });

  it("returns config for a registered CLI", () => {
    registerCLI("server-1", makeConfig({ version: "3.0.0" }), []);

    const config = getConfigForCLI("server-1");
    expect(config?.version).toBe("3.0.0");
  });

  it("returns null config for unregistered CLI", () => {
    expect(getConfigForCLI("nonexistent")).toBeNull();
  });

  it("lists all registered CLIs", () => {
    registerCLI("s1", makeConfig({ cliName: "git" }), [makeTool("git_run")]);
    registerCLI("s2", makeConfig({ cliName: "docker" }), [makeTool("docker_run"), makeTool("docker_ps")]);

    const list = listRegisteredCLIs();
    expect(list).toHaveLength(2);
    expect(list.find((e) => e.serverId === "s1")?.cliName).toBe("git");
    expect(list.find((e) => e.serverId === "s2")?.toolCount).toBe(2);
  });

  it("clears registry", () => {
    registerCLI("s1", makeConfig(), []);
    registerCLI("s2", makeConfig(), []);
    expect(getRegistrySize()).toBe(2);

    clearRegistry();
    expect(getRegistrySize()).toBe(0);
  });
});
