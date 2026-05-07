/**
 * Main Prisma seed file.
 * Run via: npx tsx prisma/seed.ts
 * Or: npm run db:seed
 */

import { seedPipelineTemplates } from "./seed-pipeline-templates";

async function main() {
  console.log("Starting database seed...\n");

  await seedPipelineTemplates();

  console.log("\n✅ Database seeded successfully");
}

main().catch((e) => {
  console.error("Seed failed:", e);
  process.exit(1);
});
