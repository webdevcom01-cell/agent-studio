import { describe, it, expect, vi, beforeEach } from "vitest";
import type { FileSignature } from "../ast-analyzer";

vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
}));

vi.mock("ts-morph", () => ({
  Project: vi.fn().mockImplementation(() => ({
    addSourceFilesAtPaths: vi.fn(),
    getSourceFiles: vi.fn().mockReturnValue([]),
  })),
}));

const { existsSync } = await import("node:fs");
const mockedExistsSync = vi.mocked(existsSync);

describe("extractCodeSignatures", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns [] when existsSync returns false (dir not found)", async () => {
    mockedExistsSync.mockReturnValue(false);
    const { extractCodeSignatures } = await import("../ast-analyzer");
    const result = await extractCodeSignatures("/nonexistent/path");
    expect(result).toEqual([]);
  });

  it("returns [] and does NOT throw when ts-morph throws", async () => {
    mockedExistsSync.mockReturnValue(true);
    const { Project } = await import("ts-morph");
    vi.mocked(Project).mockImplementationOnce(() => {
      throw new Error("ts-morph failed");
    });
    const { extractCodeSignatures } = await import("../ast-analyzer");
    await expect(extractCodeSignatures("/some/path")).resolves.toEqual([]);
  });

  it("calls Project with skipAddingFilesFromTsConfig: true", async () => {
    mockedExistsSync.mockReturnValue(true);
    const { Project } = await import("ts-morph");
    const { extractCodeSignatures } = await import("../ast-analyzer");
    await extractCodeSignatures("/some/path");
    expect(Project).toHaveBeenCalledWith(
      expect.objectContaining({ skipAddingFilesFromTsConfig: true }),
    );
  });
});

describe("formatSignaturesForPrompt", () => {
  it("returns '' for empty array input", async () => {
    const { formatSignaturesForPrompt } = await import("../ast-analyzer");
    expect(formatSignaturesForPrompt([])).toBe("");
  });

  it("output never exceeds maxChars", async () => {
    const { formatSignaturesForPrompt } = await import("../ast-analyzer");
    const sigs: FileSignature[] = Array.from({ length: 20 }, (_, i) => ({
      path: `src/file${i}.ts`,
      exports: Array.from({ length: 5 }, (_, j) => `export function fn${j}(): void`),
      imports: [],
      types: [],
    }));
    const result = formatSignaturesForPrompt(sigs, 100);
    expect(result.length).toBeLessThanOrEqual(100);
  });

  it("sorts by exports.length descending", async () => {
    const { formatSignaturesForPrompt } = await import("../ast-analyzer");
    const sigs: FileSignature[] = [
      { path: "few.ts", exports: ["a"], imports: [], types: [] },
      { path: "many.ts", exports: ["a", "b", "c", "d", "e"], imports: [], types: [] },
      { path: "medium.ts", exports: ["a", "b", "c"], imports: [], types: [] },
    ];
    const result = formatSignaturesForPrompt(sigs, 5000);
    const manyIdx = result.indexOf("many.ts");
    const mediumIdx = result.indexOf("medium.ts");
    const fewIdx = result.indexOf("few.ts");
    expect(manyIdx).toBeLessThan(mediumIdx);
    expect(mediumIdx).toBeLessThan(fewIdx);
  });
});
