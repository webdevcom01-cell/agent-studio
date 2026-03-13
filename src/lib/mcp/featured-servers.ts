/**
 * Featured MCP Servers
 *
 * Pre-configured MCP servers that users can connect with a single click.
 * These are stable, publicly-hosted servers that require minimal setup.
 */

export type SetupType = "api_key" | "repo_url" | "oauth" | "coming_soon";

export interface FeaturedMCPServer {
  /** Unique identifier used for duplicate detection */
  id: string;
  /** Display name */
  name: string;
  /** Emoji icon */
  icon: string;
  /** Short description of what the server provides */
  description: string;
  /** Bullet points shown in the connect dialog */
  capabilities: string[];
  /**
   * Base URL for the MCP server.
   * null = URL is derived from user input (repo_url) or assigned post-OAuth (oauth).
   */
  url: string | null;
  transport: "STREAMABLE_HTTP" | "SSE";
  setupType: SetupType;

  // ── api_key / repo_url fields ──────────────────────────────────────────────
  /** HTTP header name for auth, e.g. "Authorization" */
  authHeader?: string;
  /** Prefix prepended to the user-supplied key, e.g. "Bearer " */
  authPrefix?: string;
  /** Label shown above the input field */
  keyLabel?: string;
  /** Placeholder text for the input field */
  keyPlaceholder?: string;
  /** URL to help the user obtain the required key/value */
  keyHelpUrl?: string;
  /** Short help text shown below the input */
  keyHelpText?: string;
  /**
   * URL template for repo_url setup type.
   * Use "{repo}" as the placeholder, e.g. "https://gitmcp.io/{repo}"
   */
  urlTemplate?: string;

  // ── oauth fields ────────────────────────────────────────────────────────────
  /**
   * App-internal route that initiates the OAuth flow.
   * e.g. "/api/auth/oauth/notion"
   */
  oauthRoute?: string;

  // ── coming_soon fields ──────────────────────────────────────────────────────
  /** Optional note shown on the card explaining the coming-soon status */
  comingSoonNote?: string;
}

export const FEATURED_MCP_SERVERS: FeaturedMCPServer[] = [
  // ── Developer tools ─────────────────────────────────────────────────────────
  {
    id: "github-official",
    name: "GitHub",
    icon: "🐙",
    description:
      "Connect to GitHub's official MCP server to read repositories, search code, manage issues and pull requests.",
    capabilities: [
      "Search code across repositories",
      "Read files, commits, and branches",
      "Create and manage issues & PRs",
      "List repos and organizations",
    ],
    url: "https://api.githubcopilot.com/mcp/",
    transport: "STREAMABLE_HTTP",
    setupType: "api_key",
    authHeader: "Authorization",
    authPrefix: "Bearer ",
    keyLabel: "GitHub Personal Access Token",
    keyPlaceholder: "ghp_xxxxxxxxxxxxxxxxxxxx",
    keyHelpUrl: "https://github.com/settings/tokens",
    keyHelpText: "Create a token with repo, read:org, and read:user scopes.",
  },
  {
    id: "gitmcp",
    name: "GitMCP",
    icon: "📖",
    description:
      "Instantly turn any public GitHub repository into a documentation & code knowledge base — no auth required.",
    capabilities: [
      "Read README and documentation",
      "Browse repository structure",
      "Access code files and examples",
      "Works with any public repo",
    ],
    url: null,
    transport: "SSE",
    setupType: "repo_url",
    urlTemplate: "https://gitmcp.io/{repo}",
    keyLabel: "GitHub Repository (owner/name)",
    keyPlaceholder: "vercel/next.js",
    keyHelpUrl: "https://github.com",
    keyHelpText: "Enter any public repository in owner/name format.",
  },

  // ── Productivity ────────────────────────────────────────────────────────────
  {
    id: "notion",
    name: "Notion",
    icon: "📝",
    description:
      "Connect your Notion workspace to read pages, query databases, and create or update content.",
    capabilities: [
      "Search and read pages & databases",
      "Query database records with filters",
      "Create and update pages",
      "Manage blocks and properties",
    ],
    url: "https://mcp.notion.com/mcp",
    transport: "STREAMABLE_HTTP",
    setupType: "oauth",
    oauthRoute: "/api/auth/oauth/notion",
  },
  {
    id: "slack",
    name: "Slack",
    icon: "💬",
    description:
      "Connect your Slack workspace to read messages, search conversations, and post updates.",
    capabilities: [
      "Read messages and threads",
      "Search across conversations",
      "List channels and members",
      "Post messages to channels",
    ],
    url: null,
    transport: "STREAMABLE_HTTP",
    setupType: "coming_soon",
    comingSoonNote: "Slack's official MCP server is currently in limited beta. Check back soon.",
  },

  // ── Data & databases ────────────────────────────────────────────────────────
  {
    id: "airtable",
    name: "Airtable",
    icon: "📊",
    description:
      "Connect to Airtable to read and write records, browse bases, and manage tables.",
    capabilities: [
      "List and search records",
      "Create, update, and delete records",
      "Browse bases, tables, and views",
      "Manage fields and schemas",
    ],
    url: "https://mcp.airtable.com/mcp",
    transport: "STREAMABLE_HTTP",
    setupType: "api_key",
    authHeader: "Authorization",
    authPrefix: "Bearer ",
    keyLabel: "Airtable Personal Access Token",
    keyPlaceholder: "patXXXXXXXXXXXXXX.XXXXXXXX",
    keyHelpUrl: "https://airtable.com/create/tokens",
    keyHelpText:
      "Create a token with data.records:read and schema.bases:read scopes at minimum.",
  },
];

/**
 * Build the final MCP server URL from a featured server config + user input.
 * For api_key type: URL is fixed (server.url).
 * For repo_url type: replaces {repo} in urlTemplate with the user input.
 * For oauth / coming_soon: URL is fixed (server.url) — not user-derived.
 */
export function buildFeaturedServerUrl(
  server: FeaturedMCPServer,
  userInput: string,
): string {
  if (server.setupType === "repo_url" && server.urlTemplate) {
    const repo = userInput.trim().replace(/^\/+|\/+$/g, "");
    return server.urlTemplate.replace("{repo}", repo);
  }
  return server.url ?? "";
}

/**
 * Build the headers object for a featured server.
 * Returns undefined if no auth is required (repo_url, oauth, coming_soon).
 */
export function buildFeaturedServerHeaders(
  server: FeaturedMCPServer,
  userInput: string,
): Record<string, string> | undefined {
  if (server.authHeader && server.setupType === "api_key") {
    const prefix = server.authPrefix ?? "";
    return { [server.authHeader]: `${prefix}${userInput.trim()}` };
  }
  return undefined;
}
