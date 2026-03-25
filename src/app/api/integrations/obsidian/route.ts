/**
 * GET  /api/integrations/obsidian — vault status, document list, GitMCP URL
 * POST /api/integrations/obsidian — sync skills/instincts to vault
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, isAuthError } from "@/lib/api/auth-guard";
import { parseBodyWithLimit } from "@/lib/api/body-limit";
import { sanitizeErrorMessage } from "@/lib/api/sanitize-error";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { createObsidianAdapter, isObsidianConfigured } from "@/lib/ecc/obsidian-adapter";

const SyncRequestSchema = z.object({
  action: z.enum(["sync_skills", "sync_instincts", "sync_all"]),
  agentId: z.string().optional(),
});

export async function GET(): Promise<NextResponse> {
  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult;

  if (!isObsidianConfigured()) {
    return NextResponse.json({
      success: true,
      data: {
        configured: false,
        connected: false,
        gitMcpUrl: null,
        documents: [],
      },
    });
  }

  const adapter = createObsidianAdapter();

  try {
    const connected = await adapter.isConnected();
    const documents = connected ? await adapter.listDocuments() : [];

    return NextResponse.json({
      success: true,
      data: {
        configured: true,
        connected,
        gitMcpUrl: adapter.getGitMCPUrl(),
        documents,
        documentCount: documents.length,
      },
    });
  } catch (error) {
    logger.error("Obsidian status check failed", error, {});
    return NextResponse.json(
      { success: false, error: sanitizeErrorMessage(error) },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult;

  if (!isObsidianConfigured()) {
    return NextResponse.json(
      { success: false, error: "Obsidian vault not configured" },
      { status: 400 }
    );
  }

  try {
    const raw = await parseBodyWithLimit(req);
    const parsed = SyncRequestSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0]?.message ?? "Invalid input" },
        { status: 422 }
      );
    }

    const adapter = createObsidianAdapter();
    const { action, agentId } = parsed.data;
    const results: { type: string; path: string; name: string }[] = [];
    const errors: { name: string; error: string }[] = [];

    if (action === "sync_skills" || action === "sync_all") {
      const skills = await prisma.skill.findMany({
        select: { slug: true, name: true, content: true, tags: true },
        take: 100,
      });

      for (const skill of skills) {
        try {
          const path = await adapter.syncSkillToVault(skill.slug, skill.content, skill.tags);
          results.push({ type: "skill", path, name: skill.name });
        } catch (err) {
          errors.push({ name: skill.name, error: err instanceof Error ? err.message : String(err) });
        }
      }
    }

    if (action === "sync_instincts" || action === "sync_all") {
      const where = agentId
        ? { agentId, promotedToSkillId: null }
        : { promotedToSkillId: null };

      const instincts = await prisma.instinct.findMany({
        where,
        select: { name: true, description: true, confidence: true },
        take: 100,
      });

      for (const inst of instincts) {
        try {
          const path = await adapter.syncInstinctToVault(inst.name, inst.description, inst.confidence);
          results.push({ type: "instinct", path, name: inst.name });
        } catch (err) {
          errors.push({ name: inst.name, error: err instanceof Error ? err.message : String(err) });
        }
      }
    }

    logger.info("Obsidian sync complete", {
      action,
      synced: results.length,
      errors: errors.length,
    });

    return NextResponse.json({
      success: true,
      data: { synced: results, errors, total: results.length },
    });
  } catch (error) {
    logger.error("Obsidian sync failed", error, {});
    return NextResponse.json(
      { success: false, error: sanitizeErrorMessage(error) },
      { status: 500 }
    );
  }
}
