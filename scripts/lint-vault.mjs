#!/usr/bin/env node
// scripts/lint-vault.mjs
// Deterministički linter SOMA Obsidian vault-a prema system/vault-standard.md.
// READ-ONLY. Ništa ne menja. Preskače skills/ (§0). Ignoriše fenced/inline code za wikilink scan.
// Upotreba: node scripts/lint-vault.mjs [putanja-do-vault-a] [--json]
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, basename, extname } from 'node:path';

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const VAULT = args.find(a => !a.startsWith('--')) || '/Users/buda007/Desktop/agent-studio-vault';

const REQUIRED = ['type', 'created', 'tags'];
// Kanonski type-ovi (§1A knowledge + §1B operativni). Lint flaguje sve van ovog skupa.
const VALID_TYPES = ['concept','resource','insight','decision','project-log','question','evo-log','instincts','agent-card','design-spec','audit','system','glossary','handoff','analysis','build-guide','winners-log'];
const LEGACY_DATE = ['date', 'updated', 'audit_date'];
const TAG_SYNONYMS = { agents: 'agent', skills: 'skill', ti: 'trend-intelligence', hw: 'hook-writer' };
const EXPECTED_DUP = new Set(['evo-log.md','instincts.md','agent-card.md','DESIGN_SPEC.md','format-templates.md','winners-log.md']);
const STALE_DAYS = 14;

function walk(dir, acc = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      if (relative(VAULT, full).split('/')[0] === 'skills') continue; // §0
      walk(full, acc);
    } else if (extname(e.name) === '.md') {
      if (relative(VAULT, full) === 'README.md') continue; // §0 izuzetak (vault front-door)
      acc.push(full);
    }
  }
  return acc;
}

function parseFrontmatter(text) {
  if (!text.startsWith('---')) return { fm: null, body: text };
  const end = text.indexOf('\n---', 3);
  if (end === -1) return { fm: null, body: text };
  const raw = text.slice(3, end).trim();
  const body = text.slice(end + 4);
  const fm = {};
  let curKey = null;
  for (const line of raw.split('\n')) {
    const m = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (m) {
      curKey = m[1];
      let val = m[2].trim();
      if (val.startsWith('[') && val.endsWith(']')) {
        fm[curKey] = val.slice(1, -1).split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
      } else if (val === '') {
        fm[curKey] = '';
      } else {
        fm[curKey] = val.replace(/^["']|["']$/g, '');
      }
    } else {
      const li = line.match(/^\s*-\s*(.+)$/);
      if (li && curKey) {
        if (!Array.isArray(fm[curKey])) fm[curKey] = [];
        fm[curKey].push(li[1].trim().replace(/^["']|["']$/g, ''));
      }
    }
  }
  return { fm, body };
}

function stripCode(body) {
  return body.replace(/```[\s\S]*?```/g, '').replace(/`[^`]*`/g, '');
}
function wikilinks(body) {
  const out = []; const re = /\[\[([^\]]+)\]\]/g; let m; const clean = stripCode(body);
  while ((m = re.exec(clean))) out.push(m[1].split('|')[0].split('#')[0].trim());
  return out;
}

const files = walk(VAULT);
const notes = files.map(f => {
  const text = readFileSync(f, 'utf8');
  const { fm, body } = parseFrontmatter(text);
  const tags = fm && Array.isArray(fm.tags) ? fm.tags : (fm && fm.tags ? [fm.tags] : []);
  return { path: relative(VAULT, f), name: basename(f), base: basename(f, '.md'), mtime: statSync(f).mtime, fm, tags, bodyTrim: body.trim(), links: wikilinks(body) };
});

const nameSet = new Set(notes.map(n => n.base.toLowerCase()));
const pathSet = new Set(notes.map(n => n.path.replace(/\.md$/, '').toLowerCase()));
const referenced = new Set();
for (const n of notes) for (const l of n.links) referenced.add(l.toLowerCase());
const tagFreq = {};
for (const n of notes) for (const t of n.tags) tagFreq[t] = (tagFreq[t] || 0) + 1;

const F = { noFrontmatter: [], missingRequired: [], invalidType: [], legacyDate: [], tagSynonym: [], tagSprawl: [], orphans: [], brokenLinks: [], staleDrafts: [], duplicates: [] };
const now = Date.now();
for (const n of notes) {
  if (!n.fm) { F.noFrontmatter.push(n.path); }
  else {
    const missing = REQUIRED.filter(k => !(k in n.fm) || (k === 'tags' && Array.isArray(n.fm[k]) && n.fm[k].length === 0));
    if (missing.length) F.missingRequired.push(`${n.path} (nedostaje: ${missing.join(', ')})`);
    if (n.fm.type && !VALID_TYPES.includes(n.fm.type)) F.invalidType.push(`${n.path} (type: ${n.fm.type})`);
    const legacy = LEGACY_DATE.filter(k => k in n.fm);
    if (legacy.length) F.legacyDate.push(`${n.path} (${legacy.join(', ')})`);
  }
  for (const t of n.tags) if (TAG_SYNONYMS[t]) F.tagSynonym.push(`${n.path}: ${t} -> ${TAG_SYNONYMS[t]}`);
  if (n.bodyTrim === '') F.orphans.push(`${n.path} (prazna)`);
  else if (n.tags.length === 0 && !referenced.has(n.base.toLowerCase())) F.orphans.push(`${n.path} (bez tagova i bez dolaznih linkova)`);
  for (const l of n.links) { const k = l.toLowerCase(); if (!nameSet.has(k) && !pathSet.has(k)) F.brokenLinks.push(`${n.path}: [[${l}]]`); }
  if (n.name.endsWith('.draft.md')) { const d = (now - n.mtime.getTime()) / 86400000; if (d > STALE_DAYS) F.staleDrafts.push(`${n.path} (${Math.floor(d)} dana)`); }
}
for (const [t, c] of Object.entries(tagFreq)) if (c === 1 && !VALID_TYPES.includes(t)) F.tagSprawl.push(t); // type-imena nisu sprawl (§3 traži tip u tagovima)
const byBase = {};
for (const n of notes) (byBase[n.name] ||= []).push(n.path);
for (const [name, paths] of Object.entries(byBase)) if (paths.length > 1 && !EXPECTED_DUP.has(name)) F.duplicates.push(`${name}: ${paths.join(', ')}`);

if (asJson) { console.log(JSON.stringify({ vault: VAULT, scanned: notes.length, findings: F }, null, 2)); process.exit(0); }

const summary = [
  ['Bez frontmatter-a', F.noFrontmatter], ['Nedostaju obavezna polja', F.missingRequired], ['Nevazeci type (van enum-a)', F.invalidType],
  ['Legacy date polja', F.legacyDate], ['Tag sinonimi', F.tagSynonym], ['Tagovi s 1 upotrebom', F.tagSprawl],
  ['Sirocad / prazne', F.orphans], ['Broken wikilinks', F.brokenLinks], ['Stale draftovi (>14d)', F.staleDrafts], ['Duplikati', F.duplicates],
];
const out = [];
out.push(`# Vault Lint - ${new Date().toISOString().slice(0, 10)}`);
out.push(`Vault: ${VAULT}`);
out.push(`Skenirano nota (bez skills/): ${notes.length}`);
out.push('', '| Kategorija | Broj |', '|---|---|');
for (const [k, v] of summary) out.push(`| ${k} | ${v.length} |`);
out.push('');
for (const [k, v] of summary) { if (!v.length) continue; out.push(`## ${k} (${v.length})`); for (const x of v) out.push(`- ${x}`); out.push(''); }
console.log(out.join('\n'));
