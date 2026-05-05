/**
 * check-ecc-status.ts — shows which agents have ECC learning enabled/disabled
 * Run: npx tsx scripts/check-ecc-status.ts
 */
import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

import { PrismaClient } from "../src/generated/prisma";
const prisma = new PrismaClient();

async function main() {
  const agents = await prisma.agent.findMany({
    select: { id: true, name: true, eccEnabled: true },
    orderBy: { name: "asc" },
  });

  const on  = agents.filter(a => a.eccEnabled);
  const off = agents.filter(a => !a.eccEnabled);

  console.log(`\n📊  ECC Status — ${agents.length} agenata ukupno\n`);
  console.log(`✅  Uče (eccEnabled ON)  — ${on.length} agenata:`);
  on.forEach(a  => console.log(`   ✅ ${a.name}`));
  console.log(`\n❌  Ne uče (eccEnabled OFF) — ${off.length} agenata:`);
  off.forEach(a => console.log(`   ❌ ${a.name}  [id: ${a.id}]`));
  console.log("");
}
main().finally(() => prisma.$disconnect());
