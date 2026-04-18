import { createHash } from "node:crypto";
import { existsSync, statSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { cacheGet, cacheSet } from "@/lib/redis";
import { logger } from "@/lib/logger";

export interface ImportGraph {
  adjacency: Map<string, string[]>;
  builtAt: number;
}

const GRAPH_CACHE_TTL = 1800; // 30 minutes

function resolveSourceRoot(): string {
  if (existsSync("/app/src")) return "/app/src";
  return join(process.cwd(), "src");
}

function buildManifestHash(sourceDir: string): string {
  const files: string[] = [];
  function walk(dir: string) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
        files.push(`${full}:${statSync(full).mtimeMs}`);
      }
    }
  }
  try { walk(sourceDir); } catch { return "empty"; }
  return createHash("sha256").update(files.sort().join("\n")).digest("hex").slice(0, 16);
}

export async function buildImportGraph(sourceDir?: string): Promise<ImportGraph> {
  const dir = sourceDir ?? resolveSourceRoot();
  try {
    const { Project } = await import("ts-morph");
    const project = new Project({
      tsConfigFilePath: join(process.cwd(), "tsconfig.json"),
      skipFileDependencyResolution: false,
      skipAddingFilesFromTsConfig: true,
    });
    project.addSourceFilesAtPaths([`${dir}/**/*.ts`, `${dir}/**/*.tsx`]);
    project.resolveSourceFileDependencies();
    const adjacency = new Map<string, string[]>();
    for (const sf of project.getSourceFiles()) {
      const deps = sf.getReferencedSourceFiles().map((r) => r.getFilePath());
      adjacency.set(sf.getFilePath(), deps);
    }
    return { adjacency, builtAt: Date.now() };
  } catch (err) {
    logger.warn("buildImportGraph failed, returning empty graph", {
      error: err instanceof Error ? err.message : String(err),
    });
    return { adjacency: new Map(), builtAt: 0 };
  }
}

export async function getCachedImportGraph(agentId: string, sourceDir?: string): Promise<ImportGraph> {
  const dir = sourceDir ?? resolveSourceRoot();
  const manifestHash = buildManifestHash(dir);
  const cacheKey = `import-graph:${agentId}:${manifestHash}`;
  try {
    const cached = await cacheGet(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached) as [string, string[]][];
      return { adjacency: new Map(parsed), builtAt: Date.now() };
    }
  } catch { /* fall through to rebuild */ }
  const graph = await buildImportGraph(dir);
  try {
    const serialized = JSON.stringify(Array.from(graph.adjacency.entries()));
    await cacheSet(cacheKey, serialized, GRAPH_CACHE_TTL);
  } catch { /* best-effort cache */ }
  return graph;
}

export function getBlastRadius(
  seedFiles: string[],
  graph: ImportGraph,
  maxDepth = 2,
): string[] {
  const visited = new Set<string>();
  const queue: Array<{ file: string; depth: number }> = seedFiles.map((f) => ({ file: f, depth: 0 }));
  while (queue.length > 0) {
    const item = queue.shift()!;
    if (visited.has(item.file) || item.depth > maxDepth) continue;
    visited.add(item.file);
    const deps = graph.adjacency.get(item.file) ?? [];
    for (const dep of deps) {
      if (!visited.has(dep)) queue.push({ file: dep, depth: item.depth + 1 });
    }
  }
  return Array.from(visited).filter((f) => !seedFiles.includes(f));
}

export function identifyAffectedFiles(
  taskDescription: string,
  graph: ImportGraph,
): string[] {
  const lower = taskDescription.toLowerCase();
  const keywords = lower.split(/\s+/).filter((w) => w.length > 3);
  const seeds: string[] = [];
  for (const filePath of graph.adjacency.keys()) {
    if (keywords.some((kw) => filePath.toLowerCase().includes(kw))) {
      seeds.push(filePath);
    }
  }
  return getBlastRadius(seeds, graph, 2);
}

export async function buildBlastRadiusContext(
  affectedFiles: string[],
  maxFiles = 5,
  maxCharsPerFile = 800,
): Promise<string> {
  const { readFileSync } = await import("node:fs");
  const parts: string[] = [];
  const files = affectedFiles.slice(0, maxFiles);
  for (const f of files) {
    try {
      const content = readFileSync(f, "utf-8").slice(0, maxCharsPerFile);
      parts.push(`### ${f}\n\`\`\`typescript\n${content}\n\`\`\``);
    } catch { /* skip unreadable files */ }
  }
  return parts.length > 0
    ? `## Blast Radius (${files.length} affected files)\n\n${parts.join("\n\n")}`
    : "";
}
