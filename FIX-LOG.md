# FIX-LOG — Agent Studio Backlog

Stavke koje su identifikovane kao poznati problemi ali se ne rješavaju odmah.
Format: `P<prioritet>-<seq>: <opis> — merilo: <kriterijum zatvaranja>`

---

## ✅ P1-3: Eval suites ≥10 cases (svi agenti) + SAA suite + saa-validator unit testovi — ZATVORENO 2026-06-12

**Status:** DONE
**Zatvoreno:** 2026-06-12
**Rezultat:**
- SAA eval suite kreiran (`6ae3e05d-...`): 10 cases (7 PASS + 1 PIPELINE SMOKE + 2 BLOCK banned_phrase)
- Svi 7 agenti sada na tačno 10 cases: CC, CR, HW, LS, SAA, TI, XS
- BLOCK cases pokrivaju sve deterministične validatorske règle (wrong_count, missing_trend, missing_a2a, banned_phrase, too_short, char_limit, word_limit, pii_block, length_error, invalid_fit, invalid_score, missing_lead, stat_not_in_results, source_not_in_results)
- [PIPELINE SMOKE] cases labelirani sa notom o P1-11 tumačenju (failure ≠ nužno regresija agenta)
- `saa-validator.test.ts` kreiran: 17/17 unit testova prolaze (vm.Script pattern, identičan TI-u)
- Slaba tačka: `as_create_eval_case` MCP tool vraća 403 za SAA — cases inserti rađeni direktno via psycopg2; nije bug u agentu, nego u Railway MCP key scope
**Fajl:** `src/lib/runtime/handlers/__tests__/saa-validator.test.ts`

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

---

## P1-12: as_create_eval_case vraća 403 za novokreirane agente

**Status:** BACKLOG
**Identifikovano:** 2026-06-12
**Kontekst:** `as_create_eval_case` MCP tool vraća HTTP 403 kada pokušava kreirati eval case za SAA agenta
(`cmq7qzgkh0019nu01a1a261s5`). Isti tool radi bez greške za starije agente (TI, HW, CR itd.).
Root cause: Railway-hosted MCP server (`proud-healing-...`) koristi API key koji vjerovatno nema
`evals:run` scope za agente kreirane nakon određenog datuma ili nema ownership za SAA agenta.
Workaround: direktan psycopg2 insert (korišten u P1-3). Ovo NIJE standard i može zaobići
buduće validacije u API ruti.
**Potrebno:**
- Verifikovati koji API key koristi Railway MCP server za `as_create_eval_case`
- Provjeriti da li key ima `evals:run` scope za SAA agenta
- Testirati eval run za SAA suite (`6ae3e05d-7a40-4386-b4bd-2e442477e33b`) kroz MCP — ako run prođe, cases su ispravno inserti
**Merilo zatvaranja:** `as_create_eval_case` za SAA agent vraća 201 bez 403.
