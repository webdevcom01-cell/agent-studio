/**
 * Obsidian Integration Adapter — Interface Stub
 *
 * Future integration point for persistent memory via Obsidian vault.
 * Implementation deferred until after ECC Phases 0-9 are complete.
 *
 * Architecture:
 *   - Obsidian vault on GitHub (Git-synced via Obsidian Git plugin)
 *   - GitMCP as bridge: exposes vault as MCP server
 *   - Write-back: agent learns → instinct → skill → Obsidian vault document
 */

export interface ObsidianConfig {
  vaultRepo: string;
  branch: string;
  basePath: string;
}

export interface ObsidianDocument {
  path: string;
  title: string;
  content: string;
  tags: string[];
  updatedAt: string;
}

export interface ObsidianAdapter {
  isConnected(): Promise<boolean>;
  readDocument(path: string): Promise<ObsidianDocument | null>;
  writeDocument(doc: ObsidianDocument): Promise<void>;
  searchDocuments(query: string): Promise<ObsidianDocument[]>;
  syncSkillToVault(skillSlug: string, content: string): Promise<string>;
}

export function createObsidianAdapter(
  _config: ObsidianConfig
): ObsidianAdapter {
  return {
    async isConnected(): Promise<boolean> {
      return false;
    },
    async readDocument(_path: string): Promise<ObsidianDocument | null> {
      return null;
    },
    async writeDocument(_doc: ObsidianDocument): Promise<void> {
      throw new Error("Obsidian adapter not implemented — deferred to post-ECC");
    },
    async searchDocuments(_query: string): Promise<ObsidianDocument[]> {
      return [];
    },
    async syncSkillToVault(
      _skillSlug: string,
      _content: string
    ): Promise<string> {
      throw new Error("Obsidian adapter not implemented — deferred to post-ECC");
    },
  };
}
