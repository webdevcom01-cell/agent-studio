import type { CLIConfig, CLIToolSchema } from "./types";
import { logger } from "@/lib/logger";

interface RegistryEntry {
  config: CLIConfig;
  tools: CLIToolSchema[];
  registeredAt: number;
}

const registry = new Map<string, RegistryEntry>();

export function registerCLI(serverId: string, config: CLIConfig, tools: CLIToolSchema[]): void {
  registry.set(serverId, {
    config,
    tools,
    registeredAt: Date.now(),
  });
  logger.info("CLI registered in bridge registry", {
    serverId,
    cliName: config.cliName,
    toolCount: tools.length,
  });
}

export function unregisterCLI(serverId: string): void {
  const entry = registry.get(serverId);
  if (entry) {
    registry.delete(serverId);
    logger.info("CLI unregistered from bridge registry", {
      serverId,
      cliName: entry.config.cliName,
    });
  }
}

export function getRegisteredCLI(serverId: string): RegistryEntry | null {
  return registry.get(serverId) ?? null;
}

export function getToolsForCLI(serverId: string): CLIToolSchema[] {
  return registry.get(serverId)?.tools ?? [];
}

export function getConfigForCLI(serverId: string): CLIConfig | null {
  return registry.get(serverId)?.config ?? null;
}

export function listRegisteredCLIs(): Array<{
  serverId: string;
  cliName: string;
  toolCount: number;
  registeredAt: number;
}> {
  const entries: Array<{
    serverId: string;
    cliName: string;
    toolCount: number;
    registeredAt: number;
  }> = [];

  for (const [serverId, entry] of registry) {
    entries.push({
      serverId,
      cliName: entry.config.cliName,
      toolCount: entry.tools.length,
      registeredAt: entry.registeredAt,
    });
  }

  return entries;
}

export function getRegistrySize(): number {
  return registry.size;
}

export function clearRegistry(): void {
  registry.clear();
}
