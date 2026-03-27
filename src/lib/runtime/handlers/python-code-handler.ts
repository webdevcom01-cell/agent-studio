import { logger } from "@/lib/logger";
import { executePython } from "../python-executor";
import type { NodeHandler } from "../types";

const MAX_CODE_LENGTH = 20_000;
const EXECUTION_TIMEOUT_MS = 10_000;
const EXECUTION_TIMEOUT_WITH_PACKAGES_MS = 60_000;
const MAX_PACKAGES = 10;

/** Allowed package name pattern — prevents shell injection */
const PACKAGE_NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9_.-]*([<>=!~]+[a-zA-Z0-9._*]+)?$/;

/** Packages that mirror blocked system modules or enable system access */
const BLOCKED_PACKAGES = new Set([
  "os-sys", "shell", "ptyprocess", "pexpect",
  "subprocess32", "plumbum", "sh", "invoke", "fabric",
  "paramiko", "pyautogui", "keyboard", "mouse",
  "ctypes", "cffi", "pycparser",
  "dill", "cloudpickle",
]);

function parsePackages(raw: string): { packages: string[]; error: string | null } {
  const candidates = raw
    .split("\n")
    .map((p) => p.trim())
    .filter(Boolean);

  if (candidates.length > MAX_PACKAGES) {
    return { packages: [], error: `Maximum ${MAX_PACKAGES} packages allowed per node.` };
  }

  const invalid = candidates.find((p) => !PACKAGE_NAME_RE.test(p));
  if (invalid) {
    return { packages: [], error: `Invalid package name: "${invalid}". Use alphanumeric names only.` };
  }

  const blocked = candidates.find((p) => BLOCKED_PACKAGES.has(p.split(/[<>=!~]/)[0]));
  if (blocked) {
    return { packages: [], error: `Package "${blocked}" is not allowed.` };
  }

  return { packages: candidates, error: null };
}

/**
 * Dangerous modules blocked in Python code.
 * Checked against both `import X` and `from X import ...` forms.
 * NOTE: This is a defense-in-depth layer — the executor itself should also
 * restrict builtins. Regex filtering alone is NOT a security boundary.
 */
const BLOCKED_MODULES = [
  "os", "subprocess", "socket", "urllib", "requests", "httpx", "aiohttp",
  "sys", "importlib", "ctypes", "shutil", "pathlib", "signal",
  "multiprocessing", "threading", "asyncio",
  "pickle", "marshal", "shelve", "code", "codeop",
  "pty", "pdb", "profile", "trace", "webbrowser",
  "tempfile", "glob", "fnmatch",
  "io", "fcntl", "termios", "resource", "select", "mmap",
  "http", "xmlrpc", "ftplib", "smtplib", "poplib", "imaplib", "telnetlib",
];

/** Build import patterns from module list — catches `import X` and `from X import ...` */
const BLOCKED_IMPORT_PATTERNS: RegExp[] = BLOCKED_MODULES.flatMap((mod) => [
  new RegExp(`\\bimport\\s+${mod}\\b`),
  new RegExp(`\\bfrom\\s+${mod}\\b`),
]);

/** Dangerous builtins and metaprogramming patterns */
const BLOCKED_CALLABLE_PATTERNS: RegExp[] = [
  /\b__import__\s*\(/,          // Dynamic import
  /\beval\s*\(/,                // Code evaluation
  /\bexec\s*\(/,                // Code execution
  /\bcompile\s*\(/,             // Code compilation
  /\bgetattr\s*\(/,             // Arbitrary attribute access (bypass blocklist)
  /\bsetattr\s*\(/,             // Arbitrary attribute mutation
  /\bdelattr\s*\(/,             // Arbitrary attribute deletion
  /\b__builtins__\b/,           // Direct builtins access
  /\b__subclasses__\b/,         // Class hierarchy traversal (sandbox escape)
  /\b__globals__\b/,            // Global scope access
  /\b__code__\b/,               // Code object manipulation
  /\b__bases__\b/,              // Base class manipulation
  /\b__mro__\b/,                // Method resolution order traversal
  /\bbreakpoint\s*\(/,          // Debugger invocation
  /\bglobals\s*\(\s*\)/,        // globals() call
  /\blocals\s*\(\s*\)/,         // locals() call
  /\bvars\s*\(\s*\)/,           // vars() call
  /\bdir\s*\(\s*__/,            // dir() on dunder objects
  /\btype\s*\(\s*['"][^'"]+['"]\s*,/, // Dynamic class creation via type()
];

/** File I/O patterns — more precise than bare `open(` to reduce false positives */
const BLOCKED_IO_PATTERNS: RegExp[] = [
  /(?<![a-zA-Z_])open\s*\(/,    // Standalone open() — not myfunction_open()
  /\bFile\s*\(/,                // pathlib.Path-style
];

const BLOCKED_PATTERNS = [
  ...BLOCKED_IMPORT_PATTERNS,
  ...BLOCKED_CALLABLE_PATTERNS,
  ...BLOCKED_IO_PATTERNS,
];

function validatePythonCode(code: string): string | null {
  if (code.length > MAX_CODE_LENGTH) {
    return `Code exceeds maximum length of ${MAX_CODE_LENGTH} characters.`;
  }
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(code)) {
      return `Code contains a blocked pattern: ${pattern.source}`;
    }
  }
  return null;
}

export const pythonCodeHandler: NodeHandler = async (node, context) => {
  const code = (node.data.code as string) ?? "";
  const outputVariable = (node.data.outputVariable as string) ?? "";
  const packagesRaw = (node.data.packages as string) ?? "";

  if (!code.trim()) {
    return { messages: [], nextNodeId: null, waitForInput: false };
  }

  const validationError = validatePythonCode(code);
  if (validationError) {
    return {
      messages: [
        {
          role: "assistant",
          content: `⚠️ Python code blocked: ${validationError}`,
        },
      ],
      nextNodeId: null,
      waitForInput: false,
    };
  }

  const { packages, error: pkgError } = parsePackages(packagesRaw);
  if (pkgError) {
    return {
      messages: [{ role: "assistant", content: `⚠️ Package error: ${pkgError}` }],
      nextNodeId: null,
      waitForInput: false,
    };
  }

  try {
    const response = await executePython({
      code,
      variables: context.variables,
      timeout: packages.length > 0 ? EXECUTION_TIMEOUT_WITH_PACKAGES_MS : EXECUTION_TIMEOUT_MS,
      packages,
    });

    if (!response.success) {
      const errorContent = response.error ?? "Unknown Python error";
      logger.error("Python code execution failed", { error: errorContent, agentId: context.agentId });
      return {
        messages: [
          {
            role: "assistant",
            content: `❌ Python error:\n\`\`\`\n${errorContent}\n\`\`\``,
          },
        ],
        nextNodeId: null,
        waitForInput: false,
      };
    }

    const messages = [];

    // Emit stdout output as a message if it exists
    if (response.output.trim()) {
      messages.push({
        role: "assistant" as const,
        content: response.output.trim(),
        metadata: {
          nodeType: "python_code",
          plots: response.plots,
        },
      });
    }

    // Emit plots as a separate message if there are plots and no stdout
    if (response.plots.length > 0 && !response.output.trim()) {
      messages.push({
        role: "assistant" as const,
        content: `[Python generated ${response.plots.length} plot(s)]`,
        metadata: {
          nodeType: "python_code",
          plots: response.plots,
        },
      });
    }

    return {
      messages,
      nextNodeId: null,
      waitForInput: false,
      updatedVariables: outputVariable
        ? { [outputVariable]: response.result }
        : undefined,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const isTimeout = errorMsg.includes("timed out");
    const content = isTimeout
      ? "⏱️ Python execution timed out."
      : "❌ Error executing Python code.";

    logger.error("Python code handler error", error, { agentId: context.agentId });

    return {
      messages: [{ role: "assistant", content }],
      nextNodeId: null,
      waitForInput: false,
    };
  }
};
