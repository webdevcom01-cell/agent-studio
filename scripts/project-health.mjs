#!/usr/bin/env node
// scripts/project-health.mjs
// Deterministički project-health runner: pokreće postojeće alate + jeftine fs/git metrike,
// agregira u jedan READ-ONLY izveštaj. Ne menja kod.
// Upotreba: node scripts/project-health.mjs [--full] [--json]
//   --full  uključuje spore provere (vitest + coverage)
//   --json  mašinski izlaz
import { execSync } from 'node:child_process';
import { readdirSync, readFileSync, existsSync } from 'node:fs';

const args = process.argv.slice(2);
const FULL = args.includes('--full');
const JSON_OUT = args.includes('--json');
const PM = process.env.PH_PM || 'pnpm';

// Pokreni komandu; uvek vrati {code, out} (i kad je exit != 0 — mnogi alati izađu !=0 kad nađu problem).
function run(cmd, timeoutMs = 180000) {
  try {
    const out = execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024 });
    return { code: 0, out };
  } catch (e) {
    if (e.killed || /ETIMEDOUT|timed out/i.test(String(e.message))) return { code: 124, out: (e.stdout || '') + (e.stderr || ''), timeout: true };
    return { code: e.status ?? 1, out: (e.stdout || '') + (e.stderr || '') };
  }
}
const count = (s, re) => (String(s).match(re) || []).length;
const m1 = (s, re) => { const x = String(s).match(re); return x ? x[1] : null; };

const checks = [];
// status: ok | warn | fail | skip ; metric: kratak string
function add(name, status, metric, detail = '') { checks.push({ name, status, metric, detail }); }

// ── 1. Typecheck ─────────────────────────────────────────────
{
  const r = run(`${PM} -s typecheck`, 240000);
  const errs = count(r.out, /error TS\d+/g);
  add('Typecheck', r.timeout ? 'skip' : (r.code === 0 && errs === 0 ? 'ok' : 'fail'),
    r.timeout ? 'timeout' : `${errs} TS grešaka`,
    errs ? r.out.split('\n').filter(l => /error TS/.test(l)).slice(0, 8).join('\n') : '');
}
// ── 2. Lint ──────────────────────────────────────────────────
{
  const r = run(`${PM} -s lint`, 240000);
  const warns = count(r.out, /\bWarning:/g);
  const errs = count(r.out, /\bError:/g);
  add('Lint', r.timeout ? 'skip' : (errs > 0 ? 'fail' : (warns > 0 ? 'warn' : 'ok')),
    r.timeout ? 'timeout' : `${errs} errors, ${warns} warnings`);
}
// ── 3. Knip (dead code / unused deps) ────────────────────────
{
  const r = run(`${PM} -s knip`, 300000);
  const f = m1(r.out, /Unused files?\s*\((\d+)\)/i);
  const d = m1(r.out, /Unused dependencies?\s*\((\d+)\)/i);
  const e = m1(r.out, /Unused exports?\s*\((\d+)\)/i);
  const dd = m1(r.out, /devDependencies?\s*\((\d+)\)/i);
  const parsed = [f && `${f} files`, d && `${d} deps`, dd && `${dd} devDeps`, e && `${e} exports`].filter(Boolean).join(', ');
  add('Knip (mrtav kod)', r.timeout ? 'skip' : (parsed ? 'warn' : 'ok'),
    r.timeout ? 'timeout' : (parsed || 'čisto / nepoznat format'),
    FULL ? r.out.slice(0, 4000) : '');
}
// ── 4. Outdated deps ─────────────────────────────────────────
{
  const r = run(`${PM} outdated`, 120000);
  // pnpm outdated: svaki red sa "│" ili tabelom je jedan paket; izađe code!=0 kad ima
  const rows = r.out.split('\n').filter(l => /\d+\.\d+\.\d+/.test(l) && !/^\s*Package/i.test(l));
  const majors = r.out.split('\n').filter(l => /\d+\.\d+\.\d+/.test(l)).length;
  add('Outdated deps', r.timeout ? 'skip' : (rows.length ? 'warn' : 'ok'),
    r.timeout ? 'timeout' : `${rows.length} zastarelih`);
}
// ── 5. Audit ─────────────────────────────────────────────────
{
  const r = run(`${PM} audit`, 120000);
  const line = (r.out.match(/(\d+)\s+vulnerabilit/i) || [])[0] || (r.out.match(/No known vulnerabilities|found 0/i) ? '0 vulnerabilities' : 'n/a');
  const high = m1(r.out, /(\d+)\s+high/i);
  const crit = m1(r.out, /(\d+)\s+critical/i);
  const bad = (Number(high) || 0) + (Number(crit) || 0);
  add('Audit (deps)', r.timeout ? 'skip' : (/(^|\D)0 vuln|No known/i.test(line) ? 'ok' : (bad > 0 ? 'fail' : 'warn')),
    r.timeout ? 'timeout' : line.replace(/\s+/g, ' ').trim());
}
// ── 6. Circular deps (madge) ─────────────────────────────────
{
  const r = run(`npx -y madge --circular --extensions ts,tsx src 2>/dev/null`, 180000);
  const n = m1(r.out, /Found (\d+) circular/i);
  const noCirc = /No circular dependency/i.test(r.out);
  add('Kružne zavisnosti', r.timeout ? 'skip' : (noCirc ? 'ok' : (n ? 'warn' : 'skip')),
    r.timeout ? 'timeout' : (noCirc ? '0' : (n ? `${n} ciklusa` : 'n/a (madge?)')));
}
// ── 7. Jeftine fs/git metrike (uvek rade) ───────────────────
{
  const rootMd = readdirSync('.').filter(f => f.endsWith('.md')).length;
  add('Root .md fajlova', rootMd > 15 ? 'warn' : 'ok', `${rootMd}`);
}
{
  const r = run(`grep -rInE "TODO|FIXME|HACK|XXX" src 2>/dev/null | wc -l`, 60000);
  add('TODO/FIXME u src', 'warn', `${r.out.trim()}`);
}
{
  const r = run(`grep -rInE "\\.(skip|fixme|only)\\(" src e2e 2>/dev/null | wc -l`, 60000);
  add('Preskočeni testovi', Number(r.out.trim()) > 0 ? 'warn' : 'ok', `${r.out.trim()}`);
}
{
  const r = run(`git ls-files | xargs -I{} du -k "{}" 2>/dev/null | sort -rn | head -3 | awk '{print $1"KB "$2}'`, 60000);
  add('Najveći tracked fajlovi', 'ok', r.out.trim().split('\n').slice(0, 3).join('; ') || 'n/a', '');
}
// ── 8. (--full) Testovi + coverage ──────────────────────────
if (FULL) {
  const r = run(`${PM} -s vitest run --coverage 2>&1`, 600000);
  const failed = m1(r.out, /(\d+)\s+failed/i);
  const passed = m1(r.out, /(\d+)\s+passed/i);
  const cov = m1(r.out, /All files\s*\|\s*([\d.]+)/);
  add('Testovi', r.timeout ? 'skip' : (failed && Number(failed) > 0 ? 'fail' : 'ok'),
    r.timeout ? 'timeout' : `${passed || '?'} passed, ${failed || 0} failed${cov ? `, cov ${cov}%` : ''}`);
}

// ── Izveštaj ─────────────────────────────────────────────────
if (JSON_OUT) { console.log(JSON.stringify({ generated: new Date().toISOString(), checks }, null, 2)); process.exit(0); }

const icon = { ok: '✅', warn: '⚠️', fail: '❌', skip: '⏭️' };
const out = [];
out.push(`# Project Health — ${new Date().toISOString().slice(0, 10)}`);
out.push(`Repo: ${process.cwd()}${FULL ? ' (--full)' : ''}`);
out.push('', '| Provera | Status | Nalaz |', '|---|---|---|');
for (const c of checks) out.push(`| ${c.name} | ${icon[c.status] || c.status} | ${c.metric} |`);
out.push('');
const issues = checks.filter(c => c.status === 'fail' || c.status === 'warn');
out.push(`## Sažetak`);
out.push(`- ❌ fail: ${checks.filter(c => c.status === 'fail').length} · ⚠️ warn: ${checks.filter(c => c.status === 'warn').length} · ✅ ok: ${checks.filter(c => c.status === 'ok').length} · ⏭️ skip: ${checks.filter(c => c.status === 'skip').length}`);
for (const c of checks.filter(c => c.detail)) { out.push('', `## ${c.name} — detalj`, '```', c.detail.trim(), '```'); }
console.log(out.join('\n'));
