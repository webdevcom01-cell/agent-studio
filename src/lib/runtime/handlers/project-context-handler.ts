import { readFileSync, readdirSync, existsSync } from "fs";
import { join, dirname, basename } from "path";
import type { NodeHandler } from "../types";
import { logger } from "@/lib/logger";

const DEFAULT_MAX_TOKENS = 4000;
const CHARS_PER_TOKEN = 4;
const PROJECT_ROOT = process.cwd();

export const projectContextHandler: NodeHandler = async (node, context) => {
  const contextFiles = Array.isArray(node.data.contextFiles)
    ? (node.data.contextFiles as string[])
    : [];
  const exampleFiles = Array.isArray(node.data.exampleFiles)
    ? (node.data.exampleFiles as string[])
    : [];
  const contextLabel = (node.data.contextLabel as string) || "Project Context";
  const maxTokens = (node.data.maxTokens as number) || DEFAULT_MAX_TOKENS;
  const outputVariable = (node.data.outputVariable as string) || "projectContext";
  const maxChars = maxTokens * CHARS_PER_TOKEN;

  const nextNodeId =
    context.flowContent.edges.find((e) => e.source === node.id)?.target ?? null;

  try {
    const sections: string[] = [];

    const allPaths = resolveGlobPaths(contextFiles);
    const examplePaths = resolveGlobPaths(exampleFiles);

    for (const filePath of allPaths) {
      const content = safeReadFile(filePath);
      if (content === null) {
        logger.warn("project-context: file not found, skipping", { filePath });
        continue;
      }
      sections.push(`## ${filePath}\n\n${content}`);
    }

    for (const filePath of examplePaths) {
      const content = safeReadFile(filePath);
      if (content === null) {
        logger.warn("project-context: example file not found, skipping", { filePath });
        continue;
      }
      sections.push(`## Example: ${filePath}\n\n\`\`\`\n${content}\n\`\`\``);
    }

    let projectContext = sections.join("\n\n---\n\n");
    if (projectContext.length > maxChars) {
      projectContext = projectContext.slice(0, maxChars) + "\n\n[truncated]";
    }

    const fileCount = allPaths.length + examplePaths.length;
    const summary = fileCount > 0
      ? `Loaded ${fileCount} context file${fileCount !== 1 ? "s" : ""} (${contextLabel})`
      : `No context files loaded (${contextLabel})`;

    return {
      messages: [{ role: "assistant", content: summary }],
      nextNodeId,
      waitForInput: false,
      updatedVariables: { [outputVariable]: projectContext },
    };
  } catch (error) {
    logger.error("project-context-handler error", { nodeId: node.id, error });
    return {
      messages: [{ role: "assistant", content: "An error occurred in project_context node." }],
      nextNodeId: null,
      waitForInput: false,
    };
  }
};

function resolveGlobPaths(patterns: string[]): string[] {
  const resolved: string[] = [];
  for (const pattern of patterns) {
    if (!pattern) continue;
    if (pattern.includes("*")) {
      resolved.push(...expandGlob(pattern));
    } else {
      resolved.push(pattern);
    }
  }
  return resolved;
}

function expandGlob(pattern: string): string[] {
  const absPattern = pattern.startsWith("/") ? pattern : join(PROJECT_ROOT, pattern);
  const dir = dirname(absPattern);
  const filePattern = basename(absPattern);

  if (!existsSync(dir)) return [];

  const regex = new RegExp(
    "^" + filePattern.replace(/\./g, "\\.").replace(/\*/g, ".*") + "$"
  );

  try {
    return readdirSync(dir)
      .filter((f) => regex.test(f))
      .map((f) => join(dir.replace(PROJECT_ROOT + "/", ""), f));
  } catch {
    return [];
  }
}

function safeReadFile(filePath: string): string | null {
  const absPath = filePath.startsWith("/") ? filePath : join(PROJECT_ROOT, filePath);
  if (!existsSync(absPath)) return null;
  try {
    return readFileSync(absPath, "utf-8");
  } catch {
    return null;
  }
}
