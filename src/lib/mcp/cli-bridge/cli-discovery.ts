import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { access, constants } from "node:fs/promises";
import { logger } from "@/lib/logger";
import type { CLIConfig, CLICommand, CLIParameter, CLIToolSchema } from "./types";

const execFileAsync = promisify(execFile);

const DISCOVERY_TIMEOUT_MS = 10_000;
const MAX_HELP_OUTPUT_LENGTH = 50_000;

interface DiscoveryResult {
  success: boolean;
  config?: CLIConfig;
  tools?: CLIToolSchema[];
  error?: string;
}

async function isExecutable(path: string): Promise<boolean> {
  try {
    await access(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

async function getVersion(cliPath: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync(cliPath, ["--version"], {
      timeout: DISCOVERY_TIMEOUT_MS,
    });
    const trimmed = stdout.trim();
    const versionMatch = trimmed.match(/(\d+\.\d+(?:\.\d+)?)/);
    return versionMatch?.[1] ?? trimmed.slice(0, 50);
  } catch {
    return "unknown";
  }
}

function parseHelpFlags(line: string): CLIParameter | null {
  const flagMatch = line.match(
    /^\s+(-[\w-]+(?:,\s*--[\w-]+)?|--[\w-]+)\s+(.+)/
  );
  if (!flagMatch) return null;

  const [, flagPart, description] = flagMatch;
  const flags = flagPart.split(",").map((f) => f.trim());
  const longFlag = flags.find((f) => f.startsWith("--")) ?? flags[0];
  const name = longFlag.replace(/^-+/, "").replace(/-/g, "_");

  const isBool =
    description.toLowerCase().includes("boolean") ||
    description.toLowerCase().includes("flag") ||
    !description.includes("<") && !description.includes("[");

  return {
    name,
    description: description.trim(),
    type: isBool ? "boolean" : "string",
    required: false,
    flag: longFlag,
  };
}

function parseHelpOutput(helpText: string, cliName: string): CLICommand[] {
  const commands: CLICommand[] = [];
  const lines = helpText.split("\n");

  let inCommandsSection = false;
  const commandNames: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    if (/^(commands|available commands|subcommands):/i.test(trimmed)) {
      inCommandsSection = true;
      continue;
    }

    if (inCommandsSection) {
      if (trimmed === "" || /^(options|flags|usage):/i.test(trimmed)) {
        inCommandsSection = false;
        continue;
      }

      const cmdMatch = trimmed.match(/^(\w[\w-]*)\s+(.*)/);
      if (cmdMatch) {
        commandNames.push(cmdMatch[1]);
        commands.push({
          name: cmdMatch[1],
          description: cmdMatch[2].trim(),
          parameters: [],
          subcommands: [],
        });
      }
    }
  }

  if (commands.length === 0) {
    const globalParams: CLIParameter[] = [];
    for (const line of lines) {
      const param = parseHelpFlags(line);
      if (param) globalParams.push(param);
    }

    commands.push({
      name: "run",
      description: `Execute ${cliName}`,
      parameters: globalParams,
      subcommands: [],
    });
  }

  return commands;
}

export function commandToToolSchema(
  cliName: string,
  command: CLICommand,
): CLIToolSchema {
  const toolName = command.name === "run"
    ? `${cliName}_run`
    : `${cliName}_${command.name}`;

  const parameters: CLIToolSchema["parameters"] = {};

  for (const param of command.parameters) {
    parameters[param.name] = {
      type: param.type,
      description: param.description,
      required: param.required,
      default: param.default,
    };
  }

  parameters["_args"] = {
    type: "string",
    description: "Additional arguments to pass to the command",
    required: false,
  };

  return {
    name: toolName,
    description: command.description || `Run ${cliName} ${command.name}`,
    parameters,
  };
}

export async function discoverCLI(cliPath: string): Promise<DiscoveryResult> {
  try {
    const executable = await isExecutable(cliPath);
    if (!executable) {
      return { success: false, error: `Not executable: ${cliPath}` };
    }

    const cliName = cliPath.split("/").pop()?.replace(/\.\w+$/, "") ?? "cli";
    const version = await getVersion(cliPath);

    let helpText: string;
    try {
      const { stdout, stderr } = await execFileAsync(cliPath, ["--help"], {
        timeout: DISCOVERY_TIMEOUT_MS,
      });
      helpText = (stdout || stderr).slice(0, MAX_HELP_OUTPUT_LENGTH);
    } catch (err) {
      const execErr = err as { stdout?: string; stderr?: string };
      helpText = (execErr.stdout ?? execErr.stderr ?? "").slice(
        0,
        MAX_HELP_OUTPUT_LENGTH,
      );
      if (!helpText) {
        return { success: false, error: `Failed to get help output from ${cliPath}` };
      }
    }

    const commands = parseHelpOutput(helpText, cliName);
    const tools = commands.map((cmd) => commandToToolSchema(cliName, cmd));

    const config: CLIConfig = {
      cliPath,
      cliName,
      version,
      commands,
      timeout: 30_000,
      sessionMode: "oneshot",
      envVars: {},
    };

    logger.info("CLI discovered", {
      cliPath,
      cliName,
      version,
      commandCount: commands.length,
      toolCount: tools.length,
    });

    return { success: true, config, tools };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("CLI discovery failed", { cliPath, error: message });
    return { success: false, error: message };
  }
}

export async function detectCommonCLIs(): Promise<string[]> {
  const candidates = [
    "git", "docker", "kubectl", "aws", "gcloud", "az",
    "terraform", "ansible", "helm", "npm", "pnpm", "yarn",
    "python", "pip", "cargo", "go", "rustc",
    "curl", "wget", "jq", "yq", "gh", "ffmpeg",
  ];

  const found: string[] = [];

  for (const cli of candidates) {
    try {
      const { stdout } = await execFileAsync("which", [cli], {
        timeout: 5000,
      });
      if (stdout.trim()) {
        found.push(stdout.trim());
      }
    } catch {
      // not found
    }
  }

  return found;
}
