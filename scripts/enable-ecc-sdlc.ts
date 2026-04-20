/**
 * enable-ecc-sdlc.ts
 *
 * One-off script: enable ECC (instinct extraction) on the two SDLC pipeline agents.
 * Without this flag, AgentExecution records are created but Instinct extraction never runs.
 *
 * Run from project root:
 *   npx tsx scripts/enable-ecc-sdlc.ts
 *   -- or --
 *   pnpm tsx scripts/enable-ecc-sdlc.ts
 *
 * Requires: DATABASE_URL set in environment (or .env.local via dotenv).
 */

import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma";

const prisma = new PrismaClient();

const SDLC_AGENT_IDS = [
  "cmnp8ebuz0001p2011xxxppae", // 🤖 SDLC Autonomous Pipeline
  "cmneehl5h0021n1018gmldgte", // 🎯 SDLC Pipeline Orchestrator
];

async function main(): Promise<void> {
  console.log("Enabling eccEnabled for SDLC agents...\n");

  const result = await prisma.agent.updateMany({
    where: { id: { in: SDLC_AGENT_IDS } },
    data: { eccEnabled: true },
  });

  console.log(`✅ Updated ${result.count} agent(s)\n`);

  // Verify
  const agents = await prisma.agent.findMany({
    where: { id: { in: SDLC_AGENT_IDS } },
    select: { id: true, name: true, eccEnabled: true },
  });

  for (const a of agents) {
    const status = a.eccEnabled ? "✅" : "❌";
    console.log(`${status} ${a.name} (${a.id}) — eccEnabled=${a.eccEnabled}`);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
