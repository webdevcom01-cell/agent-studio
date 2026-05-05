/**
 * enable-ecc-all.ts — enables ECC learning on ALL agents
 * Run: npx tsx scripts/enable-ecc-all.ts
 */
import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

import { PrismaClient } from "../src/generated/prisma";
const prisma = new PrismaClient();

async function main() {
  const result = await prisma.agent.updateMany({
    where: { eccEnabled: false },
    data: { eccEnabled: true },
  });

  console.log(`\n✅  ECC aktiviran na ${result.count} agenata.\n`);

  const total = await prisma.agent.count({ where: { eccEnabled: true } });
  console.log(`📊  Ukupno agenata koji sada uče: ${total}\n`);
}
main().finally(() => prisma.$disconnect());
