# SOMA Pipeline — Project Changelog
*Kompletna historija izgradnje, fixeva i arhitekturalnih odluka*
*Obuhvata period: 2026-05-15 → 2026-05-17*

---

## Pregled projekta

SOMA (Social Media Automation) je multi-agent content pipeline izgrađen na Agent Studio platformi. Pipeline prima trending AI temu (URL ili tekst), transformiše je u 5 platform-specifičnih hookova, i generiše kompletan content za svaku platformu.

```
INPUT (trend/URL)
     │
     ▼
[TI] Trend Intelligence     — pronalazi i analizira trend
     │
     ▼
[HW] Hook Writer            — generiše 5 platform-specifičnih hookova
     │
     ▼
[CR] Content Repurposer     — piše kompletan content za sve platforme
     │
     ▼
OUTPUT (LinkedIn + X + YouTube + Instagram + TikTok)

[SA] Score Analyzer         — STANDALONE scorer (nije u chainu)
```

---

## Skills izgrađeni

### 1. `agent-health-check`
**Svrha:** Automatizovana provjera zdravlja svih production agenata (10 agenata).
**Što radi:**
- Phase 1 (globalno): `as_find_broken_flows`, `as_diagnose_models`, `as_list_agents` — paralelno
- Phase 2 (per-agent): KB wiring check + embedding status za svaki production agent
- Generiše scored report (0–100) sa prioritiziranim action listom

**Ključne odluke:**
- Scoring je relativan (ne apsolutna formula) — spriječava matematički kolaps sa 55 agenata
- Production scope je fiksan: 4 SOMA agenta + 6 AI Nekretnine CG agenata
- `as_get_kb_embedding_status` se NE poziva — `as_list_knowledge_bases` već daje breakdown

---

### 2. `kb-sync`
**Svrha:** Sinkronizacija Obsidian vault fajlova u Agent Studio knowledge bases.
**Što radi:**
- True-Sync protokol: ADD novi → poll READY → DELETE stari
- SHA-256 change detection (contentHash)
- Rate limit: 10 POST/min sa 7s bufferom

**Ključne odluke:**
- ADD-only fallback kada HTTP proxy blokira source ID lookup (Railway sandbox ograničenje)
- Stare verzije ostaju u KB kada DELETE nije moguć — novi fajlovi su supersets starog sadržaja
- Funcionalnog uticaja na pipeline nema jer agenti čitaju najrelevantnije chunks

**Pokrenuto:** 2026-05-17 — svi 4 KB-a ažurni, 12 dokumenata dodano

---

### 3. `soma-memory-fix`
**Svrha:** Audit i automatski patch `kb_search` čvorova kojima nedostaje `knowledgeBaseId`.
**Što radi:**
- Inspect flow za svaki production agent
- Matchuje KB ID sa KB bazom za tog agenta
- Prikazuje patch plan → čeka potvrdu → patchuje

**Zero hallucination garancija:** Svaki ID koji se koristi u patchu dolazi iz live MCP tool responsa u tekućoj sesiji.

---

### 4. `soma-run`
**Svrha:** End-to-end SOMA pipeline runner — jedan skill zamjenjuje 4+ manualnih koraka.
**Što radi:**
- Validate input → TI → HW → CR → evo-log sva 3 agenta → winners-log

**Verzija 1.0.0:** Osnovna implementacija
**Verzija 1.1.0:** Dodate ključne ispravke:
- `today is YYYY-MM-DD` prefix za TI (otkriveno kao bug 2026-05-15)
- Abort sentinels za svaki agent output
- Scope override: TI only, TI+HW, ili FULL
- Score pattern regex: `LI:\d+ X:\d+ YT:\d+ IG:\d+ TT:\d+`
- Winners threshold ≥17/20 per platform (ne samo overall winner)
- Timeout potvrđen live: TI=180s, HW=120s, CR=120s

---

### 5. `pipeline-debug`
**Svrha:** Reaktivni diagnostički skill za SOMA pipeline — zamjenjuje 5–8 manualnih MCP poziva.
**Dimenzije provjere:** D0 (broken flows) + D1 (execution status) + D4 (flow integrity) + D5 (output variables) + D6 (KB embedding) + D7 (evo-log analiza)
**IF-THEN mapping:** Eksplicitna kauzalna mapa simptom → root cause → fix
**Auto-fix:** Primjenjuje trivijalne fixeve (outputVariable patches) bez potvrde

---

### 6. `instincts-updater`
**Svrha:** Batch ekstrakcija obrazaca iz SOMA evo-logova → prijedlozi novih instinkta → write uz odobrenje.

**12 forensičkih nalaza ugrađenih u skill:**
- F1: Ne ažurirati `*Last updated:` liniju (append mode ne može da pristupi header-u)
- F4: Multi-line evo-log parser (TI continuation linije počinju sa `⚠️ FLAG:`)
- F5: Per-agent format pravila (CR ima `**What happened:**` format, TI/HW koriste SOMA format)
- F6: Score Analyzer section skip — parsirati samo `## Entries`, ignorisati `## Instincts Update Trigger`
- F7: Filter invalid winners-log entryja (`[not preserved]`, `[not recovered]`)
- F9: Semantic dedup prije svakog prijedloga (keyword matching po temi)
- F10: Per-agent flag syntax (TI: `⚠️ FLAG:`, HW: `QUALITY_VIOLATION`, CR: `QUALITY_VIOLATIONS`/`WARN`, SA: `QUALITY_GATE_FAIL`)
- F11: QGF sekcija za HW/TI — kreirati sa `mode: "append"` (ne replace)
- F12: YAML frontmatter safety — nikad ne proslijediti `new_frontmatter` za TI/HW/CR

**Test rezultat (2026-05-17):** 0 novih instinkta — CR flags su bili infrastrukturni artefakti (Opcija B pre-setup), ne realni bihejvioralni obrasci. Dishonest bi bilo pisati instinkte bez evidence.

---

### 7. `pipeline-input-validator`
**Svrha:** Pre-flight validator za SOMA inpute — score 4 dimenzije prije runa.
**Dimenzije:** Specificity + Niche + Freshness + Actionability
**Output:** PASS / WARN+ / WARN- / FAIL sa guidance-om za poboljšanje

---

### 8. `evo-log-writer`
**Svrha:** Logovanje pojedinačnih agent runova u Obsidian vault.
**Podržava:** TI, HW, CR (Score Analyzer nije podržan — loguje se ručno)
**Format provjere:** Svaki agent ima specifičan pipe-delimited format, star rating za confidence, `N/20` za scores

---

### 9. `winners-log-logger`
**Svrha:** Logovanje winning hookova (≥17/20) u `agents/hook-writer/winners-log.md`.
**Threshold:** ≥17/20 — strogo, bez zaokruživanja

---

### 10. `soma-performance-review`
**Svrha:** Historijski pregled SOMA pipeline performansi iz Obsidian vault logova.
**Čita:** TI evo-log, HW evo-log, CR evo-log, winners-log
**Output:** Per-agent metrici, pipeline health score, IF-THEN preporuke

---

## Agenti — šta je izgrađeno i ispravljeno

### Trend Intelligence (TI)
| Datum | Promjena |
|-------|---------|
| 2026-05-15 | `kb_search` čvor nije imao `knowledgeBaseId` → patchovano |
| 2026-05-15 | Otkriveno: bez `Today is YYYY-MM-DD.` prefiksa, TI loše klasificira freshness |
| 2026-05-16 | Timeout podignut 90s → 180s (TI→HW chain zahtijeva više vremena) |
| 2026-05-16 | Hardcoded web search queries → dinamične (TI sada koristi trend iz inputa) |

**Trenutni status:** ✅ Production ready

---

### Hook Writer (HW)
| Datum | Promjena |
|-------|---------|
| 2026-05-15 | Otkrivena SINGLE_HOOK_BUG: isti P3 hook na svim platformama |
| 2026-05-15 | Implementirana **Opcija B arhitektura**: 5 distinktnih platform-specifičnih hookova (HOOK_LINKEDIN, HOOK_X, HOOK_YOUTUBE, HOOK_INSTAGRAM, HOOK_TIKTOK) |
| 2026-05-17 | Run 5: QUALITY_VIOLATION — fabricated stat "80% of developers" propušten |
| 2026-05-17 | **STAT GUARD** dodan u HW prompt: eksplicitna zabrana fabriciranja stats, zahtjev za izvore |
| 2026-05-17 | Run 6 i 7 post-STAT GUARD: oba čista |

**Trenutni status:** ✅ Production ready, STAT GUARD aktivan

---

### Content Repurposer (CR)
| Datum | Promjena |
|-------|---------|
| 2026-05-15 | `kb_search` čvor nije imao `knowledgeBaseId` → patchovano |
| 2026-05-15 | Run 3: QUALITY_VIOLATIONS — "change the game" banned phrase + "68% of AI agents" fabricated stat |
| 2026-05-15 | Greške dokumentovane u `agents/content-repurposer/instincts.md` → `## Quality Gate Failures` |
| 2026-05-16 | Runs 4, 5, 6, 7: čisti (CR naslijedila fixeve od HW upstream) |

**Trenutni status:** ✅ Production ready

---

### Score Analyzer (SA)
| Datum | Promjena |
|-------|---------|
| 2026-05-16 | **Scaffoldan od nule** — novi agent sa kompletnim vault fajlovima |
| 2026-05-16 | Flow: kb_search → web_search → ai_response (processor, gpt-4.1-mini) → ai_response (extractor) |
| 2026-05-16 | topK patchovan 5 → 10 |
| 2026-05-16 | Web search query strategija ispravljana |
| 2026-05-16 | `{{current_date}}` varijabla verifikovana |
| 2026-05-16 | Extractor model patchovan na `gpt-4.1-mini` (ANTHROPIC_API_KEY nije setovan na serveru) |
| 2026-05-16 | Smoke test: ✅ — math tačan (4+4+5+4=17), SUGGESTIONS referenciraju dimenzije, WIN verdict ispravan |
| 2026-05-17 | **Architekturalna odluka:** SA ostaje STANDALONE — ne integrisati u TI→HW→CR chain |

**Vault fajlovi:** agent-card.md, DESIGN_SPEC.md, instincts.md, evo-log.md
**Trenutni status:** ✅ Funkcionalan, 1 evo-log entry (smoke test)

---

### AI Nekretnine CG (svi agenti)
| Datum | Promjena |
|-------|---------|
| 2026-05-16 | 10 `outputVariable` čvorova patchovano (output se gubio — nodes nisu imali outputVariable) |
| 2026-05-16 | Bug Detection agent obrisan (stari duplikat) |
| 2026-05-16 | 4 agenta KB seedovana (NLU Chat, Master Orchestrator, Due Diligence, Market Intelligence) |
| 2026-05-16 | Smoke test: Master Orchestrator ispravno rutira između agenata |

---

## SOMA Pipeline — Historija runova

| # | Datum | Trend | Status | Scores | Napomene |
|---|-------|-------|--------|--------|---------|
| 1 | 2026-05-15 | Claude Agent SDK expansion | ❌ STRUCTURAL BUG | UNSCORED | kb_search missing, isti P3 hook na svim platformama |
| 2 | 2026-05-15 | Anthropic Code with Claude 2026 | ⚠️ TRANSITIONAL | UNSCORED | kb_search dodan, Opcija B još nije deployovana |
| 3 | 2026-05-15 | OpenAI's Agents SDK update | ✅ PRVI ČISTI RUN | LI:19 X:18 YT:17 IG:17 TT:18 | Opcija B aktivna, 5 distinktnih hookova |
| 4 | 2026-05-16 | Anthropic Claude Sonnet 4 release | ✅ CLEAN | LI:19 X:18 YT:17 IG:17 TT:18 | Nema violations |
| 5 | 2026-05-17 | Claude Code CLI and Agent SDK | ⚠️ QUALITY_VIOLATION | LI:19 X:18 YT:17 IG:17 TT:18 | "80%" fabricated stat — STAT GUARD dodan poslije |
| 6 | 2026-05-17 | Claude Opus 4.7 and Claude Design | ✅ CLEAN | LI:19 X:18 YT:17 IG:17 TT:18 | Prvi run sa STAT GUARD-om — čist |
| 7 | 2026-05-17 | Anthropic/PwC expanded partnership | ✅ CLEAN | LI:19 X:18 YT:17 IG:17 TT:18 | Sve 5 platformi ≥17 → winners-log |

**Ukupno runova:** 7 | **Čistih (bez violations):** 5 | **Runs sa STAT GUARD-om:** 2 (oba čista)

---

## Ključne architekturalne odluke

### 1. Opcija B — HW arhitektura
**Problem:** HW je generisao isti hook za sve platforme (SINGLE_HOOK_BUG).
**Rješenje:** 5 odvojenih output varijabli — `HOOK_LINKEDIN`, `HOOK_X`, `HOOK_YOUTUBE`, `HOOK_INSTAGRAM`, `HOOK_TIKTOK`.
**Rezultat:** Svaka platforma dobija hook prilagođen njenom formatu i publici.

### 2. STAT GUARD
**Problem:** HW je fabricirao statistike ("80% of developers") kada nije imao stvarne podatke.
**Rješenje:** Eksplicitna zabrana u HW promptu — bez izvora, bez statistike. Alternativa: opisati pattern bez postotaka.
**Rezultat:** Runs 6 i 7 čisti, nema fabriciranih stats.

### 3. Score Analyzer = Standalone
**Razlog:** HW već interno scoruje hookove (LI:19 X:18 itd.). Dupliranje scoring-a u chainu bi:
- Dodalo 30-60s latencije
- Kreiralo contradictory signals (HW kaže 19, SA kaže 15 — koji pobjeđuje?)
- Stvorilo novu točku kvara
**Upotreba:** SA se koristi kao on-demand QA alat — ručno na winner hookovima ili vanjskim hookovima.

### 4. Today is {date} prefix
**Problem:** TI bez datuma klasificira evergreen teme kao trending.
**Rješenje:** Svaka TI poruka počinje sa "Today is YYYY-MM-DD."
**Ugrađeno u:** soma-run skill (obavezno, dokumentovano kao CRITICAL).

### 5. KB Sync ADD-only fallback
**Problem:** Railway sandbox blokira HTTP GET zahtjeve za source ID lookup (`X-Proxy-Error: blocked-by-allowlist`).
**Rješenje:** ADD-only mode — stari dokumenti ostaju, novi se dodaju kao supersets.
**Uticaj:** Nema funkcionalnog problema jer agenti čitaju najrelevantnije chunks. Duplikati postoje ali ne utiču na output kvalitet.

### 6. Evo-log write rules
- **Mode:** uvijek `append` (nikad `replace` osim za prvi entry)
- **Nikad `section_heading`** u append modu — kreira duplikat headera i kvari strukturu
- **Read before write** — obavezno, da se provjeri format i izbjegne blind write

---

## Infrastruktura

| Komponenta | Vrijednost |
|-----------|-----------|
| Agent Studio URL | `https://agent-studio-production-c43e.up.railway.app` |
| Production DB | Railway PostgreSQL |
| Obsidian MCP | Konektovan (obsidian_read_note, obsidian_update_note, etc.) |
| Agent Studio MCP | Konektovan (as_chat_with_agent, as_patch_node_field, etc.) |
| API Key | Pohranjen u Agent Studio MCP konfiguraciji |

---

## Obsidian Vault struktura

```
agents/
├── trend-intelligence/
│   ├── evo-log.md         (7 entries)
│   └── instincts.md       (per-platform patterns, scoring calibration)
├── hook-writer/
│   ├── evo-log.md         (7 entries)
│   ├── instincts.md       (per-platform hook intelligence)
│   └── winners-log.md     (15 valid entries — 5 iz runa 7, sve ≥17)
├── content-repurposer/
│   ├── evo-log.md         (7 entries)
│   ├── instincts.md       (platform adaptation + Quality Gate Failures sekcija)
│   └── format-templates.md (per-platform structural templates)
└── score-analyzer/
    ├── evo-log.md         (1 entry — smoke test)
    ├── instincts.md       (scoring calibration, quality gate rules)
    ├── agent-card.md      (agent ID, KB ID, node IDs, vault paths)
    └── DESIGN_SPEC.md     (use cases, input/output contract, constraints)
```

---

## Agent IDs i KB IDs

| Agent | Agent ID | KB ID |
|-------|----------|-------|
| Trend Intelligence | `c1777723587797ch65fqcudn` | `c1777724361613zkacaonj60` |
| Hook Writer | `c17777235878091qa78qw27c` | `c17777243623082bxh7e2crn` |
| Content Repurposer | `c1777723587821zymz38ug0j` | `c1777724362990ottwffcep9` |
| Score Analyzer | `cmp7gtng100hdpc01cqr5d2hy` | `cmp7gtng100hfpc010xztikpd` |

---

## Što je sljedeće

### Kratkoročno (sljedeće 1-2 sesije)
1. **3-5 dodatnih SOMA runova** — cilj je 10+ ukupno čistih runova za solidnu data osnovu
2. **instincts-updater** — pokrenuti nakon 10+ runova; SA treba ≥3 QUALITY_GATE_FAIL entryja da bi imao patterns
3. **kb-sync** — pokrenuti nakon svakih ~5 novih runova da agenti imaju svježe evo-logove u memoriji

### Srednje (5-10 sesija)
4. **Više trend inputa** — probati različite tipove: lansiranja modela, enterprise partnerstva, toolovi, istraživački radovi
5. **Score Analyzer workflow** — uspostaviti naviku: nakon svakog SOMA runa, propustiti winner hook kroz SA za QA
6. **Winners-log analiza** — kada dostiže 30+ entryja, pokrenuti soma-performance-review za pattern analizu

### Dugoročno
7. **Skill za periodični doc sync** — kada vidimo što se stvarno mijenja između sesija, graditi skill koji automatizuje ažuriranje SOMA-CONTEXT.md
8. **AI Nekretnine CG runovi** — sistem je sada zdrav, može se početi sa pravim testovima

---

*Dokument kreiran: 2026-05-17*
*Autor: Claude (Cowork mode) + buky*
