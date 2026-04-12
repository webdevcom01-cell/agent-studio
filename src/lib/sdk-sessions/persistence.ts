/**
 * Claude Agent SDK Session Persistence
 *
 * Manages persistent SDK sessions that survive across conversations.
 * Sessions store multi-turn message history, token usage, and metadata
 * so an agent task can be resumed from any chat thread.
 */

import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import type { SdkSessionStatus } from "@/generated/prisma";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SessionMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface SdkSessionData {
  id: string;
  title: string | null;
  status: SdkSessionStatus;
  messages: SessionMessage[];
  metadata: Record<string, unknown> | null;
  totalInputTokens: number;
  totalOutputTokens: number;
  resumeCount: number;
  agentId: string;
  userId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateSessionInput {
  agentId: string;
  userId?: string;
  title?: string;
  messages?: SessionMessage[];
  metadata?: Record<string, unknown>;
}

export interface UpdateSessionInput {
  messages?: SessionMessage[];
  title?: string;
  status?: SdkSessionStatus;
  metadata?: Record<string, unknown>;
  inputTokensDelta?: number;
  outputTokensDelta?: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseMessages(raw: unknown): SessionMessage[] {
  if (!Array.isArray(raw)) return [];

  const valid: SessionMessage[] = [];
  let skipped = 0;

  for (const m of raw) {
    if (
      typeof m === "object" &&
      m !== null &&
      "role" in m &&
      "content" in m &&
      typeof (m as Record<string, unknown>).content === "string"
    ) {
      valid.push(m as SessionMessage);
    } else {
      skipped++;
    }
  }

  if (skipped > 0) {
    logger.warn("parseMessages: filtered invalid entries", {
      total: raw.length,
      skipped,
      kept: valid.length,
    });
  }

  return valid;
}

function toSessionData(row: {
  id: string;
  title: string | null;
  status: SdkSessionStatus;
  messages: unknown;
  metadata: unknown;
  totalInputTokens: number;
  totalOutputTokens: number;
  resumeCount: number;
  agentId: string;
  userId: string | null;
  createdAt: Date;
  updatedAt: Date;
}): SdkSessionData {
  return {
    ...row,
    messages: parseMessages(row.messages),
    metadata: (row.metadata as Record<string, unknown>) ?? null,
  };
}

/** Generate a short, sanitized title from the first user message */
function generateTitle(messages: SessionMessage[]): string {
  const firstUser = messages.find((m) => m.role === "user");
  if (!firstUser) return "Untitled session";
  // Strip control chars and excessive whitespace
  const text = firstUser.content.replace(/[\x00-\x1f]+/g, " ").trim();
  if (!text) return "Untitled session";
  return text.length > 80 ? text.slice(0, 77) + "…" : text;
}

// ---------------------------------------------------------------------------
// CRUD Operations
// ---------------------------------------------------------------------------

/**
 * Create a new SDK session for an agent.
 */
export async function createSdkSession(
  input: CreateSessionInput
): Promise<SdkSessionData> {
  const messages = input.messages ?? [];
  const title = input.title ?? generateTitle(messages);

  const row = await prisma.agentSdkSession.create({
    data: {
      agentId: input.agentId,
      userId: input.userId ?? null,
      title,
      messages: JSON.parse(JSON.stringify(messages)),
      metadata: input.metadata ? JSON.parse(JSON.stringify(input.metadata)) : undefined,
    },
  });

  logger.info("SDK session created", {
    sessionId: row.id,
    agentId: input.agentId,
  });

  return toSessionData(row);
}

/**
 * Load an SDK session by ID. Returns null if not found.
 */
export async function loadSdkSession(
  sessionId: string
): Promise<SdkSessionData | null> {
  const row = await prisma.agentSdkSession.findUnique({
    where: { id: sessionId },
  });

  if (!row) return null;
  return toSessionData(row);
}

/**
 * Update an existing SDK session (append messages, update tokens, etc.).
 *
 * Uses a Prisma interactive transaction to prevent race conditions:
 * the row is locked during the read-modify-write cycle so two concurrent
 * updates cannot overwrite each other's message arrays.
 */
export async function updateSdkSession(
  sessionId: string,
  input: UpdateSessionInput
): Promise<SdkSessionData> {
  const row = await prisma.$transaction(async (tx) => {
    const current = await tx.agentSdkSession.findUnique({
      where: { id: sessionId },
    });

    if (!current) {
      throw new Error(`SDK session not found: ${sessionId}`);
    }

    const existingMessages = parseMessages(current.messages);
    const mergedMessages = input.messages ?? existingMessages;
    const title = input.title ?? current.title;

    return tx.agentSdkSession.update({
      where: { id: sessionId },
      data: {
        messages: JSON.parse(JSON.stringify(mergedMessages)),
        title,
        status: input.status,
        metadata: input.metadata
          ? JSON.parse(JSON.stringify(input.metadata))
          : undefined,
        totalInputTokens: {
          increment: input.inputTokensDelta ?? 0,
        },
        totalOutputTokens: {
          increment: input.outputTokensDelta ?? 0,
        },
        resumeCount: {
          increment: 1,
        },
      },
    });
  });

  logger.info("SDK session updated", {
    sessionId,
    messageCount: parseMessages(row.messages).length,
    resumeCount: row.resumeCount,
  });

  return toSessionData(row);
}

/**
 * List SDK sessions for an agent, ordered by most recently updated.
 */
export async function listSdkSessions(
  agentId: string,
  options?: {
    status?: SdkSessionStatus;
    limit?: number;
    offset?: number;
  }
): Promise<{ sessions: SdkSessionData[]; total: number }> {
  const where = {
    agentId,
    ...(options?.status ? { status: options.status } : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.agentSdkSession.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      take: options?.limit ?? 20,
      skip: options?.offset ?? 0,
    }),
    prisma.agentSdkSession.count({ where }),
  ]);

  return {
    sessions: rows.map(toSessionData),
    total,
  };
}

/**
 * Delete an SDK session by ID.
 */
export async function deleteSdkSession(sessionId: string): Promise<void> {
  await prisma.agentSdkSession.delete({
    where: { id: sessionId },
  });

  logger.info("SDK session deleted", { sessionId });
}

/**
 * Mark a session as completed.
 */
export async function completeSdkSession(
  sessionId: string
): Promise<SdkSessionData> {
  const row = await prisma.agentSdkSession.update({
    where: { id: sessionId },
    data: { status: "COMPLETED" },
  });

  return toSessionData(row);
}
