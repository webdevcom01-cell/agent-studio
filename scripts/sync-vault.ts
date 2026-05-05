/**
 * sync-vault.ts
 *
 * One-time (and repeatable) script: syncs all skills and instincts
 * from the database to the Obsidian vault via GitHub API.
 *
 * Run from project root:
 *   npx tsx scripts/sync-vault.ts
 *
 * Requires .env.local with:
 *   OBSIDIAN_VAULT_REPO, OBSIDIAN_GITHUB_TOKEN, DATABASE_URL
 */

import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

import { PrismaClient } from "../src/generated/prisma";
import { createObsidianAdapter, isObsidianConfigured } from "../src/lib/ecc/obsidian-adapter";

const prisma = new PrismaClient();

async function main() {
  if (!isObsidianConfigured()) {
    console.error("❌  Vault not configured — set OBSIDIAN_VAULT_REPO and OBSIDIAN_GITHUB_TOKEN");
    process.exit(1);
  }

  const adapter = createObsidianAdapter();
  const connected = await adapter.isConnected();
  if (!connected) {
    console.error("❌  Cannot connect to vault — check OBSIDIAN_GITHUB_TOKEN and repo name");
    process.exit(1);
  }

  console.log(`\n🔗  Vault: ${process.env.OBSIDIAN_VAULT_REPO}`);
  console.log(`    GitMCP: ${adapter.getGitMCPUrl()}\n`);

  let synced = 0;
  let errors = 0;

  // ── Skills ──────────────────────────────────────────────────────────────────
  const skills = await prisma.skill.findMany({
    select: { slug: true, name: true, content: true, tags: true },
    take: 100,
  });

  console.log(`📚  Syncing ${skills.length} skills...`);
  for (const skill of skills) {
    try {
      const path = await adapter.syncSkillToVault(skill.slug, skill.content, skill.tags);
      console.log(`   ✅  ${skill.name} → ${path}`);
      synced++;
    } catch (err) {
      console.log(`   ❌  ${skill.name}: ${err instanceof Error ? err.message : String(err)}`);
      errors++;
    }
  }

  // ── Instincts ───────────────────────────────────────────────────────────────
  const instincts = await prisma.instinct.findMany({
    where: { promotedToSkillId: null },
    select: { name: true, description: true, confidence: true },
    take: 100,
  });

  console.log(`\n🧠  Syncing ${instincts.length} instincts...`);
  for (const inst of instincts) {
    try {
      const path = await adapter.syncInstinctToVault(inst.name, inst.description, inst.confidence);
      console.log(`   ✅  ${inst.name} → ${path}`);
      synced++;
    } catch (err) {
      console.log(`   ❌  ${inst.name}: ${err instanceof Error ? err.message : String(err)}`);
      errors++;
    }
  }

  console.log(`\n${errors === 0 ? "🎉" : "⚠️"}  Done — ${synced} synced, ${errors} errors\n`);
}

main()
  .catch((e) => { console.error("❌  Fatal:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
