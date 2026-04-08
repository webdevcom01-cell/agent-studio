import { mkdirSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import type { NodeHandler } from "../types";
import { logger } from "@/lib/logger";
import { resolveTemplate } from "../template";

interface CodeFile {
  path: string;
  content: string;
}

export const fileWriterHandler: NodeHandler = async (node, context) => {
  const inputVariable = (node.data.inputVariable as string) || "codeOutput";
  const targetDir = (node.data.targetDir as string) || "";
  const outputVariable = (node.data.outputVariable as string) || "fileWriteResult";

  // Direct mode: filePath + content are set directly on the node (with template syntax)
  const directFilePathTemplate = node.data.filePath as string | undefined;
  const directContentTemplate = node.data.content as string | undefined;
  const isDirectMode = directFilePathTemplate !== undefined && directContentTemplate !== undefined;

  try {
    if (!targetDir) {
      const result = {
        filesWritten: [] as string[],
        errors: ["targetDir is required but not configured on this node"],
        targetDir: "",
        success: false,
      };
      return {
        messages: [{ role: "assistant", content: "File writer error: targetDir not configured." }],
        nextNodeId: (node.data.onErrorNodeId as string) ?? null,
        waitForInput: false,
        updatedVariables: { [outputVariable]: result },
      };
    }

    // ── Direct mode: single-file write via filePath + content on node.data ──────
    if (isDirectMode) {
      const resolvedPath = resolveTemplate(directFilePathTemplate, context.variables);
      const resolvedContent = resolveTemplate(directContentTemplate, context.variables);

      if (!resolvedPath || resolvedPath.startsWith("{{")) {
        const result = { filesWritten: [] as string[], errors: [`filePath template did not resolve: ${directFilePathTemplate}`], targetDir, success: false };
        return {
          messages: [{ role: "assistant", content: `File writer: filePath not resolved (${directFilePathTemplate}).` }],
          nextNodeId: (node.data.onErrorNodeId as string) ?? null,
          waitForInput: false,
          updatedVariables: { [outputVariable]: result },
        };
      }

      // SDLC_TMP is the fallback writable workspace for Railway/container environments
      // where /app may be read-only. All pipeline files land in /tmp/sdlc/<relPath>.
      const SDLC_TMP = "/tmp/sdlc";

      let actualPath = join(targetDir, resolvedPath);
      try {
        mkdirSync(dirname(actualPath), { recursive: true });
        writeFileSync(actualPath, resolvedContent, "utf-8");
      } catch (firstErr) {
        const errCode = (firstErr as NodeJS.ErrnoException).code;
        if (errCode === "EACCES" || errCode === "EROFS" || errCode === "EPERM") {
          // Target dir is read-only (common on Railway/Docker) — fall back to /tmp/sdlc
          actualPath = join(SDLC_TMP, resolvedPath);
          logger.warn("file-writer: EACCES on targetDir, falling back to /tmp/sdlc", {
            nodeId: node.id,
            agentId: context.agentId,
            original: join(targetDir, resolvedPath),
            fallback: actualPath,
          });
          mkdirSync(dirname(actualPath), { recursive: true });
          writeFileSync(actualPath, resolvedContent, "utf-8");
        } else {
          throw firstErr;
        }
      }
      const result = { filesWritten: [actualPath], errors: [] as string[], targetDir: dirname(actualPath), writtenPath: actualPath, success: true };
      logger.info("file-writer direct-mode completed", { nodeId: node.id, agentId: context.agentId, path: actualPath });
      return {
        messages: [{ role: "assistant", content: `Wrote file: ${actualPath}` }],
        nextNodeId: (node.data.nextNodeId as string) ?? null,
        waitForInput: false,
        updatedVariables: { [outputVariable]: result },
      };
    }
    // ─────────────────────────────────────────────────────────────────────────────

    const codeInput = context.variables[inputVariable];
    if (!codeInput) {
      const result = {
        filesWritten: [] as string[],
        errors: [`Input variable "{{${inputVariable}}}" is empty or missing`],
        targetDir,
        success: false,
      };
      return {
        messages: [{ role: "assistant", content: `File writer: no code found in {{${inputVariable}}}.` }],
        nextNodeId: (node.data.onErrorNodeId as string) ?? null,
        waitForInput: false,
        updatedVariables: { [outputVariable]: result },
      };
    }

    const files = extractFiles(codeInput);
    if (files.length === 0) {
      const result = {
        filesWritten: [] as string[],
        errors: [`No files array found in "{{${inputVariable}}}"`],
        targetDir,
        success: false,
      };
      return {
        messages: [{ role: "assistant", content: `File writer: could not extract files from {{${inputVariable}}}.` }],
        nextNodeId: (node.data.onErrorNodeId as string) ?? null,
        waitForInput: false,
        updatedVariables: { [outputVariable]: result },
      };
    }

    const filesWritten: string[] = [];
    const errors: string[] = [];

    for (const file of files) {
      try {
        const fullPath = join(targetDir, file.path);
        mkdirSync(dirname(fullPath), { recursive: true });
        writeFileSync(fullPath, file.content, "utf-8");
        filesWritten.push(fullPath);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        errors.push(`${file.path}: ${message}`);
      }
    }

    const success = errors.length === 0;
    const result = { filesWritten, errors, targetDir, success };

    logger.info("file-writer completed", {
      nodeId: node.id,
      agentId: context.agentId,
      filesWritten: filesWritten.length,
      errors: errors.length,
    });

    const summary = success
      ? `Wrote ${filesWritten.length} file(s) to ${targetDir}`
      : `Wrote ${filesWritten.length} file(s) with ${errors.length} error(s)`;

    return {
      messages: [{ role: "assistant", content: summary }],
      nextNodeId: success
        ? ((node.data.nextNodeId as string) ?? null)
        : ((node.data.onErrorNodeId as string) ?? null),
      waitForInput: false,
      updatedVariables: { [outputVariable]: result },
    };
  } catch (error) {
    logger.error("file-writer-handler error", { nodeId: node.id, error });
    return {
      messages: [{ role: "assistant", content: "An error occurred in file_writer node." }],
      nextNodeId: (node.data.onErrorNodeId as string) ?? null,
      waitForInput: false,
      updatedVariables: {
        [outputVariable]: {
          filesWritten: [],
          errors: ["Internal file writer error"],
          targetDir,
          success: false,
        },
      },
    };
  }
};

function extractFiles(input: unknown): CodeFile[] {
  if (typeof input === "object" && input !== null) {
    const obj = input as Record<string, unknown>;
    if (Array.isArray(obj.files)) {
      return (obj.files as Record<string, unknown>[])
        .filter((f) => typeof f.content === "string" && typeof f.path === "string")
        .map((f) => ({ path: f.path as string, content: f.content as string }));
    }
  }
  return [];
}
