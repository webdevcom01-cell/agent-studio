import { logger } from "@/lib/logger";
import { executePython } from "../python-executor";
import type { NodeHandler } from "../types";

const MAX_CODE_LENGTH = 20_000;
const EXECUTION_TIMEOUT_MS = 10_000;
const EXECUTION_TIMEOUT_WITH_PACKAGES_MS = 60_000;
const MAX_PACKAGES = 10;

/** Allowed package name pattern — prevents shell injection */
const PACKAGE_NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9_.-]*([<>=!~]+[a-zA-Z0-9._*]+)?$/;

/** Packages that mirror blocked system modules — extra safety layer */
const BLOCKED_PACKAGES = new Set(["os-sys", "shell", "ptyprocess", "pexpect"]);

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

/** Dangerous module patterns blocked in Python code */
const BLOCKED_PATTERNS = [
  /\bimport\s+os\b/,
  /\bfrom\s+os\b/,
  /\bimport\s+subprocess\b/,
  /\bfrom\s+subprocess\b/,
  /\bimport\s+socket\b/,
  /\bfrom\s+socket\b/,
  /\bimport\s+urllib\b/,
  /\bfrom\s+urllib\b/,
  /\bimport\s+requests\b/,
  /\bfrom\s+requests\b/,
  /\bopen\s*\(/,
  /\b__import__\s*\(/,
  /\beval\s*\(/,
  /\bexec\s*\(/,
  /\bcompile\s*\(/,
  /\bgetattr\s*\(\s*__builtins__/,
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
