/**
 * Provider presets for common webhook sources.
 *
 * Each preset defines:
 *  - id           unique key used in UI
 *  - name         display name
 *  - icon         emoji for the UI
 *  - description  one-line description
 *  - bodyMappings pre-configured body JSONPath → flow variable mappings
 *  - headerMappings pre-configured header → flow variable mappings
 *  - eventFilters suggested default event filter list (user may customise)
 *  - commonEvents curated list of event types shown in the filter editor
 *  - docs         link to provider webhook documentation
 *  - signatureNote explains the provider's signature scheme for user guidance
 */

export interface BodyMapping {
  jsonPath: string;
  variableName: string;
  type?: "string" | "number" | "boolean" | "object";
}

export interface HeaderMapping {
  headerName: string;
  variableName: string;
}

export interface WebhookPreset {
  id: string;
  name: string;
  icon: string;
  description: string;
  bodyMappings: BodyMapping[];
  headerMappings: HeaderMapping[];
  eventFilters: string[];
  commonEvents: string[];
  docs: string;
  signatureNote: string;
  /**
   * Representative sample payload for this provider.
   * Used by the JSONPath Tester in the Configuration tab so developers
   * can validate their body mappings without sending a real webhook.
   */
  samplePayload: Record<string, unknown>;
}

// ─── GitHub ────────────────────────────────────────────────────────────────────

const GITHUB: WebhookPreset = {
  id: "github",
  name: "GitHub",
  icon: "🐙",
  description: "Push events, pull requests, issues, releases and more",
  bodyMappings: [
    { jsonPath: "$.action",                 variableName: "action",       type: "string" },
    { jsonPath: "$.repository.full_name",   variableName: "repo_name",    type: "string" },
    { jsonPath: "$.repository.html_url",    variableName: "repo_url",     type: "string" },
    { jsonPath: "$.sender.login",           variableName: "sender",       type: "string" },
    { jsonPath: "$.ref",                    variableName: "git_ref",      type: "string" },
    { jsonPath: "$.head_commit.message",    variableName: "commit_msg",   type: "string" },
  ],
  headerMappings: [
    { headerName: "x-github-event",        variableName: "github_event" },
    { headerName: "x-github-delivery",     variableName: "github_delivery_id" },
  ],
  eventFilters: ["push"],
  commonEvents: [
    "push",
    "pull_request",
    "pull_request_review",
    "issues",
    "issue_comment",
    "create",
    "delete",
    "release",
    "deployment",
    "deployment_status",
    "workflow_run",
    "workflow_job",
    "check_run",
    "check_suite",
    "star",
    "fork",
    "member",
  ],
  docs: "https://docs.github.com/en/webhooks/webhook-events-and-payloads",
  signatureNote:
    "GitHub signs requests with HMAC-SHA256 in the x-hub-signature-256 header. " +
    "This uses the Standard Webhooks header format — configure the webhook secret " +
    "in your GitHub repo → Settings → Webhooks.",
  samplePayload: {
    action: "opened",
    ref: "refs/heads/main",
    repository: {
      full_name: "octocat/Hello-World",
      html_url: "https://github.com/octocat/Hello-World",
      private: false,
    },
    sender: { login: "octocat", id: 1 },
    head_commit: {
      id: "abc123def456",
      message: "Fix all the bugs",
      author: { name: "Octocat", email: "octocat@github.com" },
    },
    commits: [
      { id: "abc123def456", message: "Fix all the bugs", added: [], removed: [], modified: ["README.md"] },
    ],
  },
};

// ─── Stripe ────────────────────────────────────────────────────────────────────

const STRIPE: WebhookPreset = {
  id: "stripe",
  name: "Stripe",
  icon: "💳",
  description: "Payment events, subscriptions, invoices and more",
  bodyMappings: [
    { jsonPath: "$.type",                   variableName: "stripe_event_type", type: "string" },
    { jsonPath: "$.id",                     variableName: "stripe_event_id",   type: "string" },
    { jsonPath: "$.data.object.id",         variableName: "object_id",         type: "string" },
    { jsonPath: "$.data.object.status",     variableName: "object_status",     type: "string" },
    { jsonPath: "$.data.object.amount",     variableName: "amount",            type: "number" },
    { jsonPath: "$.data.object.currency",   variableName: "currency",          type: "string" },
    { jsonPath: "$.data.object.customer",   variableName: "customer_id",       type: "string" },
  ],
  headerMappings: [
    // Stripe sends its own signature in stripe-signature — the Standard Webhooks
    // spec wraps this, but for native Stripe webhooks users use their CLI to forward.
    // We map stripe-signature for informational purposes.
    { headerName: "stripe-signature",       variableName: "stripe_sig_header" },
  ],
  eventFilters: ["payment_intent.succeeded"],
  commonEvents: [
    "payment_intent.succeeded",
    "payment_intent.payment_failed",
    "payment_intent.created",
    "checkout.session.completed",
    "checkout.session.expired",
    "customer.subscription.created",
    "customer.subscription.updated",
    "customer.subscription.deleted",
    "customer.subscription.trial_will_end",
    "invoice.payment_succeeded",
    "invoice.payment_failed",
    "invoice.created",
    "charge.succeeded",
    "charge.failed",
    "charge.refunded",
    "customer.created",
    "customer.updated",
    "customer.deleted",
    "product.created",
    "product.updated",
  ],
  docs: "https://docs.stripe.com/webhooks/webhook-events",
  signatureNote:
    "Stripe signs requests with HMAC-SHA256 in the stripe-signature header. " +
    "Use the Stripe webhook signing secret from your Stripe Dashboard → Webhooks as this webhook's secret.",
  samplePayload: {
    id: "evt_1NirD82eZvKYlo2CIvbtLWuY",
    object: "event",
    type: "payment_intent.succeeded",
    created: 1690988796,
    data: {
      object: {
        id: "pi_3NirD82eZvKYlo2C1PFPdCbD",
        object: "payment_intent",
        amount: 2000,
        currency: "usd",
        status: "succeeded",
        customer: "cus_9s6XKzkNRiz8i3",
      },
    },
    livemode: false,
  },
};

// ─── Slack ─────────────────────────────────────────────────────────────────────

const SLACK: WebhookPreset = {
  id: "slack",
  name: "Slack",
  icon: "💬",
  description: "Slash commands, interactive components, Events API",
  bodyMappings: [
    { jsonPath: "$.event.type",             variableName: "slack_event_type",  type: "string" },
    { jsonPath: "$.event.user",             variableName: "slack_user_id",     type: "string" },
    { jsonPath: "$.event.text",             variableName: "slack_text",        type: "string" },
    { jsonPath: "$.event.channel",          variableName: "slack_channel",     type: "string" },
    { jsonPath: "$.event.ts",               variableName: "slack_ts",          type: "string" },
    { jsonPath: "$.team_id",                variableName: "slack_team_id",     type: "string" },
    { jsonPath: "$.api_app_id",             variableName: "slack_app_id",      type: "string" },
  ],
  headerMappings: [
    { headerName: "x-slack-signature",      variableName: "slack_signature" },
    { headerName: "x-slack-request-timestamp", variableName: "slack_ts_header" },
  ],
  eventFilters: ["message"],
  commonEvents: [
    "message",
    "message.channels",
    "message.im",
    "message.groups",
    "app_mention",
    "app_home_opened",
    "reaction_added",
    "reaction_removed",
    "channel_created",
    "channel_renamed",
    "channel_archive",
    "channel_unarchive",
    "member_joined_channel",
    "member_left_channel",
    "team_join",
    "url_verification",
  ],
  docs: "https://api.slack.com/events",
  signatureNote:
    "Slack URL verification is handled automatically — the challenge response is " +
    "returned before signature verification. For event signing, use your Slack app's " +
    "Signing Secret. Note: Slack uses a different signature scheme (v0=hmac-sha256); " +
    "the trigger endpoint accepts Standard Webhooks format for consistent verification.",
  samplePayload: {
    token: "XXYYZZ",
    team_id: "T123ABC456",
    api_app_id: "A123ABC456",
    type: "event_callback",
    event: {
      type: "app_mention",
      user: "U123ABC456",
      text: "<@U0LAN0Z89> Hello!",
      ts: "1355517523.000005",
      channel: "C123ABC456",
    },
    event_time: 1355517523,
  },
};

// ─── Generic / Custom ──────────────────────────────────────────────────────────

const GENERIC: WebhookPreset = {
  id: "generic",
  name: "Generic / Custom",
  icon: "🔗",
  description: "Start from a clean slate with no pre-configured mappings",
  bodyMappings: [],
  headerMappings: [],
  eventFilters: [],
  commonEvents: [],
  docs: "https://www.standardwebhooks.com/",
  signatureNote:
    "Uses Standard Webhooks HMAC-SHA256 signing. Include x-webhook-id, " +
    "x-webhook-timestamp, and x-webhook-signature headers with each request.",
  samplePayload: {
    id: "evt_abc123",
    type: "resource.created",
    timestamp: "2026-01-15T10:00:00Z",
    data: {
      id: "res_xyz789",
      status: "active",
      name: "Example Resource",
    },
  },
};

// ─── GitHub PR (DevSecOps) ─────────────────────────────────────────────────────

/**
 * Specialized GitHub preset for the DevSecOps Pipeline.
 * Extracts full PR context needed by the Orchestrator agent.
 */
const GITHUB_PR: WebhookPreset = {
  id: "github-pr",
  name: "GitHub PR (DevSecOps)",
  icon: "🔐",
  description: "Pull request events for the autonomous DevSecOps pipeline — extracts PR number, author, diff URL, files changed, and branch info",
  bodyMappings: [
    { jsonPath: "$.action",                              variableName: "action",            type: "string" },
    { jsonPath: "$.number",                              variableName: "pr_number",         type: "number" },
    { jsonPath: "$.pull_request.title",                  variableName: "pr_title",          type: "string" },
    { jsonPath: "$.pull_request.html_url",               variableName: "pr_url",            type: "string" },
    { jsonPath: "$.pull_request.diff_url",               variableName: "pr_diff_url",       type: "string" },
    { jsonPath: "$.pull_request.user.login",             variableName: "pr_author",         type: "string" },
    { jsonPath: "$.pull_request.base.ref",               variableName: "base_branch",       type: "string" },
    { jsonPath: "$.pull_request.head.ref",               variableName: "head_branch",       type: "string" },
    { jsonPath: "$.pull_request.head.sha",               variableName: "head_sha",          type: "string" },
    { jsonPath: "$.pull_request.additions",              variableName: "additions",         type: "number" },
    { jsonPath: "$.pull_request.deletions",              variableName: "deletions",         type: "number" },
    { jsonPath: "$.pull_request.changed_files",          variableName: "changed_files_count", type: "number" },
    { jsonPath: "$.pull_request.draft",                  variableName: "is_draft",          type: "boolean" },
    { jsonPath: "$.pull_request.body",                   variableName: "pr_description",    type: "string" },
    { jsonPath: "$.repository.full_name",                variableName: "repo_full_name",    type: "string" },
    { jsonPath: "$.repository.html_url",                 variableName: "repo_url",          type: "string" },
  ],
  headerMappings: [
    { headerName: "x-github-event",    variableName: "github_event" },
    { headerName: "x-github-delivery", variableName: "github_delivery_id" },
  ],
  eventFilters: ["pull_request"],
  commonEvents: [
    "pull_request",
    "pull_request_review",
    "pull_request_review_comment",
  ],
  docs: "https://docs.github.com/en/webhooks/webhook-events-and-payloads#pull_request",
  signatureNote:
    "GitHub signs requests with HMAC-SHA256 in the x-hub-signature-256 header. " +
    "Configure the webhook secret in your GitHub repo → Settings → Webhooks. " +
    "Set Content-Type to application/json and select 'Pull requests' events only.",
  samplePayload: {
    action: "opened",
    number: 42,
    pull_request: {
      title: "feat: add user authentication flow",
      html_url: "https://github.com/octocat/Hello-World/pull/42",
      diff_url: "https://github.com/octocat/Hello-World/pull/42.diff",
      user: { login: "octocat" },
      base: { ref: "main" },
      head: { ref: "feature/auth-flow", sha: "abc123def456789" },
      additions: 156,
      deletions: 23,
      changed_files: 8,
      draft: false,
      body: "Implements OAuth2 flow with GitHub and Google providers.\n\nCloses #38",
    },
    repository: {
      full_name: "octocat/Hello-World",
      html_url: "https://github.com/octocat/Hello-World",
    },
    sender: { login: "octocat" },
  },
};

// ─── Exports ──────────────────────────────────────────────────────────────────

export const WEBHOOK_PRESETS: WebhookPreset[] = [GITHUB, GITHUB_PR, STRIPE, SLACK, GENERIC];

export function getPreset(id: string): WebhookPreset | undefined {
  return WEBHOOK_PRESETS.find((p) => p.id === id);
}
