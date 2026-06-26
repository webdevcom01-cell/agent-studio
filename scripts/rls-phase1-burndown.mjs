// RLS Phase 1 burn-down: counts tenant-scoped Prisma sites still on a bare client.
// Covers THREE blind spots the original single-line scan missed:
//   1. multi-line ORM calls  (prisma\n  .model\n  .findMany)
//   2. bare-client raw SQL   (prisma.$queryRaw / $executeRaw ...)  outside org context
//   3. interactive bare-client transactions (prisma.$transaction(...))
// Run: node scripts/rls-phase1-burndown.mjs   (target: TENANT 0, RAW non-exempt 0, TX 0)
import fs from 'node:fs';
import path from 'node:path';
const ROOT = 'src';
const TENANT = new Set(['Agent','AgentBudget','AgentCallLog','AgentCard','AgentExecution','AgentGoalLink','AgentMCPServer','AgentMemory','AgentPermissionGrant','AgentSdkSession','AgentSkillPermission','AnalyticsEvent','ApprovalPolicy','BudgetAlert','CompanyMission','Conversation','CostEvent','Department','EvalResult','EvalRun','EvalSuite','EvalTestCase','Flow','FlowDeployment','FlowSchedule','FlowTrace','FlowVersion','Goal','HeartbeatConfig','HeartbeatContext','HeartbeatRun','HumanApprovalRequest','Instinct','Invitation','KBChunk','KBSource','KnowledgeBase','ManagedAgentTask','Message','OrganizationMember','PipelineMemory','PipelineRun','PolicyDecision','ScheduledExecution','Template','WebhookConfig','WebhookDeadLetter','WebhookExecution']);

// Files where bare-client raw SQL / transactions are intentional, global infra
// (no single org context applies). Documented in the enforcement-prep notes.
const RAW_EXEMPT = new Set([
  'src/lib/prisma.ts',          // client bootstrap + set_config plumbing
  'src/lib/auth.ts',            // NextAuth adapter — pre-session, no org yet
  'src/app/api/health/route.ts',// liveness probe — SELECT 1
  'src/app/api/skills/route.ts',// global skills catalog — cross-org by design
]);

const schema = fs.readFileSync('prisma/schema.prisma', 'utf8');
const models = [...schema.matchAll(/^model\s+([A-Za-z0-9_]+)\s*\{/mg)].map(m => m[1]);
const acc = n => n[0].toLowerCase() + n.slice(1);
const accToModel = new Map(models.map(m => [acc(m), m]));
const OPS = 'findMany|findUnique|findUniqueOrThrow|findFirst|findFirstOrThrow|create|createMany|createManyAndReturn|update|updateMany|upsert|delete|deleteMany|count|aggregate|groupBy';

function walk(d){let out=[];for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name);if(e.isDirectory()){if(/__tests__|generated/.test(p))continue;out=out.concat(walk(p));}else if(/\.(ts|tsx)$/.test(e.name)&&!/\.test\.ts/.test(e.name)){out.push(p);}}return out;}
const files = walk(ROOT);

// \s* around the dots makes the scan multi-line aware. Only bare read/write
// clients (prisma, prismaRead) are flagged — prismaAdmin is BYPASSRLS by design.
const reOrm = new RegExp('\\b(prisma|prismaRead)\\s*\\.\\s*([a-zA-Z0-9_]+)\\s*\\.\\s*(?:' + OPS + ')\\b', 'g');
const reRaw = /\b(prisma|prismaRead)\s*\.\s*\$(queryRaw|executeRaw|queryRawUnsafe|executeRawUnsafe)\b/g;
const reTx  = /\b(prisma|prismaRead)\s*\.\s*\$transaction\b/g;

const perModel = {}, perFileTenant = {}, globalHits = {};
let totalRawTenant = 0, totalRawGlobal = 0, unknown = 0;
const rawSites = [], txSites = [];

for (const f of files) {
  const txt = fs.readFileSync(f, 'utf8');
  let m;
  while ((m = reOrm.exec(txt))) {
    const model = accToModel.get(m[2]);
    if (!model) { unknown++; continue; }
    if (TENANT.has(model)) { totalRawTenant++; perModel[model] = (perModel[model]||0)+1; perFileTenant[f] = (perFileTenant[f]||0)+1; }
    else { totalRawGlobal++; globalHits[model] = (globalHits[model]||0)+1; }
  }
  while ((m = reRaw.exec(txt))) rawSites.push(f);
  while ((m = reTx.exec(txt)))  txSites.push(f);
}

const rawNonExempt = rawSites.filter(f => !RAW_EXEMPT.has(f));
const txNonExempt  = txSites.filter(f => !RAW_EXEMPT.has(f));

console.log('FILES scanned:', files.length);
console.log('RAW prisma.<model> sites — TENANT:', totalRawTenant, ' GLOBAL:', totalRawGlobal, ' unrecognized-accessor:', unknown);
console.log('BARE raw-SQL ($queryRaw/$executeRaw) — non-exempt:', rawNonExempt.length, ' exempt:', rawSites.length - rawNonExempt.length);
console.log('BARE $transaction — non-exempt:', txNonExempt.length, ' exempt:', txSites.length - txNonExempt.length);

console.log('\n== TENANT-model raw sites per model (migration candidates) ==');
for (const [m, c] of Object.entries(perModel).sort((a,b)=>b[1]-a[1])) console.log(String(c).padStart(4), m);
console.log('\n== TOP 20 files by TENANT raw sites ==');
for (const [f, c] of Object.entries(perFileTenant).sort((a,b)=>b[1]-a[1]).slice(0,20)) console.log(String(c).padStart(4), f);
if (rawNonExempt.length) { console.log('\n== BARE raw-SQL sites (NON-EXEMPT — must wrap) =='); for (const f of [...new Set(rawNonExempt)]) console.log('    ', f); }
if (txNonExempt.length)  { console.log('\n== BARE $transaction sites (NON-EXEMPT — must wrap) =='); for (const f of [...new Set(txNonExempt)]) console.log('    ', f); }
console.log('\n== GLOBAL-model raw sites (leave as-is) top 12 ==');
for (const [m, c] of Object.entries(globalHits).sort((a,b)=>b[1]-a[1]).slice(0,12)) console.log(String(c).padStart(4), m);
