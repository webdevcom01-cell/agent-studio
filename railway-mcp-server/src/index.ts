#!/usr/bin/env node
/**
 * Railway MCP Server (custom).
 *
 * Connects an MCP client to the Railway public GraphQL API.
 * Scope: read + limited write (no deletes). Local stdio transport.
 *
 * Auth: set RAILWAY_TOKEN to an account or workspace token
 * (create at https://railway.com/account/tokens).
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerTools } from "./tools.js";

const server = new McpServer({
  name: "railway-mcp-server",
  version: "1.0.0",
});

registerTools(server);

async function main(): Promise<void> {
  if (!process.env.RAILWAY_TOKEN) {
    // Warn but still start, so MCP clients can list tools; the first call will error clearly.
    console.error(
      "WARNING: RAILWAY_TOKEN is not set. Tool calls will fail until you export a token " +
        "from https://railway.com/account/tokens.",
    );
  }
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("railway-mcp-server running via stdio");
}

main().catch((error) => {
  console.error("Fatal error starting railway-mcp-server:", error);
  process.exit(1);
});
