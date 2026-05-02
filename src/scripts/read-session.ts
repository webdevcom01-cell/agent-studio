import { prisma } from "@/lib/prisma";

async function main() {
const id = process.argv[2] ?? "cmokgu2g1000hpbyx4y8l4wpj";

const conv = await prisma.conversation.findUnique({
  where: { id },
  select: { status: true, variables: true },
});

if (!conv) {
  console.log("NOT FOUND:", id);
  process.exit(1);
}

const vars = conv.variables as Record<string, unknown>;
console.log("RAW KEYS:", Object.keys(vars ?? {}));
console.log("RAW VARS (first 2000):", JSON.stringify(vars).slice(0, 2000));

const r = vars?.pipelineResult as Record<string, unknown> | undefined;

if (!r) {
  console.log("No pipelineResult.");
  process.exit(0);
}

console.log("SUMMARY:", r.summary);
console.log("SLUG:", r.slug);
console.log("RUN ID:", r.runId);

const files = r.files as Array<{ path: string; content: string }> | undefined;
for (const f of files ?? []) {
  console.log("\n===", f.path, "===");
  console.log(f.content);
}

await prisma.$disconnect();
}

main().catch(console.error);
