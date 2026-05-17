import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, isAuthError } from "@/lib/api/auth-guard";
import { getAllFlags, setFlagOverride, clearFlagOverride } from "@/lib/feature-flags";
import { logger } from "@/lib/logger";
import { z } from "zod";

export async function GET(): Promise<NextResponse> {
  const authResult = await requireAdmin();
  if (isAuthError(authResult)) return authResult;

  const flags = getAllFlags();
  return NextResponse.json({ success: true, data: { flags } });
}

const PatchSchema = z.object({
  key: z.string().min(1),
  enabled: z.boolean().optional(),
  rolloutPercent: z.number().int().min(0).max(100).optional(),
  clear: z.boolean().optional(),
});

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const authResult = await requireAdmin();
  if (isAuthError(authResult)) return authResult;

  const body = await req.json();
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.message }, { status: 422 });
  }

  const { key, enabled, rolloutPercent, clear } = parsed.data;

  try {
    if (clear) {
      await clearFlagOverride(key);
      logger.info("Feature flag override cleared", { key, by: authResult.userId });
    } else {
      await setFlagOverride(key, { enabled, rolloutPercent });
      logger.info("Feature flag override set", { key, enabled, rolloutPercent, by: authResult.userId });
    }

    return NextResponse.json({ success: true, data: { key, clear: clear ?? false } });
  } catch (err) {
    logger.error("Feature flag update failed", err instanceof Error ? err : new Error(String(err)));
    return NextResponse.json({ success: false, error: "Failed to update flag" }, { status: 500 });
  }
}
