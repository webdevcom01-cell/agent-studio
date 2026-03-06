import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deleteSourceChunks } from "@/lib/knowledge/ingest";

interface RouteParams {
  params: Promise<{ agentId: string; sourceId: string }>;
}

export async function DELETE(
  _request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  const { sourceId } = await params;

  await deleteSourceChunks(sourceId);
  await prisma.kBSource.delete({ where: { id: sourceId } });

  return NextResponse.json({ success: true });
}
