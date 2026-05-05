/**
 * generate-dashboard.ts
 * Generates a self-contained HTML monitoring dashboard from live DB data.
 * Run: npx tsx scripts/generate-dashboard.ts
 * Output: reports/agent-dashboard.html  (open in any browser)
 */
import { config } from "dotenv";
import { resolve } from "path";
import * as fs from "fs";
config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

import { PrismaClient } from "../src/generated/prisma";
const prisma = new PrismaClient();

async function main() {
  const [agents, pipelineRuns, instincts, skills] = await Promise.all([
    prisma.agent.findMany({ select: { id: true, name: true, eccEnabled: true } }),
    prisma.pipelineRun.findMany({
      select: { status: true, taskType: true, complexity: true,
                startedAt: true, completedAt: true, agentId: true, prUrl: true },
      orderBy: { createdAt: "desc" }, take: 500,
    }),
    prisma.instinct.findMany({
      select: { agentId: true, confidence: true, createdAt: true, name: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.skill.count(),
  ]);

  const totalAgents    = agents.length;
  const learningAgents = agents.filter(a => a.eccEnabled).length;
  const totalRuns      = pipelineRuns.length;
  const successRuns    = pipelineRuns.filter(r => r.status === "COMPLETED").length;
  const failedRuns     = pipelineRuns.filter(r => r.status === "FAILED").length;
  const successRate    = totalRuns > 0 ? Math.round((successRuns / totalRuns) * 100) : 0;
  const withPR         = pipelineRuns.filter(r => r.prUrl).length;
  const totalInstincts = instincts.length;
  const avgConfidence  = instincts.length > 0
    ? (instincts.reduce((s, i) => s + i.confidence, 0) / instincts.length).toFixed(2)
    : "0.00";

  // Top 10 learners by instinct count
  const byAgent: Record<string, { count: number; conf: number; name: string }> = {};
  for (const inst of instincts) {
    if (!byAgent[inst.agentId]) {
      byAgent[inst.agentId] = { count: 0, conf: 0, name: agents.find(a => a.id === inst.agentId)?.name ?? inst.agentId };
    }
    byAgent[inst.agentId].count++;
    byAgent[inst.agentId].conf += inst.confidence;
  }
  const topLearners = Object.values(byAgent)
    .map(a => ({ name: a.name, count: a.count, avgConf: +(a.conf / a.count).toFixed(2) }))
    .sort((a, b) => b.count - a.count).slice(0, 10);

  // Pipeline runs per day (last 30 days)
  const now = new Date();
  const days: string[] = [];
  const byDay: Record<string, { ok: number; fail: number }> = {};
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now); d.setDate(d.getDate() - i);
    const k = d.toISOString().slice(0, 10);
    days.push(k); byDay[k] = { ok: 0, fail: 0 };
  }
  for (const r of pipelineRuns) {
    if (!r.startedAt) continue;
    const k = r.startedAt.toISOString().slice(0, 10);
    if (byDay[k]) {
      if (r.status === "COMPLETED") byDay[k].ok++;
      else if (r.status === "FAILED") byDay[k].fail++;
    }
  }

  // Instincts cumulative by week
  const byWeek: Record<string, number> = {};
  for (const inst of instincts) {
    const w = getWeek(inst.createdAt);
    byWeek[w] = (byWeek[w] ?? 0) + 1;
  }
  let cum = 0;
  const wLabels = Object.keys(byWeek).sort();
  const wData   = wLabels.map(w => { cum += byWeek[w]; return cum; });

  // Task type breakdown
  const taskTypes: Record<string, number> = {};
  for (const r of pipelineRuns) taskTypes[r.taskType] = (taskTypes[r.taskType] ?? 0) + 1;

  // Recent runs
  const recentRuns = pipelineRuns.slice(0, 10).map(r => ({
    task: r.taskType, complexity: r.complexity, status: r.status,
    pr: r.prUrl ?? "", date: r.startedAt?.toISOString().slice(0, 10) ?? "—",
  }));

  const html = buildHTML({
    generatedAt: new Date().toLocaleString(),
    totalAgents, learningAgents, totalRuns, successRate,
    successRuns, failedRuns, withPR, totalInstincts, avgConfidence, skills,
    dayLabels: days.map(d => d.slice(5)),
    okPerDay:   days.map(d => byDay[d].ok),
    failPerDay: days.map(d => byDay[d].fail),
    wLabels, wData,
    taskTypeLabels: Object.keys(taskTypes),
    taskTypeData:   Object.values(taskTypes),
    topLearners, recentRuns,
  });

  fs.mkdirSync("reports", { recursive: true });
  fs.writeFileSync("reports/agent-dashboard.html", html, "utf-8");
  console.log("\n✅  Dashboard generated: reports/agent-dashboard.html");
  console.log("   Open: open reports/agent-dashboard.html\n");
}

function getWeek(date: Date): string {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 4 - (d.getDay() || 7));
  const y = d.getFullYear();
  const w = Math.ceil(((d.getTime() - new Date(y, 0, 1).getTime()) / 86400000 + 1) / 7);
  return `${y}-W${String(w).padStart(2, "0")}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildHTML(d: any): string {
  const badge = (s: string) => {
    const m: Record<string, string> = {
      COMPLETED: "background:#d1fae5;color:#065f46",
      FAILED:    "background:#fee2e2;color:#991b1b",
      RUNNING:   "background:#dbeafe;color:#1e40af",
      PENDING:   "background:#fef9c3;color:#854d0e",
    };
    return `<span style="padding:2px 8px;border-radius:4px;font-size:12px;font-weight:500;${m[s] ?? "background:#f3f4f6;color:#374151"}">${s}</span>`;
  };

  const leaderRows = d.topLearners.map((a: any, i: number) =>
    `<tr>
      <td style="padding:8px 12px;font-size:13px;color:#9ca3af">${i + 1}</td>
      <td style="padding:8px 12px;font-size:13px;font-weight:500">${a.name}</td>
      <td style="padding:8px 12px;font-size:13px;text-align:right;font-weight:600;color:#6366f1">${a.count}</td>
      <td style="padding:8px 12px">
        <div style="display:flex;align-items:center;gap:8px">
          <div style="flex:1;background:#e5e7eb;border-radius:4px;height:5px">
            <div style="background:#8b5cf6;border-radius:4px;height:5px;width:${Math.min(100, a.avgConf * 100)}%"></div>
          </div>
          <span style="font-size:11px;color:#6b7280;min-width:28px">${a.avgConf}</span>
        </div>
      </td>
    </tr>`
  ).join("");

  const recentRows = d.recentRuns.map((r: any) =>
    `<tr>
      <td style="padding:8px 12px;font-size:13px;font-weight:500">${r.task}</td>
      <td style="padding:8px 12px;font-size:12px;color:#94a3b8">${r.complexity}</td>
      <td style="padding:8px 12px">${badge(r.status)}</td>
      <td style="padding:8px 12px;font-size:12px">${r.pr ? `<a href="${r.pr}" style="color:#6366f1;text-decoration:none">View PR</a>` : "—"}</td>
      <td style="padding:8px 12px;font-size:12px;color:#94a3b8">${r.date}</td>
    </tr>`
  ).join("");

  const taskPieData   = JSON.stringify(d.taskTypeData);
  const taskPieLabels = JSON.stringify(d.taskTypeLabels);
  const dayLabels     = JSON.stringify(d.dayLabels);
  const okPerDay      = JSON.stringify(d.okPerDay);
  const failPerDay    = JSON.stringify(d.failPerDay);
  const wLabels       = JSON.stringify(d.wLabels);
  const wData         = JSON.stringify(d.wData);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Agent Studio — Dashboard</title>
<script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js"></script>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#f8fafc;color:#1e293b;padding:24px 32px}
h1{font-size:20px;font-weight:600;color:#0f172a}
.sub{font-size:13px;color:#94a3b8;margin-top:4px;margin-bottom:28px}
.g4{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:24px}
.g2{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px}
.g3{display:grid;grid-template-columns:2fr 1fr;gap:16px;margin-bottom:24px}
.card{background:#fff;border-radius:12px;border:1px solid #e2e8f0;padding:20px}
.num{font-size:30px;font-weight:700;line-height:1;margin-bottom:6px}
.lbl{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:#94a3b8}
.hint{font-size:12px;color:#64748b;margin-top:8px}
.sec{font-size:13px;font-weight:600;color:#475569;margin-bottom:14px}
.chart-box{position:relative;height:200px}
table{width:100%;border-collapse:collapse}
th{padding:7px 12px;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:#94a3b8;text-align:left;border-bottom:1px solid #f1f5f9}
td{padding:7px 12px;border-bottom:1px solid #f8fafc}
tr:last-child td{border-bottom:none}
tr:hover td{background:#f8fafc}
.chip{display:inline-block;padding:2px 10px;border-radius:20px;font-size:11px;font-weight:600}
</style>
</head>
<body>
<h2 style="display:none">Agent Studio monitoring dashboard showing key metrics for ${d.totalAgents} agents</h2>
<h1>Agent Studio &mdash; Monitoring Dashboard</h1>
<p class="sub">Generated ${d.generatedAt} &nbsp;&bull;&nbsp; ${d.totalAgents} agents &nbsp;&bull;&nbsp; ${d.totalRuns} pipeline runs &nbsp;&bull;&nbsp; ${d.skills} skills in vault</p>

<div class="g4">
  <div class="card">
    <div class="lbl">Agents learning</div>
    <div class="num" style="color:#6366f1">${d.learningAgents} <span style="font-size:16px;color:#a5b4fc">/ ${d.totalAgents}</span></div>
    <div class="hint">ECC enabled on all agents</div>
  </div>
  <div class="card">
    <div class="lbl">Pipeline success rate</div>
    <div class="num" style="color:${d.successRate >= 80 ? "#059669" : d.successRate >= 50 ? "#d97706" : "#dc2626"}">${d.successRate}%</div>
    <div class="hint">${d.successRuns} ok &nbsp;/&nbsp; ${d.failedRuns} failed</div>
  </div>
  <div class="card">
    <div class="lbl">Instincts learned</div>
    <div class="num" style="color:#8b5cf6">${d.totalInstincts}</div>
    <div class="hint">avg confidence: ${d.avgConfidence}</div>
  </div>
  <div class="card">
    <div class="lbl">PRs created</div>
    <div class="num" style="color:#0891b2">${d.withPR}</div>
    <div class="hint">from ${d.totalRuns} pipeline runs</div>
  </div>
</div>

<div class="g3">
  <div class="card">
    <p class="sec">Pipeline runs — last 30 days</p>
    <div class="chart-box"><canvas id="c1" role="img" aria-label="Stacked bar chart: pipeline runs per day, success vs failed, last 30 days">Pipeline runs per day.</canvas></div>
  </div>
  <div class="card">
    <p class="sec">Task types</p>
    <div class="chart-box"><canvas id="c2" role="img" aria-label="Pie chart of pipeline task types">Task type distribution.</canvas></div>
  </div>
</div>

<div class="g2">
  <div class="card">
    <p class="sec">Instincts growth (cumulative)</p>
    <div class="chart-box"><canvas id="c3" role="img" aria-label="Line chart: cumulative instincts learned over time">Instincts growth curve.</canvas></div>
  </div>
  <div class="card">
    <p class="sec">Top 10 learners</p>
    ${d.topLearners.length === 0
      ? `<p style="font-size:13px;color:#94a3b8;text-align:center;padding:32px 0">Run some pipelines to see learning data</p>`
      : `<table><thead><tr><th>#</th><th>Agent</th><th>Instincts</th><th>Confidence</th></tr></thead><tbody>${leaderRows}</tbody></table>`}
  </div>
</div>

<div class="card">
  <p class="sec">Recent pipeline runs</p>
  ${d.recentRuns.length === 0
    ? `<p style="font-size:13px;color:#94a3b8;text-align:center;padding:32px 0">No pipeline runs yet</p>`
    : `<table><thead><tr><th>Task type</th><th>Complexity</th><th>Status</th><th>PR</th><th>Date</th></tr></thead><tbody>${recentRows}</tbody></table>`}
</div>

<script>
new Chart(document.getElementById('c1'),{type:'bar',data:{labels:${dayLabels},datasets:[
  {label:'Success',data:${okPerDay},backgroundColor:'#a7f3d0',borderColor:'#059669',borderWidth:1},
  {label:'Failed', data:${failPerDay},backgroundColor:'#fecaca',borderColor:'#dc2626',borderWidth:1}
]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'top',labels:{font:{size:11}}}},
  scales:{x:{stacked:true,ticks:{autoSkip:true,maxTicksLimit:10,font:{size:10}}},y:{stacked:true,ticks:{font:{size:10}}}}}});

new Chart(document.getElementById('c2'),{type:'doughnut',data:{labels:${taskPieLabels},datasets:[{data:${taskPieData},
  backgroundColor:['#6366f1','#8b5cf6','#a78bfa','#c4b5fd','#ddd6fe','#ede9fe']}]},
  options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'right',labels:{font:{size:11}}}}}});

new Chart(document.getElementById('c3'),{type:'line',data:{labels:${wLabels},datasets:[{label:'Instincts',data:${wData},
  fill:true,backgroundColor:'rgba(139,92,246,0.08)',borderColor:'#8b5cf6',tension:0.4,pointRadius:2}]},
  options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},
  scales:{x:{ticks:{autoSkip:true,maxTicksLimit:8,font:{size:10}}},y:{ticks:{font:{size:10}}}}}});
</script>
</body>
</html>`;
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
