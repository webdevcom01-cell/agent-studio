import { spawn, type ChildProcess } from "node:child_process";
import { logger } from "@/lib/logger";
import type { CLIConfig, CLIExecutionResult, CLISessionInfo } from "./types";

interface SessionEntry {
  id: string;
  config: CLIConfig;
  process: ChildProcess | null;
  createdAt: number;
  lastUsedAt: number;
}

const IDLE_TTL_MS = 5 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 60 * 1000;
const MAX_SESSIONS = 20;
const MAX_OUTPUT_LENGTH = 100_000;

const sessions = new Map<string, SessionEntry>();
let cleanupTimer: ReturnType<typeof setInterval> | null = null;

function startCleanup(): void {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [id, entry] of sessions) {
      if (now - entry.lastUsedAt > IDLE_TTL_MS) {
        destroySession(id);
      }
    }
    if (sessions.size === 0 && cleanupTimer) {
      clearInterval(cleanupTimer);
      cleanupTimer = null;
    }
  }, CLEANUP_INTERVAL_MS);
}

function evictLRU(): void {
  if (sessions.size < MAX_SESSIONS) return;

  let oldestId: string | null = null;
  let oldestTime = Infinity;

  for (const [id, entry] of sessions) {
    if (entry.lastUsedAt < oldestTime) {
      oldestTime = entry.lastUsedAt;
      oldestId = id;
    }
  }

  if (oldestId) {
    destroySession(oldestId);
  }
}

function destroySession(sessionId: string): void {
  const entry = sessions.get(sessionId);
  if (!entry) return;

  if (entry.process && !entry.process.killed) {
    entry.process.kill("SIGTERM");
    setTimeout(() => {
      if (entry.process && !entry.process.killed) {
        entry.process.kill("SIGKILL");
      }
    }, 5000);
  }

  sessions.delete(sessionId);
  logger.info("CLI session destroyed", {
    sessionId,
    cliName: entry.config.cliName,
  });
}

export function getOrCreateSession(
  serverId: string,
  config: CLIConfig,
): string {
  const existing = sessions.get(serverId);
  if (existing) {
    existing.lastUsedAt = Date.now();
    return existing.id;
  }

  evictLRU();

  const entry: SessionEntry = {
    id: serverId,
    config,
    process: null,
    createdAt: Date.now(),
    lastUsedAt: Date.now(),
  };

  sessions.set(serverId, entry);
  startCleanup();

  logger.info("CLI session created", {
    sessionId: serverId,
    cliName: config.cliName,
    mode: config.sessionMode,
  });

  return entry.id;
}

export async function executeCommand(
  sessionId: string,
  command: string,
  args: string[],
): Promise<CLIExecutionResult> {
  const entry = sessions.get(sessionId);
  if (!entry) {
    return {
      stdout: "",
      stderr: "Session not found",
      exitCode: 1,
      durationMs: 0,
    };
  }

  entry.lastUsedAt = Date.now();
  const startTime = Date.now();

  const env = {
    ...process.env,
    ...entry.config.envVars,
  };

  const spawnOptions = {
    cwd: entry.config.workingDirectory,
    env,
    timeout: entry.config.timeout,
    shell: false as const, // SECURITY: never invoke via shell — prevents metacharacter injection
    windowsHide: true,
  };

  return new Promise<CLIExecutionResult>((resolve) => {
    const child = spawn(command, args, spawnOptions);

    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (data: Buffer) => {
      const chunk = data.toString();
      if (stdout.length + chunk.length <= MAX_OUTPUT_LENGTH) {
        stdout += chunk;
      }
    });

    child.stderr?.on("data", (data: Buffer) => {
      const chunk = data.toString();
      if (stderr.length + chunk.length <= MAX_OUTPUT_LENGTH) {
        stderr += chunk;
      }
    });

    child.on("close", (code) => {
      const durationMs = Date.now() - startTime;
      resolve({
        stdout,
        stderr,
        exitCode: code ?? 1,
        durationMs,
      });
    });

    child.on("error", (err) => {
      const durationMs = Date.now() - startTime;
      resolve({
        stdout,
        stderr: err.message,
        exitCode: 1,
        durationMs,
      });
    });
  });
}

export function getSessionInfo(sessionId: string): CLISessionInfo | null {
  const entry = sessions.get(sessionId);
  if (!entry) return null;

  return {
    id: entry.id,
    cliName: entry.config.cliName,
    createdAt: entry.createdAt,
    lastUsedAt: entry.lastUsedAt,
    isAlive: entry.process ? !entry.process.killed : true,
  };
}

export function removeSession(sessionId: string): void {
  destroySession(sessionId);
}

export function getSessionCount(): number {
  return sessions.size;
}

export function clearAllSessions(): void {
  for (const id of sessions.keys()) {
    destroySession(id);
  }
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
}

process.on("SIGTERM", clearAllSessions);
process.on("SIGINT", clearAllSessions);
