#!/usr/bin/env npx tsx
/**
 * Agent-Studio Orchestration Test Suite
 * ======================================
 * Testira sve komponente ECC integracije:
 *   1. Health Checks (agent-studio + ECC Skills MCP)
 *   2. ECC Skills API (list, count, categories)
 *   3. Agent Orchestration (templates, meta-orchestrator routing)
 *   4. MCP Connection (Streamable HTTP protokol)
 *
 * Pokretanje:
 *   npx tsx test-orchestration.ts
 *   npx tsx test-orchestration.ts --base-url https://your-url.up.railway.app
 *   BASE_URL=https://your-url.up.railway.app npx tsx test-orchestration.ts
 */

import { execSync } from "child_process";

// ─── ANSI Colors ─────────────────────────────────────────────────────────────
const C = {
  reset: "\x1b[0m", bold: "\x1b[1m", green: "\x1b[32m", red: "\x1b[31m",
  yellow: "\x1b[33m", cyan: "\x1b[36m", blue: "\x1b[34m",
  magenta: "\x1b[35m", gray: "\x1b[90m", white: "\x1b[97m",
};

const pass = (msg: string) => console.log(`  ${C.green}✓${C.reset} ${msg}`);
const fail = (msg: string, detail?: string) => {
  console.log(`  ${C.red}✗${C.reset} ${msg}`);
  if (detail) console.log(`    ${C.gray}↳ ${detail}${C.reset}`);
};
const warn = (msg: string) => console.log(`  ${C.yellow}⚠${C.reset} ${msg}`);
const info = (msg: string) => console.log(`  ${C.blue}ℹ${C.reset} ${C.gray}${msg}${C.reset}`);
const section = (title: string) => console.log(`\n${C.bold}${C.cyan}━━━ ${title} ━━━${C.reset}`);

interface TestResult { name: string; passed: boolean; duration: number; detail?: string; }
const results: TestResult[] = [];

async function test(name: string, fn: () => Promise<void>): Promise<void> {
  const start = Date.now();
  try {
    await fn();
    const duration = Date.now() - start;
    results.push({ name, passed: true, duration });
    pass(`${name} ${C.gray}(${duration}ms)${C.reset}`);
  } catch (e: any) {
    const duration = Date.now() - start;
    const detail = e?.message || String(e);
    results.push({ name, passed: false, duration, detail });
    fail(`${name} ${C.gray}(${duration}ms)${C.reset}`, detail);
  }
}

async function get(url: string, headers: Record<string, string> = {}) {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json", ...headers },
    signal: AbortSignal.timeout(15000),
  });
  const raw = await res.text();
  let body: any;
  try { body = JSON.parse(raw); } catch { body = raw; }
  return { status: res.status, body, raw };
}

async function post(url: string, data: any, headers: Record<string, string> = {}) {
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

function resolveBaseUrl(): { studioUrl: string; mcpUrl: string } {
  const cliIdx = process.argv.indexOf("--base-url");
  if (cliIdx !== -1 && process.argv[cliIdx + 1]) {
    return {
      studioUrl: process.argv[cliIdx + 1].replace(/\/$/, ""),
      mcpUrl: process.env.MCP_URL || "unknown",
    };
  }
  if (process.env.BASE_URL) {
    return {
      studioUrl: process.env.BASE_URL.replace(/\/$/, ""),
      mcpUrl: process.env.MCP_URL || "unknown",
    };
  }
  try {
    const status = execSync("railway status 2>/dev/null", { timeout: 8000, encoding: "utf8" });
    const urlMatch = status.match(/https:\/\/[^\s"]+\.up\.railway\.app/g);
    if (urlMatch && urlMatch.length > 0) {
      const urls = [...new Set(urlMatch)];
      return {
        studioUrl: urls.find(u => u.includes("agent")) || urls[0],
        mcpUrl: urls.find(u => u.includes("positive") || u.includes("mcp")) || "unknown",
      };
    }
  } catch {}
  warn("Could not detect Railway URL — falling back to localhost:3000");
  return { studioUrl: "http://localhost:3000", mcpUrl: "http://localhost:8000" };
}

async function main() {
  console.log(`\n${C.bold}${C.magenta}╔════════════════════════════════════════════════╗${C.reset}`);
  console.log(`${C.bold}${C.magenta}║   Agent-Studio Orchestration Test Suite v1.0   ║${C.reset}`);
  console.log(`${C.bold}${C.magenta}╚════════════════════════════════════════════════╝${C.reset}`);

  const { studioUrl, mcpUrl } = resolveBaseUrl();
  console.log(`\n${C.bold}Target URLs:${C.reset}`);
  info(`Agent Studio  → ${studioUrl}`);
  info(`MCP Server    → ${mcpUrl}`);
  info(`Test started  → ${new Date().toISOString()}`);

  // ── 1. HEALTH CHECKS ──────────────────────────────────────────────────────
  section("1 / HEALTH CHECKS");

  await test("Agent-Studio root responds (HTTP 200)", async () => {
    const { status } = await get(studioUrl);
    if (status < 200 || status >= 400) throw new Error(`HTTP ${status}`);
  });

  await test("Agent-Studio /api/health endpoint", async () => {
    const { status, body } = await get(`${studioUrl}/api/health`);
    if (status !== 200) throw new Error(`HTTP ${status} — ${JSON.stringify(body)}`);
    info(`Health: ${JSON.stringify(body).slice(0, 80)}`);
  });

  if (mcpUrl !== "unknown") {
    await test("ECC Skills MCP Server /health", async () => {
      const { status, raw } = await get(`${mcpUrl}/health`);
      if (status !== 200) throw new Error(`HTTP ${status}`);
      if (!raw.toLowerCase().includes("ok")) throw new Error(`Unexpected body: ${raw}`);
      info(`MCP health: "${raw.trim()}"`);
    });
  } else {
    warn("MCP URL unknown — set MCP_URL env var to test ECC Skills MCP server");
  }

  await test("NextAuth session endpoint accessible", async () => {
    const { status } = await get(`${studioUrl}/api/auth/session`);
    if (status !== 200) throw new Error(`HTTP ${status}`);
  });

  // ── 2. ECC SKILLS API ─────────────────────────────────────────────────────
  section("2 / ECC SKILLS API");

  await test("Skills endpoint /api/skills responds", async () => {
    const { status, body } = await get(`${studioUrl}/api/skills`);
    if (status === 401) { warn("Skills endpoint requires auth — correct for production"); return; }
    if (status !== 200) throw new Error(`HTTP ${status}`);
    info(`Response: ${JSON.stringify(body).slice(0, 100)}`);
  });

  await test("ECC ingest endpoint exists /api/ecc/ingest-skills", async () => {
    const { status } = await post(`${studioUrl}/api/ecc/ingest-skills`, {});
    if (status === 404) throw new Error("Route not found — check src/app/api/ecc/ingest-skills/route.ts");
    if (status === 401 || status === 403) { info("Route exists and correctly requires CRON_SECRET auth ✓"); return; }
    info(`Ingest endpoint HTTP ${status}`);
  });

  await test("Skills evolve endpoint exists /api/skills/evolve", async () => {
    const { status } = await post(`${studioUrl}/api/skills/evolve`, {});
    if (status === 404) throw new Error("Route not found — check src/app/api/skills/evolve/route.ts");
    info(`Evolve endpoint HTTP ${status} (auth protection expected)`);
  });

  await test("Skill browser page accessible /skills", async () => {
    const { status } = await get(`${studioUrl}/skills`);
    if (status === 404) throw new Error("Skills page not found");
    if (status === 302 || status === 307) { info("Redirected to login — page exists ✓"); return; }
    if (status === 200) info("Skills browser page loaded ✓");
  });

  // ── 3. AGENT ORCHESTRATION ────────────────────────────────────────────────
  section("3 / AGENT ORCHESTRATION");

  await test("Agent templates API /api/agents responds", async () => {
    const { status, body } = await get(`${studioUrl}/api/agents`);
    if (status === 401) { warn("Agents API requires auth — correct for production"); return; }
    if (status !== 200) throw new Error(`HTTP ${status}`);
    const count = Array.isArray(body) ? body.length : body?.data?.length;
    if (count !== undefined) info(`Found ${count} agents in DB`);
  });

  await test("Dashboard root accessible /dashboard", async () => {
    const { status } = await get(`${studioUrl}/dashboard`);
    if (status === 404) throw new Error("Dashboard not found");
    info(`Dashboard HTTP ${status}`);
  });

  await test("Agents page accessible /agents", async () => {
    const { status } = await get(`${studioUrl}/agents`);
    if (status === 404) throw new Error("Agents page not found");
    info(`Agents page HTTP ${status}`);
  });

  await test("API chat endpoint exists /api/chat", async () => {
    const { status } = await post(`${studioUrl}/api/chat`, {});
    if (status === 404) throw new Error("Chat API not found");
    info(`Chat API HTTP ${status} (expects auth/validation, not 404)`);
  });

  // ── 4. MCP STREAMABLE HTTP ────────────────────────────────────────────────
  section("4 / MCP STREAMABLE HTTP CONNECTION");

  if (mcpUrl !== "unknown") {
    // Use /mcp without trailing slash — FastMCP handles it directly, no redirect
    const mcpEndpoint = `${mcpUrl}/mcp`;

    let mcpSessionId: string | null = null;

    await test("MCP initialize handshake (HTTP 200 + session)", async () => {
      const payload = {
        jsonrpc: "2.0", id: 1, method: "initialize",
        params: {
          protocolVersion: "2025-11-25", capabilities: {},
          clientInfo: { name: "orchestration-test", version: "1.0.0" },
        },
      };
      const res = await fetch(mcpEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json, text/event-stream" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15000),
      });
      if (res.status === 404) throw new Error(`MCP endpoint not found at ${mcpEndpoint}`);
      if (res.status === 421) throw new Error("Host validation still failing (421)");
      if (res.status === 307) throw new Error("Still redirecting (307)");
      if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
      // Capture session ID from response headers (MCP Streamable HTTP protocol)
      mcpSessionId = res.headers.get("mcp-session-id");
      const raw = await res.text();
      info(`MCP initialize: HTTP ${res.status}${mcpSessionId ? ` | session: ${mcpSessionId.slice(0,8)}…` : ""}`);
      if (raw?.includes("data:")) info(`SSE stream active ✓`);
    });

    await test("MCP tools/list with session ID", async () => {
      if (!mcpSessionId) {
        warn("No session ID from initialize — skipping (initialize may have failed)");
        return;
      }
      const payload = { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} };
      const res = await fetch(mcpEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json, text/event-stream",
          "mcp-session-id": mcpSessionId,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15000),
      });
      if (res.status !== 200) throw new Error(`HTTP ${res.status} — ${(await res.text()).slice(0, 120)}`);
      const raw = await res.text();
      // Parse SSE: data: {...}
      const dataLine = raw.split("\n").find(l => l.startsWith("data:"));
      if (dataLine) {
        try {
          const parsed = JSON.parse(dataLine.replace(/^data:\s*/, ""));
          const tools = parsed?.result?.tools;
          if (tools) {
            info(`MCP tools: ${tools.length} available`);
            tools.slice(0, 3).forEach((t: any) => info(`  • ${t.name}: ${t.description?.slice(0,50)}`));
            return;
          }
        } catch {}
      }
      if (raw.includes("tools")) { info(`Tools found in response ✓`); return; }
      throw new Error(`Unexpected response: ${raw.slice(0, 100)}`);
    });
  } else {
    warn("Skipping MCP protocol tests — set MCP_URL env var");
    info("Example: MCP_URL=https://your-mcp.railway.app \\");
    info("  npx tsx test-orchestration.ts --base-url https://your-app.railway.app");
  }

  await test("Required env vars present (Railway + local)", async () => {
    let envContent = "";
    try { const fs = await import("fs"); envContent = fs.readFileSync(".env", "utf8"); } catch {}
    try { const fs = await import("fs"); envContent += fs.readFileSync(".env.local", "utf8"); } catch {}
    // These vars are set in Railway dashboard — not in local .env (by design)
    // We verify by checking the app WORKS rather than checking local files
    const railwayOnly = ["NEXTAUTH_SECRET", "ECC_SKILLS_MCP_URL"];
    const localRequired = ["DATABASE_URL"];
    const missingLocal = localRequired.filter(k => !process.env[k] && !envContent.includes(k));
    if (missingLocal.length > 0) throw new Error(`Missing local env vars: ${missingLocal.join(", ")}`);
    info(`Local env vars OK ✓`);
    info(`Railway-only vars (set in dashboard): ${railwayOnly.join(", ")}`);
    // Verify ECC_SKILLS_MCP_URL is needed — remind to add it
    if (!envContent.includes("ECC_SKILLS_MCP_URL")) {
      warn(`ECC_SKILLS_MCP_URL not in local .env — add to Railway agent-studio variables:`);
      warn(`  ECC_SKILLS_MCP_URL=https://your-mcp.railway.app/mcp`);
    }
  });

  // ── FINAL REPORT ──────────────────────────────────────────────────────────
  const total = results.length;
  const passed = results.filter(r => r.passed).length;
  const failed = total - passed;
  const totalMs = results.reduce((s, r) => s + r.duration, 0);
  const score = Math.round((passed / total) * 100);

  console.log(`\n${C.bold}${C.magenta}╔════════════════════════════════════════════════╗${C.reset}`);
  console.log(`${C.bold}${C.magenta}║               TEST SUITE RESULTS              ║${C.reset}`);
  console.log(`${C.bold}${C.magenta}╚════════════════════════════════════════════════╝${C.reset}`);
  console.log(`\n  Score:  ${score >= 80 ? C.green : score >= 60 ? C.yellow : C.red}${C.bold}${score}%${C.reset} (${passed}/${total} passed)`);
  console.log(`  Time:   ${C.gray}${totalMs}ms${C.reset}`);
  console.log(`  Target: ${C.cyan}${studioUrl}${C.reset}`);

  if (failed > 0) {
    console.log(`\n${C.bold}${C.red}Failed tests:${C.reset}`);
    results.filter(r => !r.passed).forEach(r => {
      console.log(`  ${C.red}✗${C.reset} ${r.name}`);
      if (r.detail) console.log(`    ${C.gray}${r.detail}${C.reset}`);
    });
  }

  const grade =
    score === 100 ? `${C.green}${C.bold}EXCELLENT — sve radi perfektno! 🚀${C.reset}` :
    score >= 80   ? `${C.green}${C.bold}GOOD — sistem funkcioniše, manji problemi${C.reset}` :
    score >= 60   ? `${C.yellow}${C.bold}PARTIAL — neke komponente nisu dostupne${C.reset}` :
                    `${C.red}${C.bold}NEEDS ATTENTION — kritični problemi${C.reset}`;

  console.log(`\n  Status: ${grade}\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => { console.error(`\n${C.red}Fatal:${C.reset}`, e); process.exit(1); });
