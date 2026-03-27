import { resolve, normalize, isAbsolute } from "node:path";
import { access, constants, realpath } from "node:fs/promises";
import { logger } from "@/lib/logger";

// ── Path allowlist ───────────────────────────────────────────────────────────
// Only CLI executables in these directories are allowed.
// Prevents arbitrary binary execution (e.g., /bin/rm, /usr/sbin/iptables).
const ALLOWED_PATH_PREFIXES = [
  "/usr/bin/",
  "/usr/local/bin/",
  "/opt/homebrew/bin/",
  "/home/",       // user-installed CLIs in home directories
  "/snap/bin/",   // Ubuntu snap packages
] as const;

// Explicitly blocked executables — even if they're in allowed directories.
const BLOCKED_EXECUTABLES = new Set([
  "rm", "rmdir", "mkfs", "dd", "fdisk", "parted",
  "shutdown", "reboot", "halt", "poweroff", "init",
  "iptables", "ip6tables", "nft", "ufw",
  "passwd", "useradd", "userdel", "usermod", "groupadd",
  "chown", "chmod", "chgrp", "chroot",
  "mount", "umount", "swapon", "swapoff",
  "kill", "killall", "pkill",
  "su", "sudo", "doas",
  "nc", "ncat", "netcat", "socat",     // network tools often used for reverse shells
  "bash", "sh", "zsh", "fish", "csh",  // direct shell access
  "eval", "exec",
  "env",                                // can be used to bypass restrictions
  "xargs",                              // can execute arbitrary commands
  "find",                               // -exec flag allows command execution
]);

// ── Argument sanitization ────────────────────────────────────────────────────
// Block shell metacharacters and dangerous patterns in arguments.
const DANGEROUS_ARG_PATTERNS = [
  /[;&|`$(){}]/,                       // shell metacharacters
  /\.\.[/\\]/,                         // path traversal
  /^-.*=.*[;&|`$(){}]/,               // flag injection with shell chars
  />\s*/,                              // output redirection
  /<\s*/,                              // input redirection
  /\n|\r/,                             // newline injection
];

// ── Environment variable blocklist ───────────────────────────────────────────
// Block env vars that can alter runtime behavior or enable code injection.
const BLOCKED_ENV_VARS = new Set([
  "LD_PRELOAD",
  "LD_LIBRARY_PATH",
  "DYLD_INSERT_LIBRARIES",
  "DYLD_LIBRARY_PATH",
  "PYTHONPATH",
  "PYTHONSTARTUP",
  "NODE_OPTIONS",
  "NODE_PATH",
  "PERL5LIB",
  "RUBYLIB",
  "RUBYOPT",
  "BASH_ENV",
  "ENV",
  "CDPATH",
  "PROMPT_COMMAND",
  "PATH",       // prevent PATH manipulation to redirect to malicious binaries
  "HOME",       // prevent HOME override attacks
  "SHELL",
]);

// ── Working directory validation ─────────────────────────────────────────────
const BLOCKED_DIRECTORY_PREFIXES = [
  "/etc",
  "/sys",
  "/proc",
  "/dev",
  "/boot",
  "/sbin",
  "/root",
  "/var/run",
  "/var/log",
];

export interface SecurityValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validate that a CLI path is safe to execute.
 * Checks: absolute path, in allowed directory, not a blocked executable,
 * resolves symlinks, confirms executable permission.
 */
export async function validateCliPath(
  cliPath: string,
): Promise<SecurityValidationResult> {
  // Must be absolute — no relative paths
  if (!isAbsolute(cliPath)) {
    // Allow bare command names (e.g., "git", "docker") — these resolve via PATH
    if (cliPath.includes("/") || cliPath.includes("\\")) {
      return { valid: false, error: "Relative paths are not allowed. Use absolute paths or bare command names." };
    }
    // Bare command name — check against blocked list
    const baseName = cliPath.toLowerCase();
    if (BLOCKED_EXECUTABLES.has(baseName)) {
      return { valid: false, error: `Executable "${cliPath}" is blocked for security reasons.` };
    }
    return { valid: true };
  }

  // Normalize to prevent /usr/bin/../sbin/... traversal
  const normalized = normalize(cliPath);

  // Check against allowed prefixes
  const inAllowedDir = ALLOWED_PATH_PREFIXES.some((prefix) =>
    normalized.startsWith(prefix),
  );
  if (!inAllowedDir) {
    logger.warn("CLI path rejected — not in allowed directory", { cliPath, normalized });
    return {
      valid: false,
      error: `CLI path must be in an allowed directory (${ALLOWED_PATH_PREFIXES.join(", ")}).`,
    };
  }

  // Resolve symlinks to prevent symlink-based bypass
  try {
    const resolved = await realpath(normalized);
    const resolvedInAllowed = ALLOWED_PATH_PREFIXES.some((prefix) =>
      resolved.startsWith(prefix),
    );
    if (!resolvedInAllowed) {
      logger.warn("CLI path rejected — symlink resolves outside allowed directory", {
        cliPath,
        resolved,
      });
      return {
        valid: false,
        error: "CLI path resolves to a location outside allowed directories.",
      };
    }
  } catch {
    // File doesn't exist yet or can't be resolved — allow if in prefix
    // (will fail later at execution time with a clear error)
  }

  // Extract base executable name and check against blocklist
  const baseName = normalized.split("/").pop()?.toLowerCase() ?? "";
  if (BLOCKED_EXECUTABLES.has(baseName)) {
    logger.warn("CLI executable is blocked", { cliPath, baseName });
    return {
      valid: false,
      error: `Executable "${baseName}" is blocked for security reasons.`,
    };
  }

  // Verify the file is actually executable
  try {
    await access(normalized, constants.X_OK);
  } catch {
    return {
      valid: false,
      error: `CLI path is not executable: ${normalized}`,
    };
  }

  return { valid: true };
}

/**
 * Sanitize command arguments — block shell metacharacters and injection patterns.
 */
export function validateArgs(args: string[]): SecurityValidationResult {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    for (const pattern of DANGEROUS_ARG_PATTERNS) {
      if (pattern.test(arg)) {
        logger.warn("Dangerous argument pattern detected", {
          argIndex: i,
          pattern: pattern.source,
        });
        return {
          valid: false,
          error: `Argument at index ${i} contains blocked characters or patterns.`,
        };
      }
    }

    // Block excessively long arguments (potential buffer overflow or abuse)
    if (arg.length > 10_000) {
      return {
        valid: false,
        error: `Argument at index ${i} exceeds maximum length (10,000 chars).`,
      };
    }
  }

  return { valid: true };
}

/**
 * Validate environment variables — block known dangerous vars.
 */
export function validateEnvVars(
  envVars: Record<string, string>,
): SecurityValidationResult {
  for (const key of Object.keys(envVars)) {
    if (BLOCKED_ENV_VARS.has(key.toUpperCase())) {
      logger.warn("Blocked environment variable", { key });
      return {
        valid: false,
        error: `Environment variable "${key}" is blocked for security reasons.`,
      };
    }
  }

  return { valid: true };
}

/**
 * Validate working directory — must be a safe, non-system directory.
 */
export function validateWorkingDirectory(
  dir: string | undefined,
): SecurityValidationResult {
  if (!dir) return { valid: true };

  const normalized = resolve(normalize(dir));

  for (const prefix of BLOCKED_DIRECTORY_PREFIXES) {
    if (normalized === prefix || normalized.startsWith(prefix + "/")) {
      logger.warn("Blocked working directory", { dir, normalized });
      return {
        valid: false,
        error: `Working directory "${dir}" is in a restricted system path.`,
      };
    }
  }

  return { valid: true };
}

/**
 * Full validation of a CLI bridge configuration before initialization.
 * Called once during initializeCLIBridge before any execution happens.
 */
export async function validateCLIConfig(config: {
  cliPath: string;
  workingDirectory?: string;
  envVars: Record<string, string>;
}): Promise<SecurityValidationResult> {
  const pathResult = await validateCliPath(config.cliPath);
  if (!pathResult.valid) return pathResult;

  const envResult = validateEnvVars(config.envVars);
  if (!envResult.valid) return envResult;

  const dirResult = validateWorkingDirectory(config.workingDirectory);
  if (!dirResult.valid) return dirResult;

  return { valid: true };
}
