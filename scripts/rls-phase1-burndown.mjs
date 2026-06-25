// RLS Phase 1 burn-down: counts raw prisma.<tenantModel> sites still on the bare client.
// Run: node scripts/rls-phase1-burndown.mjs   (target: TENANT 0)
import fs from 'node:fs';
import path from 'node:path';
const ROOT='src';
const TENANT=new Set(['Agent','AgentBudget','AgentCallLog','AgentCard','AgentExecution','AgentGoalLink','AgentMCPServer','AgentMemory','AgentPermissionGrant','AgentSdkSession','AgentSkillPermission','AnalyticsEvent','ApprovalPolicy','BudgetAlert','CompanyMission','Conversation','CostEvent','Department','EvalResult','EvalRun','EvalSuite','EvalTestCase','Flow','FlowDeployment','FlowSchedule','FlowTrace','FlowVersion','Goal','HeartbeatConfig','HeartbeatContext','HeartbeatRun','HumanApprovalRequest','Instinct','Invitation','KBChunk','KBSource','KnowledgeBase','ManagedAgentTask','Message','OrganizationMember','PipelineMemory','PipelineRun','PolicyDecision','ScheduledExecution','Template','WebhookConfig','WebhookDeadLetter','WebhookExecution']);
// model names from schema
const schema=fs.readFileSync('prisma/schema.prisma','utf8');
const models=[...schema.matchAll(/^model\s+([A-Za-z0-9_]+)\s*\{/mg)].map(m=>m[1]);
const acc=n=>n[0].toLowerCase()+n.slice(1);
const accToModel=new Map(models.map(m=>[acc(m),m]));
const OPS='findMany|findUnique|findUniqueOrThrow|findFirst|findFirstOrThrow|create|createMany|update|updateMany|upsert|delete|deleteMany|count|aggregate|groupBy';
// walk files
function walk(d){let out=[];for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name);if(e.isDirectory()){if(/__tests__|generated/.test(p))continue;out=out.concat(walk(p));}else if(/\.(ts|tsx)$/.test(e.name)&&!/\.test\.ts/.test(e.name)){out.push(p);}}return out;}
const files=walk(ROOT);
const re=new RegExp('\\b(prisma|prismaRead)\\.([a-zA-Z0-9_]+)\\.(?:'+OPS+')\\b','g');
const perModel={}, perFileTenant={}, globalHits={};
let totalRawTenant=0, totalRawGlobal=0, unknown=0;
for(const f of files){
  const txt=fs.readFileSync(f,'utf8');
  let m;
  while((m=re.exec(txt))){
    const a=m[2]; const model=accToModel.get(a);
    if(!model){unknown++;continue;}
    if(TENANT.has(model)){ totalRawTenant++; perModel[model]=(perModel[model]||0)+1; perFileTenant[f]=(perFileTenant[f]||0)+1; }
    else { totalRawGlobal++; globalHits[model]=(globalHits[model]||0)+1; }
  }
}
console.log('FILES scanned:',files.length);
console.log('RAW prisma.<model> sites — TENANT:',totalRawTenant,' GLOBAL:',totalRawGlobal,' unrecognized-accessor:',unknown);
console.log('\n== TENANT-model raw sites per model (migration candidates) ==');
for(const [m,c] of Object.entries(perModel).sort((a,b)=>b[1]-a[1])) console.log(String(c).padStart(4),m);
console.log('\n== TOP 20 files by TENANT raw sites ==');
for(const [f,c] of Object.entries(perFileTenant).sort((a,b)=>b[1]-a[1]).slice(0,20)) console.log(String(c).padStart(4),f);
console.log('\n== GLOBAL-model raw sites (leave as-is) top 12 ==');
for(const [m,c] of Object.entries(globalHits).sort((a,b)=>b[1]-a[1]).slice(0,12)) console.log(String(c).padStart(4),m);
