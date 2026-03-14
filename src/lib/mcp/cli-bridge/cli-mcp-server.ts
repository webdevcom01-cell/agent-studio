import { logger } from "@/lib/logger";
import { cliConfigSchema, type CLIConfig, type CLIToolSchema } from "./types";
import { discoverCLI, commandToToolSchema } from "./cli-discovery";
import { registerCLI, unregisterCLI, getToolsForCLI, getConfigForCLI } from "./cli-registry";
import { getOrCreateSession, executeCommand, removeSession } from "./cli-session-manager";

interface CLIBridgeToolResult {
  success: boolean;
  output: string;
  exitCode: number;
  durationMs: number;
  error?: string;
}

function buildArgs(
  config: CLIConfig,
  commandName: string,
  params: Record<string, unknown>,
): string[] {
  const args: string[] = [];

  const actualCommand = commandName.replace(`${config.cliName}_`, "");
  if (actualCommand !== "run") {
    args.push(actualCommand);
  }

  const command = config.commands.find((c) => c.name === actualCommand);

  if (command) {
    for (const param of command.parameters) {
      const value = params[param.name];
      if (value === undefined || value === null) continue;

      const flag = param.flag ?? `--${param.name.replace(/_/g, "-")}`;

      if (param.type === "boolean") {
        if (value === true) args.push(flag);
      } else {
        args.push(flag, String(value));
      }
    }
  }

  const extraArgs = params["_args"] as string | undefined;
  if (extraArgs) {
    const splitArgs = extraArgs.split(/\s+/).filter(Boolean);
    args.push(...splitArgs);
  }

  return args;
}

export async function initializeCLIBridge(
  serverId: string,
  rawConfig: unknown,
): Promise<{ success: boolean; tools: string[]; error?: string }> {
  const parsed = cliConfigSchema.safeParse(rawConfig);
  if (!parsed.success) {
    const firstError = parsed.error.issues[0];
    return {
      success: false,
      tools: [],
      error: `Invalid CLI config: ${firstError.path.join(".")}: ${firstError.message}`,
    };
  }

  const config = parsed.data;

  try {
    const discovery = await discoverCLI(config.cliPath);

    if (!discovery.success) {
      return {
        success: false,
        tools: [],
        error: discovery.error ?? "CLI discovery failed",
      };
    }

    const mergedConfig: CLIConfig = {
      ...config,
      version: discovery.config?.version ?? config.version,
      commands:
        config.commands.length > 0
          ? config.commands
          : discovery.config?.commands ?? [],
    };

    const tools =
      discovery.tools && discovery.tools.length > 0
        ? discovery.tools
        : mergedConfig.commands.map((cmd) =>
            commandToToolSchema(mergedConfig.cliName, cmd),
          );

    registerCLI(serverId, mergedConfig, tools);

    logger.info("CLI bridge initialized", {
      serverId,
      cliName: mergedConfig.cliName,
      version: mergedConfig.version,
      toolCount: tools.length,
    });

    return {
      success: true,
      tools: tools.map((t) => t.name),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("CLI bridge initialization failed", {
      serverId,
      error: message,
    });
    return { success: false, tools: [], error: message };
  }
}

export async function callCLITool(
  serverId: string,
  toolName: string,
  args: Record<string, unknown>,
): Promise<CLIBridgeToolResult> {
  const config = getConfigForCLI(serverId);
  if (!config) {
    return {
      success: false,
      output: "",
      exitCode: 1,
      durationMs: 0,
      error: `CLI bridge not initialized for server ${serverId}`,
    };
  }

  const tools = getToolsForCLI(serverId);
  const tool = tools.find((t) => t.name === toolName);
  if (!tool) {
    return {
      success: false,
      output: "",
      exitCode: 1,
      durationMs: 0,
      error: `Tool "${toolName}" not found in CLI bridge`,
    };
  }

  const sessionId = getOrCreateSession(serverId, config);
  const commandArgs = buildArgs(config, toolName, args);

  try {
    const result = await executeCommand(sessionId, config.cliPath, commandArgs);

    const output = result.stdout || result.stderr;

    return {
      success: result.exitCode === 0,
      output,
      exitCode: result.exitCode,
      durationMs: result.durationMs,
      error: result.exitCode !== 0 ? result.stderr : undefined,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      output: "",
      exitCode: 1,
      durationMs: 0,
      error: message,
    };
  }
}

export function getCLIBridgeTools(serverId: string): CLIToolSchema[] {
  return getToolsForCLI(serverId);
}

export function shutdownCLIBridge(serverId: string): void {
  removeSession(serverId);
  unregisterCLI(serverId);
  logger.info("CLI bridge shut down", { serverId });
}
