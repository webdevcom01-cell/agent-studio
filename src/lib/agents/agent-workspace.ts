import { mkdir, writeFile, readdir, stat, rm } from "node:fs/promises";
import { join } from "node:path";
import { logger } from "@/lib/logger";

const WORKSPACE_BASE = join("/tmp", "agent-studio", "workspaces");

export interface WorkspaceFile {
  name: string;
  path: string;
  mimeType: string;
  size: number;
  createdBy: string;
  createdAt: string;
}

export interface AgentWorkspace {
  agentId: string;
  conversationId: string;
  basePath: string;
  files: WorkspaceFile[];
  sharedWith: string[];
}

function getWorkspacePath(conversationId: string): string {
  return join(WORKSPACE_BASE, conversationId);
}

export async function createWorkspace(
  agentId: string,
  conversationId: string,
): Promise<AgentWorkspace> {
  const basePath = getWorkspacePath(conversationId);

  await mkdir(basePath, { recursive: true });

  return {
    agentId,
    conversationId,
    basePath,
    files: [],
    sharedWith: [],
  };
}

export async function addFile(
  workspace: AgentWorkspace,
  fileName: string,
  content: Buffer | string,
  mimeType: string,
): Promise<WorkspaceFile> {
  const filePath = join(workspace.basePath, fileName);

  await mkdir(workspace.basePath, { recursive: true });
  await writeFile(filePath, content);

  const fileStat = await stat(filePath);

  const file: WorkspaceFile = {
    name: fileName,
    path: filePath,
    mimeType,
    size: fileStat.size,
    createdBy: workspace.agentId,
    createdAt: new Date().toISOString(),
  };

  workspace.files.push(file);
  return file;
}

export async function getFiles(
  conversationId: string,
): Promise<WorkspaceFile[]> {
  const basePath = getWorkspacePath(conversationId);

  try {
    const entries = await readdir(basePath);
    const files: WorkspaceFile[] = [];

    for (const entry of entries) {
      const filePath = join(basePath, entry);
      const fileStat = await stat(filePath);

      if (fileStat.isFile()) {
        files.push({
          name: entry,
          path: filePath,
          mimeType: guessMimeType(entry),
          size: fileStat.size,
          createdBy: "unknown",
          createdAt: fileStat.birthtime.toISOString(),
        });
      }
    }

    return files;
  } catch {
    return [];
  }
}

export function shareWorkspace(
  workspace: AgentWorkspace,
  targetAgentId: string,
): AgentWorkspace {
  if (workspace.sharedWith.includes(targetAgentId)) {
    return workspace;
  }

  return {
    ...workspace,
    sharedWith: [...workspace.sharedWith, targetAgentId],
  };
}

export async function cleanupWorkspace(
  conversationId: string,
): Promise<void> {
  const basePath = getWorkspacePath(conversationId);

  try {
    await rm(basePath, { recursive: true, force: true });
  } catch (err) {
    logger.warn("Failed to cleanup workspace", {
      conversationId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

function guessMimeType(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase();
  const MIME_MAP: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    svg: "image/svg+xml",
    pdf: "application/pdf",
    json: "application/json",
    txt: "text/plain",
    csv: "text/csv",
    mp3: "audio/mpeg",
    wav: "audio/wav",
    mp4: "video/mp4",
    blend: "application/x-blender",
    fbx: "model/fbx",
    obj: "model/obj",
    stl: "model/stl",
  };

  return MIME_MAP[ext ?? ""] ?? "application/octet-stream";
}

export { WORKSPACE_BASE };
