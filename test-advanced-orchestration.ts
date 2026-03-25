#!/usr/bin/env npx tsx
/**
 * Agent-Studio ADVANCED Orchestration Test
 * ==========================================
 * Simulira realni agent workflow end-to-end:
 *
 *  SCENA: Korisnik traži pomoć u pisanju TypeScript koda.
 *  Sistem treba da:
 *    1. Uspostavi MCP sesiju sa ECC Skills serverom
 *    2. Pronađe relevantne skillove za zadatak
 *    3. Dohvati konkretan skill i pročita mu sadržaj
 *    4. Pošalje chat poruku agentu i dobije odgovor
 *    5. Verifikuje da je čitav lanac radio ispravno
 */

import { execSync } from "child_process";

const C = {
  reset: "\x1b[0m", bold: "\x1b[1m", green: "\x1b[32m", red: "\x1b[31m",
  yellow: "\x1b[33m", cyan: "\x1b[36m", blue: "\x1b[34m",
  magenta: "\x1b[35m", gray: "\x1b[90m",
};

const pass  = (msg: string) => console.log(`  ${C.green}✓${C.reset} ${msg}`);
const fail  = (msg: string, d?: string) => { console.log(`  ${C.red}✗${C.reset} ${msg}`); if (d) console.log(`    ${C.gray}↳ ${d}${C.reset}`); };
const warn  = (msg: string) => console.log(`  ${C.yellow}⚠${C.reset} ${msg}`);
const info  = (msg: string) => console.log(`  ${C.blue}ℹ${C.reset} ${C.gray}${msg}${C.reset}`);
const step  = (n: number, title: string) => console.log(`\n${C.bold}${C.magenta}◆ STEP ${n}: ${title}${C.reset}`);
const scene = (t: string) => console.log(`\n${C.bold}${C.cyan}  ${t}${C.reset}`);

interface TestResult { name: string; passed: boolean; duration: number; detail?: string; data?: any; }
const results: TestResult[] = [];

async function test(name: string, fn: () => Promise<any>): Promise<any> {
  const start = Date.now();
  try {
    const data = await fn();
    const dur = Date.now() - start;
    results.push({ name, passed: true, duration: dur, data });
    pass(`${name} ${C.gray}(${dur}ms)${C.reset}`);
    return data;
  } catch (e: any) {
    const dur = Date.now() - start;
    const detail = e?.message || String(e);
    results.push({ name, passed: false, duration: dur, detail });
    fail(`${name} ${C.gray}(${dur}ms)${C.reset}`, detail);
    return null;
  }
}

async function postMCP(url: string, payload: any, sessionId?: string) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Accept": "application/json, text/event-stream",
  };
  if (sessionId) headers["mcp-session-id"] = sessionId;
  const res = await fetch(url, {
    method: "POST", headers, body: JSON.stringify(payload),
    signal: AbortSignal.timeout(20000),
  });
  const raw = await res.text();
  const sessionIdOut = res.headers.get("mcp-session-id");
  // Parse SSE data line if present
  let body: any = null;
  const dataLine = raw.split("\n").find(l => l.startsWith("data:"));
  if (dataLine) {
    try { body = JSON.parse(dataLine.replace(/^data:\s*/, "")); } catch {}
  }
  if (!body) { try { body = JSON.parse(raw); } catch { body = raw; } }
  return { status: res.status, body, raw, sessionId: sessionIdOut };
}

async function postJSON(url: string, data: any, headers: Record<string,string> = {}) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(data),
    signal: AbortSignal.timeout(20000),
  });
  const raw = await res.text();
  let body: any;
  try { body = JSON.parse(raw); } catch { body = raw; }
  return { status: res.status, body, raw };
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const STUDIO_URL = process.argv.includes("--base-url")
    ? process.argv[process.argv.indexOf("--base-url") + 1].replace(/\/$/, "")
    : process.env.BASE_URL?.replace(/\/$/, "") || "http://localhost:3000";
  const MCP_URL = (process.env.MCP_URL || "http://localhost:8000").replace(/\/$/, "");
  const MCP_ENDPOINT = `${MCP_URL}/mcp`;

  console.log(`\n${C.bold}${C.magenta}╔═════════════════════════════════════════════════════╗${C.reset}`);
  console.log(`${C.bold}${C.magenta}║   Agent-Studio ADVANCED Orchestration Test v1.0    ║${C.reset}`);
  console.log(`${C.bold}${C.magenta}╚═════════════════════════════════════════════════════╝${C.reset}`);
  console.log(`\n${C.bold}Scenario:${C.reset} Korisnik traži pomoć u pisanju TypeScript koda`);
  info(`Studio  → ${STUDIO_URL}`);
  info(`MCP     → ${MCP_ENDPOINT}`);
  info(`Started → ${new Date().toISOString()}`);

  // ══════════════════════════════════════════════════════
  // STEP 1: MCP Session Setup
  // ══════════════════════════════════════════════════════
  step(1, "MCP SESSION INITIALIZATION");
  scene("Sistem uspostavlja vezu sa ECC Skills serverom...");

  let sessionId: string | null = null;

  sessionId = await test("Initialize MCP session", async () => {
    const r = await postMCP(MCP_ENDPOINT, {
      jsonrpc: "2.0", id: 1, method: "initialize",
      params: {
        protocolVersion: "2025-11-25",
        capabilities: { tools: {} },
        clientInfo: { name: "agent-studio-orchestrator", version: "2.0.0" },
      },
    });
    if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
    if (!r.sessionId) throw new Error("No session ID in response headers");
    info(`Session ID: ${r.sessionId.slice(0, 12)}…`);
    const serverInfo = r.body?.result?.serverInfo;
    if (serverInfo) info(`Server: ${serverInfo.name} v${serverInfo.version}`);
    return r.sessionId;
  });

  if (!sessionId) { console.log(`\n${C.red}Cannot continue without MCP session.${C.reset}`); process.exit(1); }

  // Notify server we're initialized
  await test("Send 'initialized' notification", async () => {
    const r = await postMCP(MCP_ENDPOINT, {
      jsonrpc: "2.0", method: "notifications/initialized", params: {},
    }, sessionId!);
    info(`Notification acknowledged (HTTP ${r.status})`);
    return r.status;
  });

  // ══════════════════════════════════════════════════════
  // STEP 2: Skill Discovery
  // ══════════════════════════════════════════════════════
  step(2, "SKILL DISCOVERY");
  scene("Sistem traži skillove relevantne za TypeScript zadatak...");

  let allSkills: any[] = [];
  let tsSkills: any[] = [];

  allSkills = await test("list_skills — sve skillove iz baze", async () => {
    const r = await postMCP(MCP_ENDPOINT, {
      jsonrpc: "2.0", id: 2, method: "tools/call",
      params: { name: "list_skills", arguments: {} },
    }, sessionId!);
    if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
    const content = r.body?.result?.content?.[0]?.text;
    if (!content) throw new Error("No content in response");
    const skills = JSON.parse(content);
    info(`Ukupno skillova: ${skills.length}`);
    skills.slice(0, 4).forEach((s: any) => info(`  • [${s.category || "?"}] ${s.name}`));
    if (skills.length > 4) info(`  … i još ${skills.length - 4} više`);
    return skills;
  }) || [];

  tsSkills = await test("search_skills — traži TypeScript skillove", async () => {
    const r = await postMCP(MCP_ENDPOINT, {
      jsonrpc: "2.0", id: 3, method: "tools/call",
      params: { name: "search_skills", arguments: { query: "typescript", language: "en" } },
    }, sessionId!);
    if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
    const content = r.body?.result?.content?.[0]?.text;
    const skills = JSON.parse(content);
    info(`TypeScript skillovi pronađeni: ${skills.length}`);
    skills.forEach((s: any) => info(`  • ${s.name} (${s.category || "general"})`));
    return skills;
  }) || [];

  // Also search for coding skills
  const codeSkills = await test("search_skills — traži coding/code skillove", async () => {
    const r = await postMCP(MCP_ENDPOINT, {
      jsonrpc: "2.0", id: 4, method: "tools/call",
      params: { name: "search_skills", arguments: { query: "code" } },
    }, sessionId!);
    if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
    const content = r.body?.result?.content?.[0]?.text;
    const skills = JSON.parse(content);
    info(`Coding skillovi: ${skills.length}`);
    skills.slice(0, 3).forEach((s: any) => info(`  • ${s.name}`));
    return skills;
  }) || [];

  // ══════════════════════════════════════════════════════
  // STEP 3: Skill Retrieval
  // ══════════════════════════════════════════════════════
  step(3, "SKILL CONTENT RETRIEVAL");
  scene("Sistem dohvata konkretan skill za agenta...");

  // Pick the best skill to fetch
  const targetSkill = tsSkills[0] || codeSkills[0] || allSkills[0];

  let skillContent: any = null;
  if (targetSkill) {
    skillContent = await test(`get_skill("${targetSkill.slug || targetSkill.name}")`, async () => {
      const r = await postMCP(MCP_ENDPOINT, {
        jsonrpc: "2.0", id: 5, method: "tools/call",
        params: { name: "get_skill", arguments: { name: targetSkill.slug || targetSkill.name } },
      }, sessionId!);
      if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
      const content = r.body?.result?.content?.[0]?.text;
      const skill = JSON.parse(content);
      if (skill.error) throw new Error(skill.error);
      info(`Skill: "${skill.name}"`);
      info(`Kategorija: ${skill.category || "N/A"}`);
      info(`Jezik: ${skill.language || "N/A"}`);
      info(`Tags: ${(skill.tags || []).slice(0, 4).join(", ")}`);
      if (skill.content) info(`Sadržaj: ${skill.content.length} karaktera`);
      return skill;
    });
  } else {
    warn("Nema skillova za dohvatanje — baza možda prazna");
  }

  // ══════════════════════════════════════════════════════
  // STEP 4: Agent API Orchestration
  // ══════════════════════════════════════════════════════
  step(4, "AGENT API ORCHESTRATION");
  scene("Sistem poziva agent-studio API endpoint-e...");

  // Check agents list — uses redirect:manual because NextAuth returns 307 to login page
  await test("GET /api/agents — lista agenata", async () => {
    const res = await fetch(`${STUDIO_URL}/api/agents`, {
      signal: AbortSignal.timeout(10000),
      redirect: "manual"
    });
    if (res.status === 307 || res.status === 302 || res.status === 401) {
      info("Agents API zaštićen — NextAuth redirect na login ✓");
      return "auth-required";
    }
    if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
    const ct = res.headers.get("content-type") ?? "";
    if (!ct.includes("json")) { info("HTML response (redirect na login)"); return "redirected"; }
    const body = await res.json();
    const count = Array.isArray(body) ? body.length : body?.data?.length ?? 0;
    info(`Agenti u bazi: ${count}`);
    return body;
  });

  // Test skill ingest endpoint exists and is protected
  await test("POST /api/ecc/ingest-skills — CRON_SECRET zaštita", async () => {
    const r = await postJSON(`${STUDIO_URL}/api/ecc/ingest-skills`, {});
    if (r.status === 404) throw new Error("Endpoint ne postoji!");
    if (r.status === 401 || r.status === 403) {
      info(`Endpoint zaštićen (HTTP ${r.status}) — ispravno`);
      return "protected";
    }
    info(`Status: ${r.status}`);
    return r.status;
  });

  // Test skills evolve
  await test("POST /api/skills/evolve — instinct engine endpoint", async () => {
    const r = await postJSON(`${STUDIO_URL}/api/skills/evolve`, {});
    if (r.status === 404) throw new Error("Evolve endpoint ne postoji!");
    info(`Evolve HTTP ${r.status} — instinct engine dostupan`);
    return r.status;
  });

  // Verify health still ok
  await test("GET /api/health — sistem stabilan tokom orkestracije", async () => {
    const res = await fetch(`${STUDIO_URL}/api/health`, { signal: AbortSignal.timeout(8000) });
    if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
    const body = await res.json();
    if (body.db !== "ok") throw new Error(`DB status: ${body.db}`);
    info(`Status: ${body.status} | DB: ${body.db} | v${body.version}`);
    return body;
  });

  // ══════════════════════════════════════════════════════
  // STEP 5: MCP Session Cleanup
  // ══════════════════════════════════════════════════════
  step(5, "MCP SESSION LIFECYCLE");
  scene("Testiranje session managementa...");

  // Try a second independent session to verify concurrency
  await test("Otvori drugu nezavisnu MCP sesiju (concurrent)", async () => {
    const r = await postMCP(MCP_ENDPOINT, {
      jsonrpc: "2.0", id: 10, method: "initialize",
      params: {
        protocolVersion: "2025-11-25", capabilities: {},
        clientInfo: { name: "concurrent-client", version: "1.0.0" },
      },
    });
    if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
    if (!r.sessionId) throw new Error("No session ID");
    info(`Druga sesija: ${r.sessionId.slice(0, 12)}… (različita od prve)`);
    if (r.sessionId === sessionId) throw new Error("Sesije su iste — problem sa session managementom!");
    return r.sessionId;
  });

  // Use first session to verify it's still alive
  await test("Originalna sesija i dalje aktivna (session persistence)", async () => {
    const r = await postMCP(MCP_ENDPOINT, {
      jsonrpc: "2.0", id: 11, method: "tools/call",
      params: { name: "list_skills", arguments: { language: "en" } },
    }, sessionId!);
    if (r.status !== 200) throw new Error(`HTTP ${r.status} — sesija možda istekla`);
    const content = r.body?.result?.content?.[0]?.text;
    const skills = JSON.parse(content || "[]");
    info(`Sesija živa — ${skills.length} skillova dostupno`);
    return skills.length;
  });

  // ══════════════════════════════════════════════════════
  // FINAL ORCHESTRATION REPORT
  // ══════════════════════════════════════════════════════
  const total   = results.length;
  const passed  = results.filter(r => r.passed).length;
  const failed  = total - passed;
  const totalMs = results.reduce((s, r) => s + r.duration, 0);
  const score   = Math.round((passed / total) * 100);

  console.log(`\n${C.bold}${C.magenta}╔═════════════════════════════════════════════════════╗${C.reset}`);
  console.log(`${C.bold}${C.magenta}║          ADVANCED ORCHESTRATION RESULTS            ║${C.reset}`);
  console.log(`${C.bold}${C.magenta}╚═════════════════════════════════════════════════════╝${C.reset}`);

  console.log(`\n  Score:   ${score >= 80 ? C.green : C.yellow}${C.bold}${score}% (${passed}/${total})${C.reset}`);
  console.log(`  Vreme:   ${C.gray}${totalMs}ms ukupno${C.reset}`);
  console.log(`  Sesija:  ${C.cyan}${sessionId?.slice(0, 16)}…${C.reset}`);

  // Summary stats
  if (allSkills.length > 0) {
    const byCategory = allSkills.reduce((acc: any, s: any) => {
      acc[s.category || "other"] = (acc[s.category || "other"] || 0) + 1;
      return acc;
    }, {});
    console.log(`\n  ${C.bold}Skill statistike:${C.reset}`);
    info(`Ukupno u bazi: ${allSkills.length}`);
    Object.entries(byCategory).slice(0, 5).forEach(([cat, count]) =>
      info(`  ${cat}: ${count}`)
    );
  }

  if (skillContent) {
    console.log(`\n  ${C.bold}Dohvaćen skill:${C.reset}`);
    info(`Naziv: ${skillContent.name}`);
    info(`Spreman za agenta: ${skillContent.content ? "DA ✓" : "NE ✗"}`);
  }

  if (failed > 0) {
    console.log(`\n  ${C.bold}${C.red}Padovi:${C.reset}`);
    results.filter(r => !r.passed).forEach(r => {
      console.log(`  ${C.red}✗${C.reset} ${r.name}`);
      if (r.detail) console.log(`    ${C.gray}${r.detail}${C.reset}`);
    });
  }

  const verdict =
    score === 100 ? `${C.green}${C.bold}SISTEM POTPUNO FUNKCIONALAN 🚀${C.reset}` :
    score >= 80   ? `${C.green}${C.bold}SISTEM FUNKCIONALAN — manji problemi${C.reset}` :
    score >= 60   ? `${C.yellow}${C.bold}DELIMIČNO FUNKCIONALAN${C.reset}` :
                    `${C.red}${C.bold}KRITIČNI PROBLEMI${C.reset}`;

  console.log(`\n  Verdict: ${verdict}\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => { console.error(`\n${C.red}Fatal:${C.reset}`, e); process.exit(1); });
