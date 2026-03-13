/**
 * Featured MCP Servers
 *
 * Pre-configured MCP servers that users can connect with a single click.
 * These are stable, publicly-hosted servers that require minimal setup.
 */

export type SetupType = "api_key" | "repo_url";

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
   * null = URL is derived from user input (repo_url setup type).
   */
  url: string | null;
  transport: "STREAMABLE_HTTP" | "SSE";
  setupType: SetupType;
  /** HTTP header name for auth, e.g. "Authorization" */
  authHeader?: string;
  /** Prefix prepended to the user-supplied key, e.g. "Bearer " */
  authPrefix?: string;
  /** Label shown above the input field */
  keyLabel: string;
  /** Placeholder text for the input field */
  keyPlaceholder: string;
  /** URL to help the user obtain the required key/value */
  keyHelpUrl: string;
  /** Short help text shown below the input */
  keyHelpText: string;
  /**
   * URL template for repo_url setup type.
   * Use "{repo}" as the placeholder, e.g. "https://gitmcp.io/{repo}"
   */
  urlTemplate?: string;
}

export const FEATURED_MCP_SERVERS: FeaturedMCPServer[] = [
  {
    id: "github-official",
    name: "GitHub",
    icon: "🐙",
    description: "Connect to GitHub's official MCP server to read repositories, search code, manage issues and pull requests.",
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
    description: "Instantly turn any public GitHub repository into a documentation & code knowledge base — no auth required.",
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
];

/**
 * Build the final MCP server URL from a featured server config + user input.
 * For api_key type: URL is fixed (server.url).
 * For repo_url type: replaces {repo} in urlTemplate with the user input.
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
 * Returns undefined if no auth is required.
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
