import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOrgMember, isAuthError } from "@/lib/api/auth-guard";
import { parseBodyWithLimit } from "@/lib/api/body-limit";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

const UpsertMissionSchema = z.object({
  organizationId: z.string().cuid(),
  statement: z.string().min(1).max(5000),
  vision: z.string().max(5000).optional().nullable(),
  values: z.array(z.string().max(200)).max(20).optional(),
});

export async function GET(request: NextRequest): Promise<NextResponse> {
  const orgId = request.nextUrl.searchParams.get("orgId");

  if (!orgId) {
    return NextResponse.json({ success: false, error: "orgId query param required" }, { status: 400 });
  }

  const authResult = await requireOrgMember(orgId, request);
  if (isAuthError(authResult)) return authResult;

  try {
    const mission = await prisma.companyMission.findUnique({ where: { organizationId: orgId } });
    return NextResponse.json({ success: true, data: mission });
  } catch (error) {
    logger.error("GET /api/mission error", { orgId, error });
    return NextResponse.json({ success: false, error: "Failed to fetch mission" }, { status: 500 });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  return upsertMission(request);
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  return upsertMission(request);
}

async function upsertMission(request: NextRequest): Promise<NextResponse> {
  let body: Record<string, unknown>;
  try {
    body = (await parseBodyWithLimit(request)) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ success: false, error: "Invalid request body" }, { status: 400 });
  }

  const parsed = UpsertMissionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.message }, { status: 422 });
  }

  const { organizationId, statement, vision, values } = parsed.data;

  const authResult = await requireOrgMember(organizationId, request);
  if (isAuthError(authResult)) return authResult;

  try {
    const mission = await prisma.companyMission.upsert({
      where: { organizationId },
      update: { statement, vision: vision ?? null, values: values ?? [] },
      create: { organizationId, statement, vision: vision ?? null, values: values ?? [] },
    });

    return NextResponse.json({ success: true, data: mission }, { status: 200 });
  } catch (error) {
    logger.error("POST /api/mission error", { organizationId, error });
    return NextResponse.json({ success: false, error: "Failed to save mission" }, { status: 500 });
  }
}
