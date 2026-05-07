/**
 * Seed script for built-in PipelineTemplate records.
 *
 * Run via: npx tsx prisma/seed-pipeline-templates.ts
 * Or as part of: npx tsx prisma/seed.ts
 *
 * Uses upsert so it is safe to run multiple times.
 */

import { PrismaClient } from "../src/generated/prisma";

const prisma = new PrismaClient();

const PIPELINE_TEMPLATES = [
  // ── GitHub PR Code Review ───────────────────────────────────────────────────
  {
    slug: "github-pr-review",
    name: "GitHub PR Code Review",
    description:
      "Automatically runs a code review pipeline whenever a GitHub Pull Request is opened or updated. " +
      "Uses the ECC Code Reviewer agent to analyse the diff, flag issues, and produce a structured review.",
    category: "code-review",
    icon: "🐙",
    agentSlugs: ["project_context", "ecc-code-reviewer"],
    webhookPreset: "github-pr",
    webhookSettings: {
      signatureProvider: "github",
      isPipelineTrigger: true,
      asyncExecution: true,
      eventFilters: ["pull_request"],
    },
    pipelineSteps: [
      { stepId: "project_context", stepType: "CONTEXT" },
      { stepId: "ecc-code-reviewer", stepType: "IMPLEMENTATION" },
    ],
    pipelineDefaults: {
      taskType: "code-review",
      complexity: "simple",
      requireApproval: false,
      useSmartRouting: false,
    },
    setupGuide: `## GitHub PR Code Review — Setup

This template configures an automatic code review pipeline triggered by GitHub Pull Requests.

### Step 1 — Deploy the template
Click **Deploy** to create the webhook configuration. Copy the **Webhook URL** and **Secret** shown.

### Step 2 — Configure GitHub
1. Go to your GitHub repository → **Settings** → **Webhooks** → **Add webhook**
2. **Payload URL:** paste the Webhook URL
3. **Content type:** \`application/json\`
4. **Secret:** paste the Webhook Secret *(shown once — store it safely)*
5. **Which events:** Select **"Let me select individual events"** → check **Pull requests**
6. Click **Add webhook**

### Step 3 — Test it
Open a new Pull Request in your repo. Within seconds, a pipeline run will appear on this page.

### What triggers a review?
- PR opened
- New commits pushed to an existing PR
- Draft PR marked as ready for review

### What does NOT trigger a review?
- Closed / merged PRs
- Draft PRs (skipped until marked ready)
- Label changes, comments, assignments`,
    isBuiltIn: true,
  },

  // ── GitLab MR Code Review ───────────────────────────────────────────────────
  {
    slug: "gitlab-mr-review",
    name: "GitLab MR Code Review",
    description:
      "Automatically runs a code review pipeline whenever a GitLab Merge Request is opened or updated. " +
      "Uses the ECC Code Reviewer agent with GitLab's plaintext token authentication.",
    category: "code-review",
    icon: "🦊",
    agentSlugs: ["project_context", "ecc-code-reviewer"],
    webhookPreset: "gitlab-mr",
    webhookSettings: {
      signatureProvider: "gitlab",
      isPipelineTrigger: true,
      asyncExecution: true,
      eventFilters: ["Merge Request Hook"],
    },
    pipelineSteps: [
      { stepId: "project_context", stepType: "CONTEXT" },
      { stepId: "ecc-code-reviewer", stepType: "IMPLEMENTATION" },
    ],
    pipelineDefaults: {
      taskType: "code-review",
      complexity: "simple",
      requireApproval: false,
      useSmartRouting: false,
    },
    setupGuide: `## GitLab MR Code Review — Setup

This template configures an automatic code review pipeline triggered by GitLab Merge Requests.

### Step 1 — Deploy the template
Click **Deploy** to create the webhook configuration. Copy the **Webhook URL** and **Secret** shown.

### Step 2 — Configure GitLab
1. Go to your GitLab project → **Settings** → **Webhooks** → **Add new webhook**
2. **URL:** paste the Webhook URL
3. **Secret token:** paste the Webhook Secret *(shown once — store it safely)*
4. **Trigger:** check **Merge request events**
5. Leave **SSL verification** enabled → click **Add webhook**

### Step 3 — Test it
Open a new Merge Request in your project. Within seconds, a pipeline run will appear on this page.

> **Note:** GitLab uses a plaintext token (not HMAC) — this is expected and secure.`,
    isBuiltIn: true,
  },

  // ── Full SDLC Pipeline (GitHub) ─────────────────────────────────────────────
  {
    slug: "github-full-sdlc",
    name: "GitHub Full SDLC Pipeline",
    description:
      "End-to-end autonomous SDLC pipeline triggered by GitHub PRs. " +
      "Runs planning, architecture review, implementation guidance, and code review in sequence.",
    category: "sdlc",
    icon: "🔄",
    agentSlugs: [
      "project_context",
      "ecc-planner",
      "ecc-architect",
      "ecc-code-reviewer",
    ],
    webhookPreset: "github-pr",
    webhookSettings: {
      signatureProvider: "github",
      isPipelineTrigger: true,
      asyncExecution: true,
      eventFilters: ["pull_request"],
    },
    pipelineSteps: [
      { stepId: "project_context", stepType: "CONTEXT" },
      { stepId: "ecc-planner", stepType: "PLANNING" },
      { stepId: "ecc-architect", stepType: "PLANNING" },
      { stepId: "ecc-code-reviewer", stepType: "IMPLEMENTATION" },
    ],
    pipelineDefaults: {
      taskType: "code-review",
      complexity: "moderate",
      requireApproval: false,
      useSmartRouting: true,
    },
    setupGuide: null,
    isBuiltIn: true,
  },

  // ── Code Review Only (no context step, lightweight) ─────────────────────────
  {
    slug: "pr-review-only",
    name: "PR Review Only (Lightweight)",
    description:
      "Minimal code review pipeline — skips the project context step for faster results. " +
      "Best for smaller repositories or simple PRs. Works with both GitHub and GitLab.",
    category: "code-review",
    icon: "⚡",
    agentSlugs: ["ecc-code-reviewer"],
    webhookPreset: "github-pr",
    webhookSettings: {
      signatureProvider: "standard",
      isPipelineTrigger: true,
      asyncExecution: true,
      eventFilters: [],
    },
    pipelineSteps: [
      { stepId: "ecc-code-reviewer", stepType: "IMPLEMENTATION" },
    ],
    pipelineDefaults: {
      taskType: "code-review",
      complexity: "simple",
      requireApproval: false,
      useSmartRouting: false,
    },
    setupGuide: null,
    isBuiltIn: true,
  },

  // ── Manual SDLC (no webhook) ────────────────────────────────────────────────
  {
    slug: "manual-sdlc",
    name: "Manual SDLC Pipeline",
    description:
      "Run the full SDLC pipeline on demand — no webhook required. " +
      "Start a pipeline run from the Pipelines page by describing your task.",
    category: "sdlc",
    icon: "🎮",
    agentSlugs: [
      "project_context",
      "ecc-planner",
      "ecc-code-reviewer",
    ],
    webhookPreset: null,
    webhookSettings: {},
    pipelineSteps: [
      { stepId: "project_context", stepType: "CONTEXT" },
      { stepId: "ecc-planner", stepType: "PLANNING" },
      { stepId: "ecc-code-reviewer", stepType: "IMPLEMENTATION" },
    ],
    pipelineDefaults: {
      taskType: "new-feature",
      complexity: "moderate",
      requireApproval: true,
      useSmartRouting: true,
    },
    setupGuide: `## Manual SDLC Pipeline

No webhook setup required. Use this template to run the SDLC pipeline on demand.

### How to use
1. Go to the **Pipelines** tab for your agent
2. Click **Run Pipeline**
3. Describe your task (e.g. "Add OAuth login with GitHub provider")
4. The pipeline will analyze your task and run through planning → code review stages

### When to use
- When you're starting a new feature and want AI-assisted planning
- When you want a structured code review without setting up a webhook
- When you're exploring the pipeline system`,
    isBuiltIn: true,
  },
];

export async function seedPipelineTemplates() {
  console.log("Seeding pipeline templates...");

  for (const template of PIPELINE_TEMPLATES) {
    // @ts-ignore — PipelineTemplate added in migration; prisma generate runs at build
    await (prisma as any).pipelineTemplate.upsert({
      where: { slug: template.slug },
      update: {
        name: template.name,
        description: template.description,
        category: template.category,
        icon: template.icon,
        agentSlugs: template.agentSlugs,
        webhookPreset: template.webhookPreset,
        webhookSettings: template.webhookSettings,
        pipelineSteps: template.pipelineSteps,
        pipelineDefaults: template.pipelineDefaults,
        setupGuide: template.setupGuide,
        isBuiltIn: template.isBuiltIn,
      },
      create: {
        slug: template.slug,
        name: template.name,
        description: template.description,
        category: template.category,
        icon: template.icon,
        agentSlugs: template.agentSlugs,
        webhookPreset: template.webhookPreset,
        webhookSettings: template.webhookSettings,
        pipelineSteps: template.pipelineSteps,
        pipelineDefaults: template.pipelineDefaults,
        setupGuide: template.setupGuide,
        isBuiltIn: template.isBuiltIn,
      },
    });
    console.log(`  ✅ ${template.slug}`);
  }

  console.log(`Seeded ${PIPELINE_TEMPLATES.length} pipeline templates`);
}

// Run directly if called as a script
if (require.main === module) {
  seedPipelineTemplates()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
