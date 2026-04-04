import { NextRequest, NextResponse } from "next/server";
import { requireAgentOwner, isAuthError } from "@/lib/api/auth-guard";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { z } from "zod";

const UpdateMemorySchema = z.object({
  value: z.unknown().optional(),
  category: z.string().min(1).max(100).optional(),
  importance: z.number().min(0).max(1).optional(),
});

/**
 * PATCH /api/agents/[agentId]/memory/[memoryId] — Edit a memory entry
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string; memoryId: string }> },
) {
  const { agentId, memoryId } = await params;
  const authResult = await requireAgentOwner(agentId);
  if (isAuthError(authResult)) return authResult;

  try {
    const body = await req.json();
    const parsed = UpdateMemorySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.message },
        { status: 422 },
      );
    }

    // Verify memory belongs to this agent
    const existing = await prisma.agentMemory.findFirst({
      where: { id: memoryId, agentId },
    });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Memory not found" },
        { status: 404 },
      );
    }

    const updateData: Record<string, unknown> = {};
    if (parsed.data.value !== undefined) updateData.value = parsed.data.value;
    if (parsed.data.category !== undefined) updateData.category = parsed.data.category;
    if (parsed.data.importance !== undefined) updateData.importance = parsed.data.importance;

    const updated = await prisma.agentMemory.update({
      where: { id: memoryId },
      data: updateData,
      select: {
        id: true,
        key: true,
        value: true,
        category: true,
        importance: true,
        accessCount: true,
        accessedAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    logger.error("Failed to update memory", { agentId, memoryId, error });
    return NextResponse.json(
      { success: false, error: "Failed to update memory" },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/agents/[agentId]/memory/[memoryId] — Delete a memory entry
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ agentId: string; memoryId: string }> },
) {
  const { agentId, memoryId } = await params;
  const authResult = await requireAgentOwner(agentId);
  if (isAuthError(authResult)) return authResult;

  try {
    // Verify memory belongs to this agent
    const existing = await prisma.agentMemory.findFirst({
      where: { id: memoryId, agentId },
    });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Memory not found" },
        { status: 404 },
      );
    }

    await prisma.agentMemory.delete({
      where: { id: memoryId },
    });

    return NextResponse.json({ success: true, data: { deleted: true } });
  } catch (error) {
    logger.error("Failed to delete memory", { agentId, memoryId, error });
    return NextResponse.json(
      { success: false, error: "Failed to delete memory" },
      { status: 500 },
    );
  }
}
