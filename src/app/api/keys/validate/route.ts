import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { parseBodyWithLimit } from "@/lib/api/body-limit";
import { hashApiKey, validateApiKey } from "@/lib/api/api-key";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const ValidateSchema = z.object({
  apiKey: z.string().min(1),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: Record<string, unknown>;
  try {
    body = (await parseBodyWithLimit(request)) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ success: false, error: "Invalid request body" }, { status: 400 });
  }

  const parsed = ValidateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "apiKey field required" }, { status: 400 });
  }

  const { apiKey } = parsed.data;

  const authResult = await validateApiKey(apiKey);

  if (!authResult) {
    return NextResponse.json({ valid: false });
  }

  const keyHash = hashApiKey(apiKey);
  const keyRecord = await prisma.apiKey.findUnique({
    where: { keyHash },
    select: {
      id: true,
      user: {
        select: {
          orgMemberships: {
            select: { organizationId: true },
            orderBy: { joinedAt: "asc" },
            take: 1,
          },
        },
      },
    },
  });

  if (!keyRecord) {
    return NextResponse.json({ valid: false });
  }

  const organizationId = keyRecord.user.orgMemberships[0]?.organizationId ?? null;

  logger.info("API key validated via /api/keys/validate", { userId: authResult.userId, organizationId });

  return NextResponse.json({
    valid: true,
    userId: authResult.userId,
    organizationId,
    scopes: authResult.scopes,
  });
}
