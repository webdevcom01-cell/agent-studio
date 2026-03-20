/**
 * Obsidian Vault Integration via GitHub API (P4-T4)
 *
 * Uses a GitHub repository as the Obsidian vault storage backend.
 * Git-synced via Obsidian Git plugin on the user side; we read/write
 * via GitHub Contents API (no Git CLI dependency).
 *
 * Architecture:
 *   - GitHub repo as vault storage (OBSIDIAN_VAULT_REPO env var)
 *   - GitHub personal access token for API auth (OBSIDIAN_GITHUB_TOKEN)
 *   - Write-back: agent instincts/skills → vault markdown documents
 *   - Bi-directional: vault → KB ingest, KB skills → vault sync
 *   - GitMCP bridge: repo URL can be used as MCP server via gitmcp.io
 */

import { logger } from "@/lib/logger";

const GITHUB_API = "https://api.github.com";
const REQUEST_TIMEOUT_MS = 10_000;

export interface ObsidianConfig {
  /** GitHub repo in "owner/repo" format */
  vaultRepo: string;
  /** Branch to read/write (default: "main") */
  branch: string;
  /** Base path within the repo for vault content (default: "") */
  basePath: string;
  /** GitHub personal access token */
  githubToken: string;
}

export interface ObsidianDocument {
  path: string;
  title: string;
  content: string;
  tags: string[];
  updatedAt: string;
  sha?: string;
}

export interface ObsidianAdapter {
  isConnected(): Promise<boolean>;
  readDocument(path: string): Promise<ObsidianDocument | null>;
  writeDocument(doc: ObsidianDocument): Promise<void>;
  listDocuments(directory?: string): Promise<{ path: string; name: string }[]>;
  searchDocuments(query: string): Promise<ObsidianDocument[]>;
  syncSkillToVault(skillSlug: string, content: string, tags?: string[]): Promise<string>;
  syncInstinctToVault(instinctName: string, description: string, confidence: number): Promise<string>;
  getGitMCPUrl(): string;
}

function resolveConfig(): ObsidianConfig | null {
  const repo = process.env.OBSIDIAN_VAULT_REPO;
  const token = process.env.OBSIDIAN_GITHUB_TOKEN;
  if (!repo || !token) return null;

  return {
    vaultRepo: repo,
    branch: process.env.OBSIDIAN_VAULT_BRANCH ?? "main",
    basePath: process.env.OBSIDIAN_VAULT_PATH ?? "",
    githubToken: token,
  };
}

function buildPath(config: ObsidianConfig, relativePath: string): string {
  const base = config.basePath.replace(/^\/|\/$/g, "");
  const rel = relativePath.replace(/^\//, "");
  return base ? `${base}/${rel}` : rel;
}

function extractFrontmatter(content: string): { tags: string[]; title: string; body: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) {
    const title = content.match(/^#\s+(.+)/)?.[1] ?? "";
    return { tags: [], title, body: content };
  }

  const frontmatter = match[1];
  const body = match[2];
  const tags: string[] = [];
  const tagMatch = frontmatter.match(/tags:\s*\[([^\]]*)\]/);
  if (tagMatch) {
    tags.push(...tagMatch[1].split(",").map((t) => t.trim().replace(/["']/g, "")).filter(Boolean));
  }
  const title = frontmatter.match(/title:\s*["']?([^"'\n]+)/)?.[1] ?? "";

  return { tags, title, body };
}

function buildFrontmatter(title: string, tags: string[]): string {
  const tagStr = tags.map((t) => `"${t}"`).join(", ");
  return `---\ntitle: "${title}"\ntags: [${tagStr}]\nupdated: "${new Date().toISOString()}"\n---\n\n`;
}

async function githubRequest(
  config: ObsidianConfig,
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const url = `${GITHUB_API}/repos/${config.vaultRepo}/contents/${path}`;
  return fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${config.githubToken}`,
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "agent-studio",
      ...((options.headers as Record<string, string>) ?? {}),
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
}

export function createObsidianAdapter(
  configOverride?: ObsidianConfig
): ObsidianAdapter {
  const config = configOverride ?? resolveConfig();

  return {
    async isConnected(): Promise<boolean> {
      if (!config) return false;
      try {
        const res = await fetch(`${GITHUB_API}/repos/${config.vaultRepo}`, {
          headers: {
            Authorization: `Bearer ${config.githubToken}`,
            Accept: "application/vnd.github.v3+json",
            "User-Agent": "agent-studio",
          },
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        return res.ok;
      } catch {
        return false;
      }
    },

    async readDocument(relativePath: string): Promise<ObsidianDocument | null> {
      if (!config) return null;
      try {
        const fullPath = buildPath(config, relativePath);
        const res = await githubRequest(config, `${fullPath}?ref=${config.branch}`);
        if (!res.ok) return null;

        const data = (await res.json()) as { content?: string; sha?: string; name?: string };
        if (!data.content) return null;

        const decoded = Buffer.from(data.content, "base64").toString("utf-8");
        const { tags, title, body } = extractFrontmatter(decoded);

        return {
          path: fullPath,
          title: title || (data.name ?? relativePath).replace(/\.md$/, ""),
          content: body,
          tags,
          updatedAt: new Date().toISOString(),
          sha: data.sha,
        };
      } catch (err) {
        logger.warn("Obsidian readDocument failed", {
          path: relativePath,
          error: err instanceof Error ? err.message : String(err),
        });
        return null;
      }
    },

    async writeDocument(doc: ObsidianDocument): Promise<void> {
      if (!config) throw new Error("Obsidian vault not configured");

      const fullPath = buildPath(config, doc.path);
      const frontmatter = buildFrontmatter(doc.title, doc.tags);
      const fileContent = `${frontmatter}${doc.content}`;
      const encoded = Buffer.from(fileContent).toString("base64");

      // Check if file exists to get SHA for update
      let sha: string | undefined = doc.sha;
      if (!sha) {
        try {
          const existing = await githubRequest(config, `${fullPath}?ref=${config.branch}`);
          if (existing.ok) {
            const data = (await existing.json()) as { sha?: string };
            sha = data.sha;
          }
        } catch {
          // File doesn't exist — create new
        }
      }

      const body: Record<string, string> = {
        message: `docs: update ${doc.title}`,
        content: encoded,
        branch: config.branch,
      };
      if (sha) {
        body.sha = sha;
      }

      const res = await githubRequest(config, fullPath, {
        method: "PUT",
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const error = await res.text();
        throw new Error(`GitHub API error (${res.status}): ${error.slice(0, 200)}`);
      }

      logger.info("Obsidian document written", { path: fullPath, title: doc.title });
    },

    async listDocuments(directory?: string): Promise<{ path: string; name: string }[]> {
      if (!config) return [];
      try {
        const dirPath = buildPath(config, directory ?? "");
        const res = await githubRequest(config, `${dirPath}?ref=${config.branch}`);
        if (!res.ok) return [];

        const items = (await res.json()) as { path: string; name: string; type: string }[];
        if (!Array.isArray(items)) return [];

        return items
          .filter((item) => item.type === "file" && item.name.endsWith(".md"))
          .map((item) => ({ path: item.path, name: item.name }));
      } catch {
        return [];
      }
    },

    async searchDocuments(query: string): Promise<ObsidianDocument[]> {
      if (!config) return [];
      try {
        const searchQuery = `${query} repo:${config.vaultRepo} path:${config.basePath || "/"} extension:md`;
        const res = await fetch(
          `${GITHUB_API}/search/code?q=${encodeURIComponent(searchQuery)}&per_page=10`,
          {
            headers: {
              Authorization: `Bearer ${config.githubToken}`,
              Accept: "application/vnd.github.v3+json",
              "User-Agent": "agent-studio",
            },
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
          }
        );

        if (!res.ok) return [];

        const data = (await res.json()) as {
          items?: { path: string; name: string }[];
        };

        const docs: ObsidianDocument[] = [];
        for (const item of data.items ?? []) {
          const doc = await this.readDocument(item.path);
          if (doc) docs.push(doc);
        }
        return docs;
      } catch {
        return [];
      }
    },

    async syncSkillToVault(
      skillSlug: string,
      content: string,
      tags: string[] = []
    ): Promise<string> {
      const path = `skills/${skillSlug}.md`;
      const title = skillSlug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

      await this.writeDocument({
        path,
        title,
        content,
        tags: ["skill", "auto-synced", ...tags],
        updatedAt: new Date().toISOString(),
      });

      return path;
    },

    async syncInstinctToVault(
      instinctName: string,
      description: string,
      confidence: number
    ): Promise<string> {
      const slug = instinctName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const path = `instincts/${slug}.md`;

      const content = `# ${instinctName}\n\n${description}\n\n**Confidence:** ${confidence.toFixed(2)}\n**Updated:** ${new Date().toISOString()}\n`;

      await this.writeDocument({
        path,
        title: instinctName,
        content,
        tags: ["instinct", `confidence-${Math.floor(confidence * 100)}`],
        updatedAt: new Date().toISOString(),
      });

      return path;
    },

    getGitMCPUrl(): string {
      if (!config) return "";
      return `https://gitmcp.io/${config.vaultRepo}`;
    },
  };
}

/**
 * Checks if Obsidian vault integration is configured.
 */
export function isObsidianConfigured(): boolean {
  return !!process.env.OBSIDIAN_VAULT_REPO && !!process.env.OBSIDIAN_GITHUB_TOKEN;
}
