import { mkdirSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import type { NodeHandler } from "../types";
import { logger } from "@/lib/logger";

interface CodeFile {
  path: string;
  content: string;
}

export const fileWriterHandler: NodeHandler = async (node, context) => {
  const inputVariable = (node.data.inputVariable as string) || "codeOutput";
  const targetDir = (node.data.targetDir as string) || "";
  const outputVariable = (node.data.outputVariable as string) || "fileWriteResult";

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
