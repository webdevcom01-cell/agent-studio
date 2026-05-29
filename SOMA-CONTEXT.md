# SOMA Pipeline — Session Context
*Last updated: 2026-05-17*

---

## Što je SOMA

3-agentni content pipeline koji pronalazi trending AI teme i generiše platform-specifične hookove i content.

```
TI (Trend Intelligence) → HW (Hook Writer) → CR (Content Repurposer)
                                                        ↕
                                          SA (Score Analyzer) — standalone
```

---

## Agent IDs i KB IDs

| Agent | Agent ID | KB ID |
|-------|----------|-------|
| Trend Intelligence (TI) | `c1777723587797ch65fqcudn` | `c1777724361613zkacaonj60` |
| Hook Writer (HW) | `cmp832hkithbhj9suiqgmjqpw` | `c17777243623082bxh7e2crn` |
| Content Repurposer (CR) | `c1777723587821zymz38ug0j` | `c1777724362990ottwffcep9` |
| Score Analyzer (SA) | `cmp7gtng100hdpc01cqr5d2hy` | `cmp7gtng100hfpc010xztikpd` |

Agent Studio URL: `https://agent-studio-production-c43e.up.railway.app`
API Key: Pohranjen u Agent Studio MCP konfiguraciji — ne treba ga ponovo unositi.

---

## Obsidian Vault Paths

| File | Path |
|------|------|
| TI evo-log | `agents/trend-intelligence/evo-log.md` |
| TI instincts | `agents/trend-intelligence/instincts.md` |
| HW evo-log | `agents/hook-writer/evo-log.md` |
| HW instincts | `agents/hook-writer/instincts.md` |
| HW winners-log | `agents/hook-writer/winners-log.md` |
| CR evo-log | `agents/content-repurposer/evo-log.md` |
| CR instincts | `agents/content-repurposer/instincts.md` |
| CR format-templates | `agents/content-repurposer/format-templates.md` |
| SA evo-log | `agents/score-analyzer/evo-log.md` |
| SA instincts | `agents/score-analyzer/instincts.md` |
| SA agent-card | `agents/score-analyzer/agent-card.md` |
| SA DESIGN_SPEC | `agents/score-analyzer/DESIGN_SPEC.md` |

---

## Trenutno stanje (2026-05-17)

- **Ukupno runova:** 7 (6 + 1 danas — Anthropic/PwC partnership)
- **Zadnji run:** ✅ CLEAN — LI:19 X:18 YT:17 IG:17 TT:18 — sve 5 platformi ≥17 → winners-log
- **STAT GUARD:** Aktivan na HW (blokira fabricated stats)
- **KB sync:** Završen 2026-05-17 — svi KBovi ažurni
- **instincts-updater test:** 0 novih instinkta (nema dovoljno pattern evidence)

---

## Ključne arhitekturalne odluke

1. **Score Analyzer = STANDALONE** — nije u chainu. Koristiti za ručnu QA hookova ili scoring vanjskih hookova.
2. **HW Opcija B** — 5 distinktnih platform-specifičnih hookova po runu (ne 1 shared hook).
3. **TI timeout = 180s**, HW = 120s, CR = 120s — ne koristiti defaults.
4. **OBAVEZNO:** TI message uvijek počinje sa `Today is YYYY-MM-DD.`
5. **Winners threshold = ≥17/20 per platform** — svaka platforma se ocjenjuje posebno.
6. **Evo-log write = append mode**, nikad section_heading, nikad replace (osim prvog unosa).

---

## Dostupni skills (Cowork mode)

| Skill | Kada koristiti |
|-------|---------------|
| `soma-run` | Pokreni cijeli TI→HW→CR pipeline + automatsko logovanje |
| `pipeline-input-validator` | Pre-flight provjera inputa prije soma-run |
| `instincts-updater` | Ekstraktuj obrasce iz evo-logova → predloži instinkte |
| `kb-sync` | Sinkronizuj Obsidian vault sa Agent Studio KBovima |
| `agent-health-check` | Provjeri svih 10 production agenata |
| `soma-performance-review` | Historijski pregled pipeline statistika |
| `evo-log-writer` | Ručno loguj pojedinačni agent run |
| `winners-log-logger` | Loguj winner hook (≥17) |
| `soma-memory-fix` | Popravi KB wiring probleme |
| `pipeline-debug` | Debug SOMA pipeline problema |

---

## Production agenti (scope za health-check)

**SOMA:** Trend Intelligence, Hook Writer, Content Repurposer, Score Analyzer

**AI Nekretnine CG:** NLU Chat Agent, Master Orchestrator, Due Diligence Agent,
Market Intelligence Agent, Property Analysis Agent, eKatastar Data Agent

---

## Preporuke za sljedeće sesije

**1. Nastavi SOMA runove** — cilj je 5-8 čistih runova da se akumulira dovoljno pattern data za instincts-updater.

**2. Poslije 5+ runova** — pokreni `instincts-updater` za batch ekstrakciju novih instinkta.

**3. Poslije svakih ~5 runova** — uradi `kb-sync` da agenti imaju svježe evo-logove u memoriji.

**4. Score Analyzer** — koristi ga kao standalone QA alat na winner hookovima; ne integrisati u chain.

---

## Kako početi sesiju

### U Cowork modu (Claude desktop app):
```
Nastavljamo rad na SOMA projektu. Pročitaj SOMA-CONTEXT.md u agent-studio folderu za kontekst. Danas radimo na: [opis zadatka]
```

### U terminalu (Claude Code CLI):
```bash
cd /Users/buda007/Desktop/agent-studio
claude "Pročitaj SOMA-CONTEXT.md za kontekst mog SOMA pipeline projekta, zatim [opis zadatka]"
```

### Brzi SOMA run u terminalu:
```bash
cd /Users/buda007/Desktop/agent-studio
claude "Pročitaj SOMA-CONTEXT.md. Pokreni soma-run skill sa ovim inputom: [URL ili opis trenda]"
```
