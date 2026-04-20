import { describe, it, expect, vi } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { parseSearchReplaceBlocks, applyPatchToWorkspace } from "../patch-applier";

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

describe("parseSearchReplaceBlocks", () => {
  it("returns empty array for text with no blocks", () => {
    const result = parseSearchReplaceBlocks("No blocks here at all.");
    expect(result).toEqual([]);
  });

  it("parses single block with File: header → correct filePath/searchFor/replaceWith", () => {
    const text = `File: src/lib/auth.ts
<<<<<<< SEARCH
const old = true;
=======
const updated = true;
>>>>>>> REPLACE`;

    const result = parseSearchReplaceBlocks(text);
    expect(result).toHaveLength(1);
    expect(result[0].filePath).toBe("src/lib/auth.ts");
    expect(result[0].searchFor).toBe("const old = true;");
    expect(result[0].replaceWith).toBe("const updated = true;");
  });

  it("handles \\r\\n line endings (Windows)", () => {
    const text =
      "File: src/foo.ts\r\n" +
      "<<<<<<< SEARCH\r\n" +
      "old\r\n" +
      "=======\r\n" +
      "new\r\n" +
      ">>>>>>> REPLACE";

    const result = parseSearchReplaceBlocks(text);
    expect(result).toHaveLength(1);
    expect(result[0].searchFor).toBe("old");
    expect(result[0].replaceWith).toBe("new");
  });

  it("returns filePath=null when no File: header precedes block", () => {
    const text = `<<<<<<< SEARCH
const x = 1;
=======
const x = 2;
>>>>>>> REPLACE`;

    const result = parseSearchReplaceBlocks(text);
    expect(result).toHaveLength(1);
    expect(result[0].filePath).toBeNull();
  });

  it("parses multiple blocks from single text", () => {
    const text = `File: src/a.ts
<<<<<<< SEARCH
a
=======
A
>>>>>>> REPLACE

File: src/b.ts
<<<<<<< SEARCH
b
=======
B
>>>>>>> REPLACE`;

    const result = parseSearchReplaceBlocks(text);
    expect(result).toHaveLength(2);
    expect(result[0].filePath).toBe("src/a.ts");
    expect(result[1].filePath).toBe("src/b.ts");
  });
});

describe("applyPatchToWorkspace", () => {
  function makeTmpDir(): string {
    const dir = join(tmpdir(), `patch-test-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
    return dir;
  }

  it("applies patch when searchFor found in file content", async () => {
    const workDir = makeTmpDir();
    try {
      const filePath = join(workDir, "target.ts");
      writeFileSync(filePath, "const old = true;\nconst other = 1;", "utf-8");

      const blocks = [{ filePath: "target.ts", searchFor: "const old = true;", replaceWith: "const updated = true;" }];
      const result = await applyPatchToWorkspace(blocks, workDir);

      expect(result.applied).toBe(1);
      expect(result.failed).toBe(0);
    } finally {
      rmSync(workDir, { recursive: true, force: true });
    }
  });

  it("increments failed when searchFor NOT found (no throw)", async () => {
    const workDir = makeTmpDir();
    try {
      const filePath = join(workDir, "target.ts");
      writeFileSync(filePath, "completely different content", "utf-8");

      const blocks = [{ filePath: "target.ts", searchFor: "SEARCH_NOT_PRESENT", replaceWith: "replacement" }];
      const result = await applyPatchToWorkspace(blocks, workDir);

      expect(result.failed).toBe(1);
      expect(result.applied).toBe(0);
      expect(result.errors.length).toBeGreaterThan(0);
    } finally {
      rmSync(workDir, { recursive: true, force: true });
    }
  });

  it("uses fallbackFilePath when block.filePath is null", async () => {
    const workDir = makeTmpDir();
    try {
      const filePath = join(workDir, "fallback.ts");
      writeFileSync(filePath, "const find = 1;", "utf-8");

      const blocks = [{ filePath: null, searchFor: "const find = 1;", replaceWith: "const replace = 2;" }];
      const result = await applyPatchToWorkspace(blocks, workDir, "fallback.ts");

      // fallbackFilePath was used — no "No file path for block" error
      const hasNoPathError = result.errors.some((e) => e === "No file path for block");
      expect(hasNoPathError).toBe(false);
      expect(result.applied).toBe(1);
    } finally {
      rmSync(workDir, { recursive: true, force: true });
    }
  });

  it("records 'No file path for block' error when filePath is null and no fallback", async () => {
    const blocks = [{ filePath: null, searchFor: "x", replaceWith: "y" }];
    const result = await applyPatchToWorkspace(blocks, "/tmp/workspace");

    expect(result.failed).toBe(1);
    expect(result.errors[0]).toBe("No file path for block");
  });

  // ── Path traversal / workspace escape (S3/C8) ──────────────────────────────

  it("rejects absolute paths from AI input (e.g. /etc/passwd)", async () => {
    const workDir = makeTmpDir();
    try {
      const blocks = [{ filePath: "/etc/passwd", searchFor: "root", replaceWith: "hacked" }];
      const result = await applyPatchToWorkspace(blocks, workDir);

      expect(result.failed).toBe(1);
      expect(result.applied).toBe(0);
      expect(result.errors[0]).toContain("Rejected unsafe path");
      expect(result.errors[0]).toContain("/etc/passwd");
    } finally {
      rmSync(workDir, { recursive: true, force: true });
    }
  });

  it("rejects ../ traversal that escapes workDir", async () => {
    const workDir = makeTmpDir();
    try {
      // "../../etc/passwd" would escape a /tmp/patch-test-xxx workDir
      const blocks = [
        { filePath: "../../etc/passwd", searchFor: "root", replaceWith: "hacked" },
      ];
      const result = await applyPatchToWorkspace(blocks, workDir);

      expect(result.failed).toBe(1);
      expect(result.applied).toBe(0);
      expect(result.errors[0]).toContain("Rejected unsafe path");
    } finally {
      rmSync(workDir, { recursive: true, force: true });
    }
  });

  it("rejects deep ../ traversal regardless of depth", async () => {
    const workDir = makeTmpDir();
    try {
      const blocks = [
        { filePath: "subdir/../../../sensitive-file.txt", searchFor: "x", replaceWith: "y" },
      ];
      const result = await applyPatchToWorkspace(blocks, workDir);

      expect(result.failed).toBe(1);
      expect(result.errors[0]).toContain("Rejected unsafe path");
    } finally {
      rmSync(workDir, { recursive: true, force: true });
    }
  });

  it("allows legitimate relative paths inside workDir", async () => {
    const workDir = makeTmpDir();
    try {
      const subDir = join(workDir, "subdir");
      mkdirSync(subDir, { recursive: true });
      writeFileSync(join(subDir, "file.ts"), "const x = 1;", "utf-8");

      const blocks = [
        { filePath: "subdir/file.ts", searchFor: "const x = 1;", replaceWith: "const x = 2;" },
      ];
      const result = await applyPatchToWorkspace(blocks, workDir);

      expect(result.applied).toBe(1);
      expect(result.failed).toBe(0);
    } finally {
      rmSync(workDir, { recursive: true, force: true });
    }
  });
});
