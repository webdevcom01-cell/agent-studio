import { describe, it, expect, vi } from "vitest";
import { commandToToolSchema } from "../cli-discovery";
import type { CLICommand } from "../types";

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

describe("commandToToolSchema", () => {
  it("generates tool schema from command", () => {
    const command: CLICommand = {
      name: "status",
      description: "Show working tree status",
      parameters: [
        {
          name: "short",
          description: "Give output in short format",
          type: "boolean",
          required: false,
          flag: "--short",
        },
        {
          name: "branch",
          description: "Show branch info",
          type: "boolean",
          required: false,
          flag: "--branch",
        },
      ],
      subcommands: [],
    };

    const schema = commandToToolSchema("git", command);

    expect(schema.name).toBe("git_status");
    expect(schema.description).toBe("Show working tree status");
    expect(schema.parameters.short).toBeDefined();
    expect(schema.parameters.short.type).toBe("boolean");
    expect(schema.parameters.branch).toBeDefined();
    expect(schema.parameters._args).toBeDefined();
  });

  it("generates run tool for unnamed commands", () => {
    const command: CLICommand = {
      name: "run",
      description: "Execute docker",
      parameters: [],
      subcommands: [],
    };

    const schema = commandToToolSchema("docker", command);

    expect(schema.name).toBe("docker_run");
    expect(schema.parameters._args).toBeDefined();
    expect(schema.parameters._args.required).toBe(false);
  });

  it("includes required flag on required parameters", () => {
    const command: CLICommand = {
      name: "push",
      description: "Push changes",
      parameters: [
        {
          name: "remote",
          description: "Remote name",
          type: "string",
          required: true,
        },
      ],
      subcommands: [],
    };

    const schema = commandToToolSchema("git", command);

    expect(schema.parameters.remote.required).toBe(true);
  });

  it("handles command with no parameters", () => {
    const command: CLICommand = {
      name: "version",
      description: "Show version",
      parameters: [],
      subcommands: [],
    };

    const schema = commandToToolSchema("node", command);

    expect(schema.name).toBe("node_version");
    expect(Object.keys(schema.parameters)).toEqual(["_args"]);
  });
});
