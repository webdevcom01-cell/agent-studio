/**
 * setup-gitmcp.ts
 *
 * One-time setup script: registers the Obsidian vault as a GitMCP server
 * in Agent Studio, then links it to all existing UI agents.
 *
 * Run once after deploying:
 *   npx tsx scripts/setup-gitmcp.ts
 *
 * Requires environment variables:
 *   OBSIDIAN_VAULT_REPO  — e.g. "webdevcom01-cell/agent-studio-vault"
 *   DATABASE_URL         — Prisma DB connection string
 */

import { config } from "dotenv";
import { resolve } from "path";

// Load .env.local first (local overrides), then fall back to .env
config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

import { PrismaClient } from "../src/generated/prisma";

const prisma = new PrismaClient();

const VAULT_REPO = process.env.OBSIDIAN_VAULT_REPO;
if (!VAULT_REPO) {
  console.error("❌  OBSIDIAN_VAULT_REPO env var not set");
  process.exit(1);
}

const GITMCP_URL = `https://gitmcp.io/${VAULT_REPO}`;

// Set to true to link ALL user agents, false to use UI_AGENT_NAMES list
const LINK_ALL_AGENTS = true;
// Fallback list (used only when LINK_ALL_AGENTS = false)
const UI_AGENT_NAMES = ["hook-writer", "content-repurposer", "trend-intelligence"];

async function main() {
  console.log(`\n🔗  GitMCP setup — vault: ${VAULT_REPO}`);
  console.log(`    MCP URL: ${GITMCP_URL}\n`);

  // ── 1. Find the owner user ────────────────────────────────────────────────
  const user = await prisma.user.findFirst({
    orderBy: { createdAt: "asc" },
    select: { id: true, email: true },
  });

  if (!user) {
    console.error("❌  No users found in database");
    process.exit(1);
  }
  console.log(`👤  Owner user: ${user.email} (${user.id})`);

  // ── 2. Upsert GitMCP server ───────────────────────────────────────────────
  const existing = await prisma.mCPServer.findFirst({
    where: { userId: user.id, url: GITMCP_URL },
  });

  let mcpServer;
  if (existing) {
    mcpServer = existing;
    console.log(`✅  MCP server already exists: ${mcpServer.id}`);
  } else {
    mcpServer = await prisma.mCPServer.create({
      data: {
        name: "Obsidian Vault (GitMCP)",
        url: GITMCP_URL,
        transport: "SSE",
        userId: user.id,
        enabled: true,
      },
    });
    console.log(`✅  MCP server created: ${mcpServer.id}`);
  }

  // ── 3. Link to each UI agent ──────────────────────────────────────────────
  const agents = await prisma.agent.findMany({
    where: LINK_ALL_AGENTS
      ? { userId: user.id }
      : { userId: user.id, name: { in: UI_AGENT_NAMES } },
    select: { id: true, name: true },
  });

  console.log(`\n🤖  Found ${agents.length} agents to link:`);

  for (const agent of agents) {
    const alreadyLinked = await prisma.agentMCPServer.findFirst({
      where: { agentId: agent.id, mcpServerId: mcpServer.id },
    });

    if (alreadyLinked) {
      console.log(`   ↳ ${agent.name} — already linked`);
      continue;
    }

    await prisma.agentMCPServer.create({
      data: {
        agentId: agent.id,
        mcpServerId: mcpServer.id,
        enabledTools: [],
      },
    });
    console.log(`   ↳ ${agent.name} — linked ✅`);
  }

  if (!LINK_ALL_AGENTS) {
    const missing = UI_AGENT_NAMES.filter(
      (n) => !agents.find((a) => a.name === n)
    );
    if (missing.length) {
      console.log(`\n⚠️   Agents not found (create them in Agent Studio UI first):`);
      missing.forEach((n) => console.log(`   - ${n}`));
    }
  }

  console.log("\n🎉  Done! Agents can now read from your Obsidian vault.\n");
}

main()
  .catch((e) => {
    console.error("❌  Setup failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
