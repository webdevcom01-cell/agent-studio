import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { join } from "node:path";

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const mockMkdir = vi.fn().mockResolvedValue(undefined);
const mockWriteFile = vi.fn().mockResolvedValue(undefined);
const mockReaddir = vi.fn().mockResolvedValue([]);
const mockStat = vi.fn().mockResolvedValue({
  size: 1024,
  isFile: () => true,
  birthtime: new Date("2026-01-01"),
});
const mockRm = vi.fn().mockResolvedValue(undefined);

vi.mock("node:fs/promises", () => ({
  mkdir: (...args: unknown[]) => mockMkdir(...args),
  writeFile: (...args: unknown[]) => mockWriteFile(...args),
  readdir: (...args: unknown[]) => mockReaddir(...args),
  stat: (...args: unknown[]) => mockStat(...args),
  rm: (...args: unknown[]) => mockRm(...args),
}));

import {
  createWorkspace,
  addFile,
  getFiles,
  shareWorkspace,
  cleanupWorkspace,
  WORKSPACE_BASE,
} from "../agent-workspace";

describe("agent-workspace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMkdir.mockResolvedValue(undefined);
    mockWriteFile.mockResolvedValue(undefined);
    mockReaddir.mockResolvedValue([]);
    mockStat.mockResolvedValue({
      size: 1024,
      isFile: () => true,
      birthtime: new Date("2026-01-01"),
    });
    mockRm.mockResolvedValue(undefined);
  });

  describe("createWorkspace", () => {
    it("creates workspace directory", async () => {
      const ws = await createWorkspace("agent-1", "conv-1");

      expect(mockMkdir).toHaveBeenCalledWith(
        join(WORKSPACE_BASE, "conv-1"),
        { recursive: true },
      );
      expect(ws.agentId).toBe("agent-1");
      expect(ws.conversationId).toBe("conv-1");
      expect(ws.files).toEqual([]);
      expect(ws.sharedWith).toEqual([]);
    });

    it("sets basePath correctly", async () => {
      const ws = await createWorkspace("agent-1", "conv-abc");

      expect(ws.basePath).toBe(join(WORKSPACE_BASE, "conv-abc"));
    });
  });

  describe("addFile", () => {
    it("writes file to workspace", async () => {
      const ws = await createWorkspace("agent-1", "conv-1");

      const file = await addFile(ws, "output.png", Buffer.from("data"), "image/png");

      expect(mockWriteFile).toHaveBeenCalledWith(
        join(ws.basePath, "output.png"),
        Buffer.from("data"),
      );
      expect(file.name).toBe("output.png");
      expect(file.mimeType).toBe("image/png");
      expect(file.createdBy).toBe("agent-1");
      expect(file.size).toBe(1024);
    });

    it("appends file to workspace files array", async () => {
      const ws = await createWorkspace("agent-1", "conv-1");

      await addFile(ws, "a.txt", "hello", "text/plain");
      await addFile(ws, "b.txt", "world", "text/plain");

      expect(ws.files).toHaveLength(2);
      expect(ws.files[0].name).toBe("a.txt");
      expect(ws.files[1].name).toBe("b.txt");
    });
  });

  describe("getFiles", () => {
    it("returns empty array when directory does not exist", async () => {
      mockReaddir.mockRejectedValueOnce(new Error("ENOENT"));

      const files = await getFiles("nonexistent");

      expect(files).toEqual([]);
    });

    it("returns files from workspace directory", async () => {
      mockReaddir.mockResolvedValueOnce(["render.png", "log.txt"]);

      const files = await getFiles("conv-1");

      expect(files).toHaveLength(2);
      expect(files[0].name).toBe("render.png");
      expect(files[0].mimeType).toBe("image/png");
      expect(files[1].name).toBe("log.txt");
      expect(files[1].mimeType).toBe("text/plain");
    });

    it("skips non-file entries", async () => {
      mockReaddir.mockResolvedValueOnce(["subdir", "file.json"]);
      mockStat
        .mockResolvedValueOnce({
          isFile: () => false,
          size: 0,
          birthtime: new Date(),
        })
        .mockResolvedValueOnce({
          isFile: () => true,
          size: 256,
          birthtime: new Date(),
        });

      const files = await getFiles("conv-1");

      expect(files).toHaveLength(1);
      expect(files[0].name).toBe("file.json");
    });
  });

  describe("shareWorkspace", () => {
    it("adds target agent to sharedWith", async () => {
      const ws = await createWorkspace("agent-1", "conv-1");

      const shared = shareWorkspace(ws, "agent-2");

      expect(shared.sharedWith).toContain("agent-2");
    });

    it("does not duplicate if already shared", async () => {
      const ws = await createWorkspace("agent-1", "conv-1");

      const shared1 = shareWorkspace(ws, "agent-2");
      const shared2 = shareWorkspace(shared1, "agent-2");

      expect(shared2.sharedWith).toHaveLength(1);
    });

    it("returns new object (immutable)", async () => {
      const ws = await createWorkspace("agent-1", "conv-1");

      const shared = shareWorkspace(ws, "agent-2");

      expect(shared).not.toBe(ws);
      expect(ws.sharedWith).toEqual([]);
    });
  });

  describe("cleanupWorkspace", () => {
    it("removes workspace directory", async () => {
      await cleanupWorkspace("conv-1");

      expect(mockRm).toHaveBeenCalledWith(
        join(WORKSPACE_BASE, "conv-1"),
        { recursive: true, force: true },
      );
    });

    it("handles missing directory gracefully", async () => {
      mockRm.mockRejectedValueOnce(new Error("ENOENT"));

      await expect(cleanupWorkspace("nonexistent")).resolves.toBeUndefined();
    });
  });
});
