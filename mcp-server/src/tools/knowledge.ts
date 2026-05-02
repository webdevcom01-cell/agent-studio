/**
 * tools/knowledge.ts — Tools for managing and querying Agent Studio knowledge bases.
 *
 * Tools:
 *   as_list_knowledge_bases      — list KB(s) for an agent with doc counts and status
 *   as_search_knowledge_base     — hybrid-search a KB by query string
 *   as_add_kb_document           — add a URL source to a KB (triggers async ingest)
 *   as_add_kb_text               — add raw text to a KB (triggers async ingest)
 *   as_get_kb_embedding_status   — check per-document or aggregate embedding progress
 *
 * Read-only tools (list, status) use direct DB queries.
 * Mutating / search tools use the REST API (requires AGENT_STUDIO_URL + AGENT_STUDIO_API_KEY).
 * The API key must be passed via the x-api-key header; it must belong to a user
 * who owns the target agent.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { query, queryOne } from "../db.js";

// ── Types ────────────────────────────────────────────────────────────────────

interface KbRow {
  id: string;
  name: string;
  agentId: string;
  agentName: string;
  createdAt: string;
  documentCount: string;
  readyCount: string;
  pendingCount: string;
  failedCount: string;
  processingCount: string;
}

interface SourceRow {
  id: string;
  name: string;
  status: string;
  errorMsg: string | null;
  charCount: number;
  createdAt: string;
  updatedAt: string;
}

interface SourceStatusSummaryRow {
  status: string;
  count: string;
}

interface EnvConfig {
  studioUrl: string;
  apiKey: string;
}

interface ApiSuccess<T> {
  success: true;
  data: T;
}

interface ApiError {
  success: false;
  error: string;
}

type ApiResponse<T> = ApiSuccess<T> | ApiError;

interface AddedSource {
  id: string;
  status: string;
  name: string;
}

interface SearchResultItem {
  chunkId: string;
  content: string;
  relevanceScore: number;
  sourceDocument: string | null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function getEnvConfig(): EnvConfig | { error: string } {
  const studioUrl = process.env.AGENT_STUDIO_URL;
  const apiKey = process.env.AGENT_STUDIO_API_KEY;

  if (!studioUrl && !apiKey) {
    return {
      error:
        "Missing AGENT_STUDIO_URL and AGENT_STUDIO_API_KEY.\n" +
        "  AGENT_STUDIO_URL     — your Agent Studio app URL\n" +
        "  AGENT_STUDIO_API_KEY — API key from <your-app>/api/api-keys",
    };
  }
  if (!studioUrl) {
    return { error: "AGENT_STUDIO_URL is not set." };
  }
  if (!apiKey) {
    return { error: "AGENT_STUDIO_API_KEY is not set." };
  }
  return { studioUrl: studioUrl.replace(/\/$/, ""), apiKey };
}

async function resolveKbAgent(kbId: string): Promise<{ agentId: string } | null> {
  return queryOne<{ agentId: string }>(
    `SELECT "agentId" FROM "KnowledgeBase" WHERE id = $1`,
    [kbId]
  );
}

function deriveEmbeddingStatus(counts: {
  total: number;
  ready: number;
  pending: number;
  failed: number;
  processing: number;
}): string {
  if (counts.total === 0) return "empty";
  if (counts.failed > 0 && counts.ready === 0 && counts.pending === 0 && counts.processing === 0) return "failed";
  if (counts.failed > 0) return "partial_failure";
  if (counts.processing > 0 || counts.pending > 0) return "processing";
  return "ready";
}

async function restPost<TResponse>(
  config: EnvConfig,
  path: string,
  body: Record<string, unknown>
): Promise<{ ok: true; data: TResponse } | { ok: false; error: string }> {
  let response: Response;
  try {
    response = await fetch(`${config.studioUrl}${path}`, {
      method: "POST",
      headers: {
        "x-api-key": config.apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    return {
      ok: false,
      error: `Request failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const text = await response.text().catch(() => "");
  if (!response.ok) {
    return { ok: false, error: `HTTP ${response.status}: ${text.slice(0, 400)}` };
  }

  try {
    const parsed = JSON.parse(text) as ApiResponse<TResponse>;
    if (!parsed.success) {
      return { ok: false, error: parsed.error ?? "Unknown API error" };
    }
    return { ok: true, data: parsed.data };
  } catch {
    return { ok: false, error: `Invalid JSON response: ${text.slice(0, 200)}` };
  }
}

// ── Tool registration ─────────────────────────────────────────────────────────

export function registerKnowledgeTools(server: McpServer): void {

  // ── as_list_knowledge_bases ───────────────────────────────────────────────
  server.registerTool(
    "as_list_knowledge_bases",
    {
      title: "List Knowledge Bases",
      description: `List knowledge bases for an agent (by name or ID), including document counts and embedding status.

Each agent has at most one knowledge base. Returns id, name, document counts broken down
by embedding status (ready/pending/processing/failed), an overall embeddingStatus summary,
and createdAt.

embeddingStatus values: empty | processing | ready | partial_failure | failed`,
      inputSchema: {
        agent_name: z.string().optional()
          .describe("Partial agent name — case-insensitive ILIKE match."),
        agent_id: z.string().optional()
          .describe("Exact agent ID (cuid)."),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ agent_name, agent_id }) => {
      if (!agent_name && !agent_id) {
        return { content: [{ type: "text", text: "Error: provide agent_name or agent_id." }] };
      }

      const conditions: string[] = [];
      const params: unknown[] = [];

      if (agent_id) {
        params.push(agent_id);
        conditions.push(`a.id = $${params.length}`);
      } else if (agent_name) {
        params.push(`%${agent_name}%`);
        conditions.push(`a.name ILIKE $${params.length}`);
      }

      const rows = await query<KbRow>(
        `SELECT
           kb.id,
           kb.name,
           kb."agentId",
           a.name AS "agentName",
           kb."createdAt",
           COUNT(s.id)                                            AS "documentCount",
           COUNT(s.id) FILTER (WHERE s.status = 'READY')         AS "readyCount",
           COUNT(s.id) FILTER (WHERE s.status = 'PENDING')       AS "pendingCount",
           COUNT(s.id) FILTER (WHERE s.status = 'PROCESSING')    AS "processingCount",
           COUNT(s.id) FILTER (WHERE s.status = 'FAILED')        AS "failedCount"
         FROM "KnowledgeBase" kb
         JOIN "Agent" a ON a.id = kb."agentId"
         LEFT JOIN "KBSource" s ON s."knowledgeBaseId" = kb.id
         WHERE ${conditions.join(" AND ")}
         GROUP BY kb.id, kb.name, kb."agentId", a.name, kb."createdAt"
         ORDER BY kb."createdAt" DESC`,
        params
      );

      const bases = rows.map((r) => {
        const total = Number(r.documentCount);
        const ready = Number(r.readyCount);
        const pending = Number(r.pendingCount);
        const failed = Number(r.failedCount);
        const processing = Number(r.processingCount);
        return {
          id: r.id,
          name: r.name,
          agentId: r.agentId,
          agentName: r.agentName,
          documentCount: total,
          embeddingStatus: deriveEmbeddingStatus({ total, ready, pending, failed, processing }),
          statusBreakdown: { ready, pending, processing, failed },
          createdAt: r.createdAt,
        };
      });

      return {
        content: [{ type: "text", text: JSON.stringify(bases, null, 2) }],
        structuredContent: { bases, count: bases.length },
      };
    }
  );

  // ── as_search_knowledge_base ──────────────────────────────────────────────
  server.registerTool(
    "as_search_knowledge_base",
    {
      title: "Search Knowledge Base",
      description: `Hybrid-search a knowledge base by query string.

Provide the kb_id (KnowledgeBase.id) and a natural-language query. Uses the Agent Studio
hybrid search endpoint (semantic + BM25 fusion). Returns up to top_k results with content,
relevance score, and source document name.

Requires env vars: AGENT_STUDIO_URL and AGENT_STUDIO_API_KEY.`,
      inputSchema: {
        kb_id: z.string()
          .describe("Knowledge base ID (KnowledgeBase.id, a cuid)."),
        query: z.string().min(1)
          .describe("Search query string."),
        top_k: z.number().int().min(1).max(20).default(5)
          .describe("Number of results to return (default 5, max 20)."),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async ({ kb_id, query: searchQuery, top_k }) => {
      const config = getEnvConfig();
      if ("error" in config) {
        return { content: [{ type: "text", text: `Configuration error: ${config.error}` }] };
      }

      const kb = await resolveKbAgent(kb_id);
      if (!kb) {
        return { content: [{ type: "text", text: `Knowledge base not found: ${kb_id}` }] };
      }

      const result = await restPost<SearchResultItem[]>(
        config,
        `/api/agents/${kb.agentId}/knowledge/search`,
        { query: searchQuery, topK: top_k }
      );

      if (!result.ok) {
        return { content: [{ type: "text", text: `Search failed: ${result.error}` }] };
      }

      const results = (result.data ?? []).map((r) => ({
        content: r.content,
        score: r.relevanceScore,
        sourceTitle: r.sourceDocument ?? null,
      }));

      return {
        content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
        structuredContent: { results, count: results.length, kbId: kb_id },
      };
    }
  );

  // ── as_add_kb_document ────────────────────────────────────────────────────
  server.registerTool(
    "as_add_kb_document",
    {
      title: "Add KB Document (URL)",
      description: `Add a URL source to a knowledge base. The document will be fetched and embedded asynchronously.

Provide kb_id and a public URL (http/https). An optional title overrides the default name.
Returns the new source ID and its initial status (PENDING).

Requires env vars: AGENT_STUDIO_URL and AGENT_STUDIO_API_KEY.`,
      inputSchema: {
        kb_id: z.string()
          .describe("Knowledge base ID (KnowledgeBase.id, a cuid)."),
        url: z.string().url()
          .describe("Public URL to fetch and ingest."),
        title: z.string().optional()
          .describe("Optional display name for this source."),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async ({ kb_id, url, title }) => {
      const config = getEnvConfig();
      if ("error" in config) {
        return { content: [{ type: "text", text: `Configuration error: ${config.error}` }] };
      }

      const kb = await resolveKbAgent(kb_id);
      if (!kb) {
        return { content: [{ type: "text", text: `Knowledge base not found: ${kb_id}` }] };
      }

      const result = await restPost<AddedSource>(
        config,
        `/api/agents/${kb.agentId}/knowledge/sources`,
        { type: "URL", name: title ?? url, url }
      );

      if (!result.ok) {
        return { content: [{ type: "text", text: `Failed to add document: ${result.error}` }] };
      }

      const out = {
        documentId: result.data.id,
        status: result.data.status,
        message: "Document queued for ingest. Use as_get_kb_embedding_status to track progress.",
      };

      return {
        content: [{ type: "text", text: JSON.stringify(out, null, 2) }],
        structuredContent: out,
      };
    }
  );

  // ── as_add_kb_text ────────────────────────────────────────────────────────
  server.registerTool(
    "as_add_kb_text",
    {
      title: "Add KB Text",
      description: `Add raw text content to a knowledge base. The text will be chunked and embedded asynchronously.

Provide kb_id, the text content, and a title. Metadata is accepted but not currently stored
by the ingest pipeline — use title to carry identifying information instead.

Returns the new source ID and its initial status (PENDING).

Requires env vars: AGENT_STUDIO_URL and AGENT_STUDIO_API_KEY.`,
      inputSchema: {
        kb_id: z.string()
          .describe("Knowledge base ID (KnowledgeBase.id, a cuid)."),
        text: z.string().min(1)
          .describe("Text content to ingest."),
        title: z.string().min(1)
          .describe("Display name for this text source."),
        metadata: z.record(z.unknown()).optional()
          .describe("Advisory metadata (not stored by current ingest pipeline)."),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async ({ kb_id, text, title }) => {
      const config = getEnvConfig();
      if ("error" in config) {
        return { content: [{ type: "text", text: `Configuration error: ${config.error}` }] };
      }

      const kb = await resolveKbAgent(kb_id);
      if (!kb) {
        return { content: [{ type: "text", text: `Knowledge base not found: ${kb_id}` }] };
      }

      const result = await restPost<AddedSource>(
        config,
        `/api/agents/${kb.agentId}/knowledge/sources`,
        { type: "TEXT", name: title, content: text }
      );

      if (!result.ok) {
        return { content: [{ type: "text", text: `Failed to add text: ${result.error}` }] };
      }

      const out = {
        documentId: result.data.id,
        status: result.data.status,
        message: "Text queued for ingest. Use as_get_kb_embedding_status to track progress.",
      };

      return {
        content: [{ type: "text", text: JSON.stringify(out, null, 2) }],
        structuredContent: out,
      };
    }
  );

  // ── as_get_kb_embedding_status ────────────────────────────────────────────
  server.registerTool(
    "as_get_kb_embedding_status",
    {
      title: "Get KB Embedding Status",
      description: `Check embedding progress for a knowledge base or a specific document.

If document_id is provided: returns status, error, and character count for that KBSource.
If omitted: returns aggregate counts across all sources in the KB (total, ready, pending,
processing, failed) plus an overall embeddingStatus summary.

embeddingStatus values: empty | processing | ready | partial_failure | failed`,
      inputSchema: {
        kb_id: z.string()
          .describe("Knowledge base ID (KnowledgeBase.id, a cuid)."),
        document_id: z.string().optional()
          .describe("Optional KBSource.id — omit for KB-level aggregate."),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ kb_id, document_id }) => {
      if (document_id) {
        const row = await queryOne<SourceRow>(
          `SELECT id, name, status, "errorMsg", "charCount", "createdAt", "updatedAt"
           FROM "KBSource"
           WHERE id = $1 AND "knowledgeBaseId" = $2`,
          [document_id, kb_id]
        );

        if (!row) {
          return {
            content: [{
              type: "text",
              text: `Document not found: id=${document_id} in kb=${kb_id}`,
            }],
          };
        }

        const out = {
          documentId: row.id,
          name: row.name,
          status: row.status,
          charCount: row.charCount,
          errorMsg: row.errorMsg ?? null,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        };

        return {
          content: [{ type: "text", text: JSON.stringify(out, null, 2) }],
          structuredContent: out,
        };
      }

      const rows = await query<SourceStatusSummaryRow>(
        `SELECT status, COUNT(*) AS count
         FROM "KBSource"
         WHERE "knowledgeBaseId" = $1
         GROUP BY status`,
        [kb_id]
      );

      const counts = { total: 0, ready: 0, pending: 0, processing: 0, failed: 0 };
      for (const r of rows) {
        const n = Number(r.count);
        counts.total += n;
        const key = r.status.toLowerCase() as keyof typeof counts;
        if (key in counts) counts[key] = n;
      }

      const out = {
        kbId: kb_id,
        embeddingStatus: deriveEmbeddingStatus(counts),
        counts,
      };

      return {
        content: [{ type: "text", text: JSON.stringify(out, null, 2) }],
        structuredContent: out,
      };
    }
  );
}
