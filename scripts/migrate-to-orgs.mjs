#!/usr/bin/env node
/**
 * Data Migration: Single-user → Organization-based multi-tenancy
 *
 * For each existing user:
 *  1. Create a personal Organization (name = user's name, slug = user's email prefix)
 *  2. Add user as OWNER of that organization
 *  3. Link all user's agents to the new organization
 *
 * Safe to run multiple times (idempotent — checks for existing org membership).
 *
 * Usage: node scripts/migrate-to-orgs.mjs
 */

import { PrismaClient } from "../src/generated/prisma/index.js";

const prisma = new PrismaClient();

async function main() {
  console.log("Starting organization migration...");

  const users = await prisma.user.findMany({
    select: { id: true, name: true, email: true },
  });

  console.log(`Found ${users.length} users to migrate`);

  let created = 0;
  let skipped = 0;

  for (const user of users) {
    // Check if user already has an org membership
    const existingMembership = await prisma.organizationMember.findFirst({
      where: { userId: user.id },
    });

    if (existingMembership) {
      skipped++;
      continue;
    }

    const slug = (user.email?.split("@")[0] ?? user.id)
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .slice(0, 50);

    // Ensure unique slug
    const existingOrg = await prisma.organization.findUnique({
      where: { slug },
    });

    const finalSlug = existingOrg ? `${slug}-${user.id.slice(0, 6)}` : slug;

    const org = await prisma.organization.create({
      data: {
        name: user.name ?? `${user.email}'s Workspace`,
        slug: finalSlug,
        plan: "FREE",
      },
    });

    await prisma.organizationMember.create({
      data: {
        userId: user.id,
        organizationId: org.id,
        role: "OWNER",
      },
    });

    // Link all user's agents to the new org
    await prisma.agent.updateMany({
      where: { userId: user.id },
      data: { organizationId: org.id },
    });

    const agentCount = await prisma.agent.count({
      where: { userId: user.id },
    });

    console.log(`  ✓ ${user.email}: org "${org.name}" (${agentCount} agents)`);
    created++;
  }

  console.log(`\nMigration complete: ${created} orgs created, ${skipped} users already migrated`);
}

main()
  .catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
