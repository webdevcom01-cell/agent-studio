/**
 * Auto-fix engine for common AI generation errors (F3).
 *
 * Runs after the implement phase to correct known hallucinations:
 * - Python: mcp.Server() → FastMCP, adds missing FastMCP import
 * - TypeScript: server.tool() → server.registerTool(), adds .js extensions to local imports
 *
 * Fixes are applied deterministically — no AI call needed.
 * Returns the corrected files and a log of all applied fixes.
 */

import { logger } from "@/lib/logger";

type GeneratedFiles = Record<string, string>;

interface FixResult {
  files: GeneratedFiles;
  fixes: string[];
}

/**
 * Fix Python FastMCP patterns in server.py and bridge.py.
 */
function fixPythonFiles(files: GeneratedFiles): FixResult {
  const fixes: string[] = [];
  const fixed = { ...files };

  if (fixed["server.py"]) {
    let content = fixed["server.py"];
    let changed = false;

    // Fix wrong import: from mcp import Server → from mcp.server.fastmcp import FastMCP
    if (content.includes("from mcp import Server")) {
      content = content.replace(/from mcp import Server/g, "from mcp.server.fastmcp import FastMCP");
      fixes.push("server.py: Replaced `from mcp import Server` with FastMCP import");
      changed = true;
    }

    // Fix wrong instantiation: mcp.Server() or Server() → FastMCP()
    if (content.includes("mcp.Server()") || content.includes("= Server()")) {
      content = content
        .replace(/mcp\.Server\(\)/g, "FastMCP()")
        .replace(/= Server\(\)/g, "= FastMCP()");
      fixes.push("server.py: Replaced mcp.Server() with FastMCP()");
      changed = true;
    }

    // Ensure FastMCP is imported if it's used but not imported
    if (
      content.includes("FastMCP") &&
      !content.includes("from mcp.server.fastmcp import FastMCP")
    ) {
      content = `from mcp.server.fastmcp import FastMCP\n` + content;
      fixes.push("server.py: Added missing FastMCP import");
      changed = true;
    }

    if (changed) {
      fixed["server.py"] = content;
    }
  }

  return { files: fixed, fixes };
}

/**
 * Fix TypeScript MCP SDK patterns across all .ts files (not .test.ts).
 */
function fixTypeScriptFiles(files: GeneratedFiles): FixResult {
  const fixes: string[] = [];
  const fixed = { ...files };

  for (const [filename, content] of Object.entries(fixed)) {
    if (!filename.endsWith(".ts") || filename.endsWith(".test.ts")) continue;

    let updated = content;
    let changed = false;

    // Fix deprecated server.tool() → server.registerTool()
    if (updated.includes("server.tool(")) {
      updated = updated.replace(/server\.tool\(/g, "server.registerTool(");
      fixes.push(`${filename}: Replaced deprecated server.tool() with server.registerTool()`);
      changed = true;
    }

    // Fix local imports missing .js ESM extension
    const fixedImports = updated.replace(
      /from\s+(['"])(\.\/[^'"]+)(['"])/g,
      (match, q1: string, importPath: string, q2: string) => {
        // Skip if already has an extension (e.g. .js, .ts, .json)
        if (/\.\w{1,5}$/.test(importPath)) return match;
        return `from ${q1}${importPath}.js${q2}`;
      },
    );
    if (fixedImports !== updated) {
      updated = fixedImports;
      fixes.push(`${filename}: Added .js extensions to local ESM imports`);
      changed = true;
    }

    if (changed) {
      fixed[filename] = updated;
    }
  }

  return { files: fixed, fixes };
}

/**
 * Apply all auto-fixes to generated files.
 * Python and TypeScript fixes are both applied (one set is usually a no-op).
 */
export function applyAutoFixes(
  files: GeneratedFiles,
  target: "python" | "typescript",
): FixResult {
  let currentFiles = { ...files };
  const allFixes: string[] = [];

  const pythonResult = fixPythonFiles(currentFiles);
  currentFiles = pythonResult.files;
  allFixes.push(...pythonResult.fixes);

  if (target === "typescript") {
    const tsResult = fixTypeScriptFiles(currentFiles);
    currentFiles = tsResult.files;
    allFixes.push(...tsResult.fixes);
  }

  if (allFixes.length > 0) {
    logger.info("Auto-fix applied corrections", { target, fixCount: allFixes.length, fixes: allFixes });
  }

  return { files: currentFiles, fixes: allFixes };
}
