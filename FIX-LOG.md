# FIX-LOG — Agent Studio Backlog

Stavke koje su identifikovane kao poznati problemi ali se ne rješavaju odmah.
Format: `P<prioritet>-<seq>: <opis> — merilo: <kriterijum zatvaranja>`

---

## ✅ P0-2: TI eval suite — ZATVORENO 2026-06-12

**Status:** DONE
**Zatvoreno:** 2026-06-12 (eval run `cmqb7agbf0001o20td38v7pyk`, worker commit `cd958ef`)
**Rezultat:** TI validator + BLOCK cases 4/4 potvrđeni. Nema timeoutera (180s fix aktivan).
C2 prošla TI validator, failala na CR `char_limit` (X 288/280) — P2-11 yield razred.
C1 TI self-blok na `missing_source` (web search nije našao validan trend) — ispravno ponašanje, nije TI validator bug.
Nema TI validator regresija. P0-2 zatvoreno.

---

## ✅ P1-5: OPENAI_API_KEY env mismatch (mcp-server) — ZATVORENO 2026-06-12

**Status:** DONE
**Zatvoreno:** 2026-06-12 (`as_diagnose_models` potvrđen: `sk-p…c-EA`, 0 broken agenata)
**Uzrok:** Railway service-level `OPENAI_API_KEY` bio placeholder. Korisnik postavio pravi ključ + Force Rebuild mcp-servera.
`isKeySet` hardening (`PLACEHOLDER_PATTERN` regex) deployovan u `e50d790` kao dodatna zaštita.

---

## P1-11: HW/CR/TI yield — kanonski primeri, char_limit, banned reči

**Status:** BACKLOG — **RADITI ODMAH POSLE P1-3**
**Prioritet podignut:** 2026-06-12 (reproducibilan u 4/5 eval runova)
**Identifikovano:** 2026-06-12
**Kontekst:** Pipeline SMOKE testovi (C1-C3) failuju na yield probleme u HW/CR/TI:
- `banned_phrase`: "boost", "enhance" (4 runa)
- `char_limit`: X post 288/280 (C2 run `cmqb7agbf`)
- `missing_source`: TI ne nalazi validan trend u web searchu (C1 run `cmqb7agbf`)
CR i TI validator rade PO DIZAJNU — gatevi se NE labave.
Problem je na modelu: promptovi nemaju dovoljno kanonskih primjera koji pokazuju željenu formu.
**Merilo zatvaranja:** C1-C3 pipeline smoke eval stabilan (3/3 PASS) kroz 3 uzastopna re-runa,
bez izmene validatora.
**Preduslov:** P1-3 završen (isti princip prompt inžinjerings).
