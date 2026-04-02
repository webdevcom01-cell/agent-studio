/**
 * Bulk-switch all agent flows from claude-sonnet-4-6 → deepseek-chat
 * Root cause: Anthropic API returning 529 Overloaded (low rate-limit tier)
 */

const { Client } = require("pg");

const DIRECT_URL = "postgresql://postgres.elegzqtlqkcvqhpklykl:WebDevCom01@aws-1-eu-west-1.pooler.supabase.com:5432/postgres";
const OLD_MODEL = "claude-sonnet-4-6";
const NEW_MODEL = "deepseek-chat";

async function run() {
  const client = new Client({ connectionString: DIRECT_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log("✅ Connected to database");

  // 1. Get all flows
  const { rows: flows } = await client.query(
    `SELECT f.id, f.content, a.name, a.id as agent_id FROM "Flow" f JOIN "Agent" a ON a.id = f."agentId"`
  );
  console.log(`📋 Found ${flows.length} flows`);

  let updatedFlows = 0;
  let updatedNodeCount = 0;

  for (const flow of flows) {
    const content = flow.content;
    if (!content || !content.nodes || !Array.isArray(content.nodes)) continue;

    let changed = false;
    const newNodes = content.nodes.map((node) => {
      if (node.type === "ai_response" && node.data && node.data.model === OLD_MODEL) {
        changed = true;
        updatedNodeCount++;
        return { ...node, data: { ...node.data, model: NEW_MODEL } };
      }
      return node;
    });

    if (changed) {
      const updatedContent = { ...content, nodes: newNodes };
      await client.query(
        `UPDATE "Flow" SET content = $1, "updatedAt" = NOW() WHERE id = $2`,
        [JSON.stringify(updatedContent), flow.id]
      );
      updatedFlows++;
      console.log(`  ✅ ${flow.name}`);
    }
  }

  // 2. Update Agent.model field
  const res = await client.query(
    `UPDATE "Agent" SET model = $1, "updatedAt" = NOW() WHERE model = $2`,
    [NEW_MODEL, OLD_MODEL]
  );
  console.log(`\n📦 Agent.model updated: ${res.rowCount} agents`);
  console.log(`🔄 Flows updated: ${updatedFlows} | Nodes switched: ${updatedNodeCount}`);
  console.log(`\n🎉 All agents now use ${NEW_MODEL}. Anthropic can be re-enabled later.`);

  await client.end();
}

run().catch((err) => {
  console.error("❌ Error:", err.message);
  process.exit(1);
});
