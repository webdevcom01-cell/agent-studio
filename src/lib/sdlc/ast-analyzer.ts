import { existsSync } from "node:fs";
import { logger } from "@/lib/logger";

export interface FileSignature {
  path: string;
  exports: string[];
  imports: string[];
  types: string[];
}

const MAX_FILES = 100;
const MAX_EXPORTS = 10;
const MAX_IMPORTS = 20;
const MAX_TYPES = 5;

function resolveSourceRoot(): string {
  if (existsSync("/app/src")) return "/app/src";
  return `${process.cwd()}/src`;
}

export async function extractCodeSignatures(
  sourceDir?: string,
): Promise<FileSignature[]> {
  const dir = sourceDir ?? resolveSourceRoot();

  if (!existsSync(dir)) {
    logger.warn("ast-analyzer: source directory not found, skipping", { dir });
    return [];
  }

  try {
    const { Project } = await import("ts-morph");

    const project = new Project({
      skipAddingFilesFromTsConfig: true,
      skipFileDependencyResolution: true,
    });

    project.addSourceFilesAtPaths([
      `${dir}/**/*.ts`,
      `${dir}/**/*.tsx`,
      `!${dir}/generated/**`,
      `!${dir}/**/*.test.ts`,
      `!${dir}/**/*.spec.ts`,
      `!${dir}/**/__tests__/**`,
    ]);

    const sourceFiles = project.getSourceFiles().slice(0, MAX_FILES);
    const signatures: FileSignature[] = [];

    for (const sf of sourceFiles) {
      const relativePath = sf.getFilePath().replace(dir + "/", "");

      const exports: string[] = [];
      for (const decl of sf.getExportedDeclarations().values()) {
        for (const d of decl) {
          const text = d.getText().split("\n")[0].slice(0, 120);
          if (exports.length < MAX_EXPORTS) exports.push(text);
        }
      }

      const imports: string[] = [];
      for (const imp of sf.getImportDeclarations()) {
        const mod = imp.getModuleSpecifierValue();
        if (!mod.startsWith(".") && imports.length < MAX_IMPORTS) {
          imports.push(imp.getText().split("\n")[0].slice(0, 120));
        }
      }

      const types: string[] = [];
      for (const iface of sf.getInterfaces()) {
        if (types.length < MAX_TYPES) {
          types.push(`interface ${iface.getName()} { ... }`);
        }
      }
      for (const ta of sf.getTypeAliases()) {
        if (types.length < MAX_TYPES) {
          types.push(`type ${ta.getName()} = ...`);
        }
      }

      signatures.push({ path: relativePath, exports, imports, types });
    }

    return signatures;
  } catch (err) {
    logger.warn("ast-analyzer: extraction failed, returning empty", {
      dir,
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

export function formatSignaturesForPrompt(
  signatures: FileSignature[],
  maxChars = 3000,
): string {
  if (signatures.length === 0) return "";

  const sorted = [...signatures].sort(
    (a, b) => b.exports.length - a.exports.length,
  );

  const lines: string[] = ["## Existing Codebase API Surface"];
  let charCount = lines[0].length + 1;

  for (const sig of sorted) {
    const parts: string[] = [`### ${sig.path}`];
    if (sig.exports.length > 0) {
      parts.push("**Exports:**");
      sig.exports.forEach((e) => parts.push(`  ${e}`));
    }
    if (sig.types.length > 0) {
      parts.push("**Types:**");
      sig.types.forEach((t) => parts.push(`  ${t}`));
    }
    if (sig.imports.length > 0) {
      parts.push("**Imports:**");
      sig.imports.forEach((i) => parts.push(`  ${i}`));
    }
    const block = parts.join("\n") + "\n";

    if (charCount + block.length > maxChars) break;
    lines.push(block);
    charCount += block.length;
  }

  const result = lines.join("\n");
  return result.slice(0, maxChars);
}
