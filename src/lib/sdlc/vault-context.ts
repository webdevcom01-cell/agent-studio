/**
 * Vault Context Loader for SDLC Pipeline
 *
 * Reads key documents from the Obsidian vault (via GitHub API) and formats
 * them as structured context injected into every pipeline run.
 *
 * Documents loaded (in priority order):
 *   1. system/soma-rules  — core agent guidelines, always loaded
 *   2. shared/niche-glossary — domain terminology, always loaded
 *   3. instincts/          — learned patterns (up to MAX_INSTINCTS)
 *   4. skills/             — agent skills (up to MAX_SKILLS)
 *
 * Design principles:
 *   - NEVER blocks the pipeline — all errors caught silently
 *   - Cap total vault context at VAULT_CONTEXT_MAX_CHARS to avoid token bloat
 *   - Each document preview capped at DOC_PREVIEW_CHARS
 */

import { logger } from "@/lib/logger";

const DOC_PREVIEW_CHARS = 600;
const VAULT_CONTEXT_MAX_CHARS = 4_000;
const MAX_INSTINCTS = 5;
const MAX_SKILLS = 3;

/**
 * Load relevant vault documents and format them as a context block.
 * Returns null if vault is not configured or all reads fail.
 */
export async function loadVaultContext(
  taskDescription: string
): Promise<string | null> {
  try {
    const { isObsidianConfigured, createObsidianAdapter } = await import(
      "@/lib/ecc/obsidian-adapter"
    );
    if (!isObsidianConfigured()) return null;

    const adapter = createObsidianAdapter();
    const parts: string[] = [];

    // ── 1. Core system rules ────────────────────────────────────────────────
    const somaRules = await adapter.readDocument("system/soma-rules.md");
    if (somaRules?.content) {
      const preview = somaRules.content.slice(0, DOC_PREVIEW_CHARS);
      parts.push(
        `### Agent Guidelines (soma-rules)\n${preview}${somaRules.content.length > DOC_PREVIEW_CHARS ? "…" : ""}`
      );
    }

    // ── 2. Domain glossary ──────────────────────────────────────────────────
    const glossary = await adapter.readDocument("shared/niche-glossary.md");
    if (glossary?.content) {
      const preview = glossary.content.slice(0, DOC_PREVIEW_CHARS);
      parts.push(
        `### Domain Glossary\n${preview}${glossary.content.length > DOC_PREVIEW_CHARS ? "…" : ""}`
      );
    }

    // ── 3. Learned instincts ────────────────────────────────────────────────
    const instinctFiles = await adapter.listDocuments("instincts");
    if (instinctFiles.length > 0) {
      const instinctParts: string[] = [];
      for (const file of instinctFiles.slice(0, MAX_INSTINCTS)) {
        const doc = await adapter.readDocument(file.path);
        if (doc?.content) {
          instinctParts.push(
            `- **${doc.title}**: ${doc.content.slice(0, 200).replace(/\n+/g, " ")}`
          );
        }
      }
      if (instinctParts.length > 0) {
        parts.push(`### Learned Instincts\n${instinctParts.join("\n")}`);
      }
    }

    // ── 4. Skills ───────────────────────────────────────────────────────────
    const skillFiles = await adapter.listDocuments("skills");
    if (skillFiles.length > 0) {
      const skillParts: string[] = [];
      for (const file of skillFiles.slice(0, MAX_SKILLS)) {
        const doc = await adapter.readDocument(file.path);
        if (doc?.content) {
          skillParts.push(
            `- **${doc.title}**: ${doc.content.slice(0, 200).replace(/\n+/g, " ")}`
          );
        }
      }
      if (skillParts.length > 0) {
        parts.push(`### Agent Skills\n${skillParts.join("\n")}`);
      }
    }

    if (parts.length === 0) return null;

    const raw = `## 📚 Vault Knowledge Base\n\n${parts.join("\n\n")}`;

    // Hard cap to avoid token bloat
    if (raw.length > VAULT_CONTEXT_MAX_CHARS) {
      return raw.slice(0, VAULT_CONTEXT_MAX_CHARS) + "\n\n…[vault context truncated]";
    }

    logger.info("loadVaultContext: loaded vault context", {
      taskSnippet: taskDescription.slice(0, 60),
      charCount: raw.length,
      sections: parts.length,
    });

    return raw;
  } catch (err) {
    logger.warn("loadVaultContext: failed (non-blocking)", {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}
