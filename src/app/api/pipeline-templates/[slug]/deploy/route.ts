/**
 * POST /api/pipeline-templates/[slug]/deploy
 *
 * Authenticated endpoint — deploys a pipeline template for a specific agent.
 *
 * "Deploying" a template means:
 *   1. Loading the PipelineTemplate from the DB
 *   2. Creating a WebhookConfig with the template's default settings
 *      (signatureProvider, isPipelineTrigger, asyncExecution, eventFilters)
 *   3. Generating a webhook secret
 *   4. Returning the webhook URL + secret (shown ONCE) + setup instructions
 *
 * The secret is returned in plaintext only in this response.
 * After this, the user must configure their GitHub/GitLab repo with the URL+secret.
 *
 * Request body:
 *   { agentId: string }
 *
 * Response:
 *   {
 *     webhookConfigId: string,
 *     webhookUrl: string,
 *     webhookSecret: string,   // shown ONCE — not retrievable again
 *     signatureProvider: string,
 *     setupInstructions: string,  // Markdown guide
 *   }
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAgentOwner, isAuthError } from "@/lib/api/auth-guard";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import {
  generateWebhookSecret,
  encryptWebhookSecret,
} from "@/lib/webhooks/verify";

const DeploySchema = z.object({
  agentId: z.string().min(1),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
): Promise<NextResponse> {
  const { slug } = await params;

  // ── Auth ──────────────────────────────────────────────────────────────────
  let agentId: string;
  try {
    const body = await request.json();
    const parsed = DeploySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "agentId is required" },
        { status: 400 }
      );
    }
    agentId = parsed.data.agentId;
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const authResult = await requireAgentOwner(agentId);
  if (isAuthError(authResult)) return authResult;

  // ── Load template ─────────────────────────────────────────────────────────
  // @ts-ignore — PipelineTemplate added in migration; prisma generate runs at build
  const template = await (prisma as any).pipelineTemplate.findUnique({
    where: { slug },
  });

  if (!template) {
    return NextResponse.json(
      { success: false, error: "Pipeline template not found" },
      { status: 404 }
    );
  }

  // ── Parse template webhook settings ──────────────────────────────────────
  type WebhookSettings = {
    signatureProvider?: string;
    asyncExecution?: boolean;
    eventFilters?: string[];
  };

  const settings = (template.webhookSettings as WebhookSettings) ?? {};
  const signatureProvider = settings.signatureProvider ?? "standard";
  const asyncExecution = settings.asyncExecution ?? true;
  const eventFilters = settings.eventFilters ?? [];

  // ── Generate webhook secret ───────────────────────────────────────────────
  const plaintextSecret = generateWebhookSecret();
  const { encrypted, isEncrypted } = encryptWebhookSecret(plaintextSecret);

  // ── Create WebhookConfig ──────────────────────────────────────────────────
  const webhookName = `${template.name} (auto-deployed)`;

  const webhookConfig = await prisma.webhookConfig.create({
    data: {
      agentId,
      name: webhookName,
      description: template.description ?? undefined,
      secret: encrypted,
      secretEncrypted: isEncrypted,
      // @ts-ignore — signatureProvider + isPipelineTrigger added in migration
      signatureProvider,
      isPipelineTrigger: true,
      asyncExecution,
      eventFilters,
      bodyMappings: [],
      headerMappings: [],
    },
    select: {
      id: true,
    },
  });

  // Increment usage counter
  // @ts-ignore
  await (prisma as any).pipelineTemplate.update({
    where: { slug },
    data: { usageCount: { increment: 1 } },
  });

  // ── Build webhook URL ─────────────────────────────────────────────────────
  const baseUrl =
    process.env.NEXTAUTH_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    "https://your-app.railway.app";

  const webhookUrl = `${baseUrl}/api/agents/${agentId}/pipelines/webhook-trigger/${webhookConfig.id}`;

  // ── Build setup instructions ──────────────────────────────────────────────
  const setupInstructions = buildSetupInstructions({
    templateName: template.name,
    signatureProvider,
    webhookUrl,
    webhookSecret: plaintextSecret,
    eventFilters,
    setupGuide: template.setupGuide ?? undefined,
  });

  logger.info("Pipeline template deployed", {
    agentId,
    slug,
    webhookConfigId: webhookConfig.id,
    signatureProvider,
  });

  return NextResponse.json({
    success: true,
    webhookConfigId: webhookConfig.id,
    webhookUrl,
    webhookSecret: plaintextSecret, // shown once — user must copy it now
    signatureProvider,
    setupInstructions,
  });
}

// ─── Setup instructions builder ────────────────────────────────────────────────

interface SetupOptions {
  templateName: string;
  signatureProvider: string;
  webhookUrl: string;
  webhookSecret: string;
  eventFilters: string[];
  setupGuide?: string;
}

function buildSetupInstructions(opts: SetupOptions): string {
  if (opts.setupGuide) return opts.setupGuide;

  // Default instructions based on provider
  if (opts.signatureProvider === "github") {
    return `## GitHub Webhook Setup — ${opts.templateName}

1. Go to your GitHub repository → **Settings** → **Webhooks** → **Add webhook**
2. **Payload URL:** \`${opts.webhookUrl}\`
3. **Content type:** \`application/json\`
4. **Secret:** \`${opts.webhookSecret}\` *(copy now — not shown again)*
5. **Which events:** Select **"Let me select individual events"** → check **Pull requests**
6. Ensure **Active** is checked → click **Add webhook**

GitHub will send a ping event to verify the URL. Your pipeline will trigger on every new PR, push to PR, and PR reopen.`;
  }

  if (opts.signatureProvider === "gitlab") {
    return `## GitLab Webhook Setup — ${opts.templateName}

1. Go to your GitLab project → **Settings** → **Webhooks** → **Add new webhook**
2. **URL:** \`${opts.webhookUrl}\`
3. **Secret token:** \`${opts.webhookSecret}\` *(copy now — not shown again)*
4. **Trigger:** Check **Merge request events**
5. Leave **SSL verification** enabled → click **Add webhook**

Your pipeline will trigger on every new MR, push to MR, and MR reopen.`;
  }

  return `## Webhook Setup — ${opts.templateName}

**Webhook URL:** \`${opts.webhookUrl}\`
**Secret:** \`${opts.webhookSecret}\` *(copy now — not shown again)*
${opts.eventFilters.length > 0 ? `**Event filters:** ${opts.eventFilters.join(", ")}` : ""}

Configure your webhook provider with the URL and secret above.`;
}
