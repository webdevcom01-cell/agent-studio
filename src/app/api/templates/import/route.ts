import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOrgMember, isAuthError } from "@/lib/api/auth-guard";
import { parseBodyWithLimit } from "@/lib/api/body-limit";
import { logger } from "@/lib/logger";
import { importTemplate, validateTemplatePayload } from "@/lib/templates/template-engine";
import type { TemplatePayload } from "@/lib/templates/template-engine";

const ImportSchema = z.object({
  organizationId: z.string().cuid(),
  payload: z.record(z.unknown()),
  checksum: z.string().min(1),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: Record<string, unknown>;
  try {
    body = (await parseBodyWithLimit(request)) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ success: false, error: "Invalid request body" }, { status: 400 });
  }

  const parsed = ImportSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.message }, { status: 422 });
  }

  const { organizationId, payload, checksum } = parsed.data;

  const authResult = await requireOrgMember(organizationId, request);
  if (isAuthError(authResult)) return authResult;

  const { valid, errors } = validateTemplatePayload(payload);
  if (!valid) {
    return NextResponse.json(
      { success: false, error: `Invalid template payload: ${errors.join(", ")}` },
      { status: 422 },
    );
  }

  try {
    const result = await importTemplate(payload as unknown as TemplatePayload, checksum, organizationId);
    logger.info("Template imported from raw payload", { organizationId, agentId: result.agentId });
    return NextResponse.json({ success: true, data: result }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Import failed";
    logger.error("POST /api/templates/import error", { organizationId, error });
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
