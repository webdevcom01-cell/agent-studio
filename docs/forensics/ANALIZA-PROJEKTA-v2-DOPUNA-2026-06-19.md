# Agent Studio — Dopunska (finalna) analiza, 2026-06-19

> Cilj: poslednji ciljani prolaz kroz uglove koje raniji prolazi nisu dubinski dirali,
> plus re-merenje dva otvorena rizika iz v2. Sve izmereno komandom iz koda; ništa pretpostavljeno.
> Ovo dopunjuje `ANALIZA-PROJEKTA-v2-2026-06-19.md`.

---

## 1. Re-merenje otvorenih rizika iz v2 — uglavnom ZATVORENI 🟢

### 1.1 Nevalidirani javni JSON-RPC ulazi (K-001, K-003) → **ZATVORENO**
Iz `AUDIT-type-safety.md` su bili označeni kao KRITIČNO. Sada, verifikovano:
- **A2A ruta** (`agents/[agentId]/a2a/route.ts`): koristi `A2ARequestSchema.safeParse(rawBody)` (Zod). Nema više sirovog `as JsonRpcRequest`. (4 zod upotrebe u fajlu.)
- **MCP ruta** (`mcp/agent-studio/route.ts`): koristi `McpRequestSchema.safeParse(raw)`. Validira ulaz.

### 1.2 Type-safety dug → **uglavnom otplaćen**
- `as any` (van testova): **3** (od kojih je 1 samo komentar; 2 su `config` cast u `webhook-trigger` ruti).
  - *Napomena o poštenju:* raniji broj „206" iz v1 koristio je širi obrazac (`: any` anotacije + `as any`), pa nije direktno uporediv. Čisti `as any` je danas 3.
- `@ts-ignore` / `@ts-expect-error` (van testova): **0** (bilo 13).
- Preostali nevalidiran cast: **1** — `cli-generator/[generationId]/advance/route.ts:81` (`await req.json() as { config?: PipelineConfig }`). Interna ruta, ne javni JSON-RPC ulaz → nizak rizik. Jedina preostala sitnica.
- `TODO/FIXME/HACK` (van testova): **16** (bilo ~42).

**Zaključak:** glavni bezbednosni nalaz iz ranijih prolaza (nevalidirani javni endpointi) više ne stoji.

---

## 2. Nedirani uglovi — sada pokriveni (verifikovano)

### 2.1 Agentski dev-alat slojevi (`.agents`, `.claude`) — ranije nepokriveni
- **`.agents/`** — 199 fajlova (97 json, 56 md, 24 csv, 11 py). Skills: `ui-ux-pro-max`, `agent-auditor`(+workspace), `agent-creator`(+workspace), `agent-studio-session`.
- **`.claude/`** — 225 fajlova: `commands` (11), `skills` (7), `rules` (4), `scripts`, `docs`, `settings.local.json`.
  - Skills uključuju: `agent-auditor`, `agent-creator`, `agent-studio-session`, `ui-ux-pro-max`, i **`rls-status-checker`** (v1.0.0) — read-only dashboard RLS rollout-a kroz git/CI/Railway/PostgreSQL, sa `reference/check-queries.sql`. Tj. postoji namenski alat za proveru RLS cutover-a (produktivizovana verzija Faza-0 provera).
- **`.codex/`** (1), **`.obsidian/`** (10), **`.github/`** (14).
- Ovo je sloj **alata za razvoj agenata oko repo-a**, ne kod proizvoda — ali je značajan (424 fajla zajedno) i sada je svrstan.

### 2.2 CI/CD (`.github/workflows`) — sadržaj
5 workflow-a: **CI**, **CodeQL** (SAST), **Docker Build & Push**, **Deploy Docs**, **Release** (release-please). Sve GitHub akcije su **pinovane na SHA** (npr. `actions/checkout@de0fac2…`) — supply-chain dobra praksa.

### 2.3 Konfiguracioni surface
- **`.env.example`** — 10 aktivnih varijabli: `AUTH_GITHUB_ID/SECRET`, `AUTH_GOOGLE_ID/SECRET`, `AUTH_SECRET`, `DATABASE_URL`, `DIRECT_URL`, `OPENAI_API_KEY`, `DEEPSEEK_API_KEY`, `REDIS_URL`. (Dodatni provideri/`DATABASE_URL_APP_USER`/`ADMIN_USER` su opcioni/zakomentarisani.)
- **`middleware.ts`** — eksplicitno dokumentovan kao **UX-guard (samo redirect), NE security granica**; stvarna zaštita je `requireAuth()`/`requireAgentOwner()` u API rutama. Pažljivo rukovanje NextAuth v5 cookie pinning-om. (Dobra, poštena bezbednosna dokumentacija.)

### 2.4 Izvršni/background surface
- **Cron rute: 7**, **webhook rute: 9**, **schedule rute: 7** — async/okidački ulazi.
- Node registry (`handlers/index.ts`): ~**69 registrovanih** node tipova (137 „Handler" referenci = import + registracija).
- **`public/`** 3 fajla; **`patches/`** 1 (`@auth+core@0.34.3.patch`).

---

## 3. Jedini stvarno otvoren item: produkcioni RLS cutover (i dalje neproverljivo iz repo-a)

Verifikovano iz koda:
- `DATABASE_URL_APP_USER` se **ne koristi nigde u `src/`** — app ne ožičuje zaseban app_user runtime klijent kroz kod. (To je očekivano: cutover se radi na ENV nivou — postaviti sam `DATABASE_URL` na `app_user`.)
- `prismaAdmin` koristi `DATABASE_URL_ADMIN_USER` (BYPASSRLS) — naš commit-ovani rad.
- E2E već koristi app_user/admin_user (commit `850f9d4`).

**Šta to znači:** da li produkcioni `DATABASE_URL` sada konektuje kao `app_user` (čime RLS stvarno počinje da izoluje) **ne može se utvrditi iz repo-a** — to je živa provera. Dobra vest: tim je napravio **`rls-status-checker` skill** baš za to. Iskreno: ovo je jedini preostali korak za koji ne mogu da tvrdim da je gotov; sve ostalo (politike, ožičavanje 54 ruta, CI guard, uloge) je verifikovano u kodu.

---

## 4. Konačna potvrda kompletnosti (100%)

Pokriveno i svrstano kroz v1 + v2 + ovu dopunu:
- ✅ Sav `src/` (996 fajlova) — 12 segmenata, do nivoa modula/fajla.
- ✅ Svi podprojekti: `deal-flow-agent`, `services` (4 MCP + worker), `mcp-server`, `packages/cli`, `website`.
- ✅ Svi data/ops dirovi: `prisma`, `data`, `n8n-workflows`, `scripts`, `k8s`, `e2e`, `reports`, `docs`, `sdlc-prompts`, `prompts`, `memory`, `skills`, `agent-architect`, `soma-agent-debugger`, `soma-vault`, `backups`, `patches`, `public`, `benchmarks`, `k6`, `load-tests`, `test-results`, `playwright-report`.
- ✅ **Skriveni dirovi** (`.agents`, `.claude`, `.codex`, `.obsidian`, `.github`) — sada pokriveni (ova dopuna).
- ✅ CI/CD sadržaj, config surface (`.env.example`, `.mcp.json`, middleware), node registry, izvršni surface (cron/webhook/schedule).
- ✅ Re-mereni rizici: javni JSON-RPC validacija (zatvoreno), `as any`/`ts-ignore` (otplaćeno), TODO (16).

**Nijedan deo repo-a nije ostao nepregledan.** Jedino što ostaje van domašaja koda je status produkcione baze (RLS cutover) — za to postoji `rls-status-checker` skill i Faza-0 procedura.

---

## 5. Iskren zaključak (finalno)

Posle tri prolaza (v1, v2, ova dopuna) slika je čista i — bitno — **bolja nego na početku**:
- Bezbednosni rizici koje smo ranije našli (nevalidirani javni endpointi) su **zatvoreni**.
- Type-safety dug je gotovo nestao (`as any` → 3, `@ts-ignore` → 0).
- RLS je ožičen kroz 54 rute sa CI guardom; tooling za praćenje cutover-a postoji.
- CI je hardened (pinovane akcije, CodeQL, RLS guard).

Preostale iskrene preporuke (nepromenjene, nisu blokatori osim #1):
1. **Potvrdi/završi produkcioni RLS cutover** (`app_user` + flag) — jedini korak za koji ne mogu da tvrdim da je gotov; pokreni `rls-status-checker` ili Faza-0 upit.
2. `deal-flow-agent` → zaseban repo.
3. Koren očistiti (i dalje mnogo `.md`).
4. Obrisati `_probe_namespace.test.ts` i `_cleanup-quarantine-*` (sandbox mi nije dao da brišem).

*Sve izmereno iz repo-a 2026-06-19. Tvrdnje o produkcionoj bazi nisu davane — za to važi živa provera (rls-status-checker / Faza-0).*
