# Zadatak #1 — Multi-tenant izolacija (RLS): istraživanje spremnosti za implementaciju

> Cilj dokumenta: utvrditi **šta je tačno potrebno za uspešnu realizaciju** dovršavanja RLS-a,
> utemeljeno na stvarnom kodu (ne na zastarelom `TECH_DEBT.md`) i na aktuelnim standardima (jun 2026).
> Svaka tvrdnja o stanju repo-a je izmerena komandama; izvori za standarde su navedeni na kraju.

---

## 0. Važna korekcija drugog prolaza (poštenja radi)

U prethodnoj analizi sam, oslanjajući se na `TECH_DEBT.md` (datum: **2026-05-04**), naveo da „RLS pokriva samo `Agent` tabelu". **To više nije tačno.** Taj dokument je zastareo. Stvarne migracije u repo-u (maj–jun 2026) su znatno proširile pokrivenost. Ovo je upravo razlog zašto se sve verifikuje iz koda — i ispravljam svoj raniji nalaz.

---

## 1. Stvarno trenutno stanje (verifikovano iz koda, 2026-06-14)

### 1.1 RLS je uključen na 19 tabela (ne 1)
Mereno: `grep 'ENABLE ROW LEVEL SECURITY' prisma/migrations`.

```
Agent, AgentPermissionGrant, AgentSkillPermission, ApprovalPolicy,
CompanyMission, Department, EvalResult, EvalRun, EvalSuite, Flow,
Goal, HeartbeatConfig, HeartbeatContext, HeartbeatRun, Invitation,
KnowledgeBase, OrganizationMember, PolicyDecision, WebhookConfig
```
14 RLS migracija, faza po faza (`20240108_enable_rls` → `20260605_rls_phase1_policydecision`).

### 1.2 Arhitektura izolacije je već dobro postavljena
- **Pattern:** `withOrgContext(client, orgId, fn)` u `src/lib/db/rls-middleware.ts` — otvara `$transaction`, postavlja `set_config('app.current_org_id', orgId, true)`, i izvršava upite na **istoj pinovanoj konekciji** (ispravno rešava problem da `set_config` i upiti ne završe na različitim konekcijama iz pool-a).
- **Per-request kontekst:** `src/lib/context/org-context.ts` koristi `AsyncLocalStorage` (`runWithOrgId` / `getCurrentOrgId`).
- **Feature flag:** `rls-enforcement` (`src/lib/feature-flags/index.ts`) — enforcement se može uključiti/isključiti, sa env override-om. Trenutno se ponaša „fail-open" kada je flag isključen.
- **Admin bypass:** migracije koriste `FORCE ROW LEVEL SECURITY` + odvojene DB uloge (`DATABASE_URL_APP_USER` / `DATABASE_URL_ADMIN_USER` u `.env.example`); admin uloga ima `BYPASSRLS` za cron/migracije.
- **Indeksi:** 11 `@@index([organizationId…])` u šemi → performanse tenant-filtera pokrivene.
- **Postojeća skill-podrška:** `skills/rls-rollout/` (v1.1.0) — 6 gated koraka, sa test paketom (`cross-tenant.test.ts`, `performance.test.ts`, `public-routes.test.ts`, `admin-routes.test.ts`, `worker-tenant-context.test.ts`, `gdpr-export.test.ts`).
- **Postojeći testovi:** `src/lib/db/__tests__/rls-middleware.test.ts`, `src/lib/api/__tests__/tenant-context.test.ts`.

### 1.3 Stvarni preostali jaz (ovo je pravi zadatak)
Mereno: `grep -rl withOrgContext src/app/api | wc -l` → **16**, a ukupno `route.ts` fajlova → **165**.

> **`withOrgContext()` je ožičen u 16 od 165 ruta (~10%).** Ostalih ~149 ruta čita/piše Prisma bez postavljanja org konteksta. Dok je `rls-enforcement` flag isključen, to „radi" jer RLS ne presreće; čim se flag uključi, neožičene rute će ili vraćati prazne rezultate ili pucati.

Već ožičene rute (16): `goals`, `departments`, `policies`, `decisions`, `mission`, `invites`, `orgs/[orgId]/invite`, `agents/[agentId]/permissions|pending-approvals|heartbeat*`.

**Najrizičnije neožičene rute (visok promet + tenant podaci):** `agents/*` (CRUD), `flows/*`, `knowledge*`, `evals/*`, `webhooks/*`, `api-keys/*`, `mcp-servers/*`.

---

## 2. Šta tačno znači „uspešna realizacija" (definicija gotovog)

Zadatak je uspešno realizovan kada:

1. **Sve tenant-rute** koje dodiruju 19 RLS tabela izvršavaju Prisma upite kroz `withOrgContext()` (ili eksplicitno označen admin-bypass).
2. **`rls-enforcement` flag je uključen u produkciji** bez regresija (staged: dev → staging → % produkcije → 100%).
3. **Cross-tenant test** dokazuje da org A ne može pročitati/izmeniti podatke org B ni preko jedne rute (ni preko zaboravljenog `WHERE`).
4. **Admin/cron/worker** putevi i dalje rade (BYPASSRLS uloga), uključujući GDPR export i scheduled izvršavanja.
5. **Performanse** ostaju u granicama (transakcija-po-zahtevu + indeksi; izmereno `performance.test.ts`).
6. **Nema „fail-open" rupa:** kada org kontekst nedostaje na tenant ruti, ponašanje je sigurno (odbij/prazno), ne tiho propuštanje.

---

## 3. Šta je potrebno za realizaciju — preduslovi i resursi

### 3.1 Tehnički preduslovi (status)
| Preduslov | Status | Napomena |
|---|---|---|
| `organizationId` kolone na tenant tabelama | ✅ delom (28 polja, 19 tabela pod RLS) | Proveriti `Flow`/`KnowledgeBase` (izolacija preko Agent FK vs. direktna kolona) |
| Indeks na `organizationId` | ✅ 11 indeksa | Dodati za svaku tabelu koja se često filtrira |
| `FORCE ROW LEVEL SECURITY` | ✅ u migracijama | Sprečava da app-owner zaobiđe politiku |
| Odvojene DB uloge (app vs admin BYPASSRLS) | ⚠️ definisano u `.env.example`, treba potvrditi u produkciji | Kritično: app konekcija NE sme imati BYPASSRLS |
| `withOrgContext` helper | ✅ postoji i testiran | Ne menjati pattern, samo proširiti upotrebu |
| Feature flag staged rollout | ✅ postoji (`rls-enforcement`) | Mehanizam za bezbedno uključivanje |

### 3.2 Šta nedostaje / treba uraditi
1. **Ožičavanje ~149 ruta** — mehanički ali obiman posao; uraditi po domenima (agents → flows → knowledge → evals → webhooks → ostalo).
2. **Potvrda DB uloga u produkciji** — da app konekcija (`DATABASE_URL`) nema BYPASSRLS, a admin (`DATABASE_URL_ADMIN_USER`) ima. Bez ovoga RLS je „dekoracija".
3. **Worker/cron tenant-kontekst** — pozadinski poslovi (BullMQ, scheduler) moraju ili postaviti org kontekst ili svesno koristiti admin ulogu.
4. **Odluka o `null` org (lični agenti)** — politika već ima granu za `organizationId IS NULL`; potvrditi da je namerno i konzistentno.
5. **Validacija javnih JSON-RPC ulaza** (A2A/MCP) — povezano: ove rute moraju razrešiti org pre nego dođu do baze (vidi Zadatak #2).

### 3.3 Ljudski/procesni resursi
- Pristup **produkcionoj bazi** (kreiranje/provera uloga) — verovatno samo vlasnik.
- **Staging okruženje** za testiranje enforcement flag-a pre produkcije.
- Vreme: procena (jedan developer) — wiring 149 ruta nije težak ali je dugotrajan; realnije u 3–5 grupa nego odjednom.

---

## 4. Preporučeni redosled implementacije (fazno, sa gate-ovima)

> Napomena: repo već ima `rls-rollout` skill sa 6 gated koraka. Predlog ispod je usklađen s tim i sa aktuelnim SaaS RLS praksama (jun 2026).

**Faza 0 — Bezbednosna osnova (pre koda):**
- Potvrdi u produkciji: app uloga bez BYPASSRLS, admin uloga sa BYPASSRLS, `FORCE RLS` aktivan.
- Bez ovoga, ostalo nema efekta.

**Faza 1 — Wiring po domenima (flag ostaje ISKLJUČEN):**
- Grupa A: `agents/*` (najveći rizik). Grupa B: `flows/*`. Grupa C: `knowledge*`. Grupa D: `evals/*`, `webhooks/*`. Grupa E: ostatak.
- Posle svake grupe: pokreni postojeće testove + dodaj cross-tenant slučaj za te rute.

**Faza 2 — Cross-tenant verifikacija (staging, flag UKLJUČEN):**
- Pokreni `cross-tenant.test.ts` / `public-routes.test.ts` / `admin-routes.test.ts` na stagingu sa uključenim flag-om.
- Proveri worker/cron/GDPR export pod enforcement-om.

**Faza 3 — Staged produkcija:**
- Uključi `rls-enforcement` na malom % saobraćaja (env override), prati Sentry/logove, pa 100%.
- Definiši rollback: isključi flag → vraćanje na pre-enforcement ponašanje (bez deploya).

**Faza 4 — Čišćenje:**
- Ukloni „fail-open" grane gde više nisu potrebne; ukloni `@deprecated registerRLSMiddleware` kada testovi migriraju.

---

## 5. Rizici i kako ih neutralisati

| Rizik | Verovatnoća | Posledica | Mitigacija |
|---|---|---|---|
| App DB uloga ima BYPASSRLS u produkciji | Srednja | RLS bez efekta (lažna sigurnost) | Faza 0 provera pre svega; test koji to dokazuje |
| Enforcement uključen pre wiring-a → rute pucaju/prazne | Visoka ako se preskoči redosled | Pad funkcionalnosti | Flag ostaje isključen do kraja Faze 1; staged rollout |
| `set_config` „iscuri" između tenant-a preko pool-a | Niska (pattern je ispravan) | Curenje podataka | Zadržati `$transaction` pinning; ne pozivati upite van `tx` |
| Worker/cron bez org konteksta pod enforcement-om | Srednja | Pozadinski poslovi padaju | Eksplicitan admin-bypass ili postavljanje konteksta u workeru |
| Performanse (transakcija po zahtevu) | Niska | Latencija | Indeksi (postoje) + `performance.test.ts` kao gate |
| Regresija u 149 ruta | Srednja | Bug-ovi | Wiring po grupama, ne odjednom; CI posle svake grupe |

---

## 6. Usklađenost sa aktuelnim standardima (jun 2026) — provera

Trenutna implementacija je **u skladu** sa preporučenim 2026 obrascima za Postgres RLS + Prisma:

- ✅ `set_config(..., true)` (transaction-local) unutar `$transaction` — preporučeni obrazac za pinovanje konekcije.
- ✅ `FORCE ROW LEVEL SECURITY` (česta zaboravljena stavka — ovde postoji).
- ✅ Indeks na `tenantId/organizationId` (sprečava full scan — postoji).
- ✅ Odvojena `BYPASSRLS` uloga za admin/agregacije/cron.
- ✅ `app.*` namespace za session varijablu (`app.current_org_id`).
- ⚠️ Jedino što standardi naglašavaju a treba **potvrditi u produkciji**: da konekcioni pooler (PgBouncer/Railway) radi u režimu koji ne deli session state između tenant-a — pošto se koristi transaction-scoped `set_config`, transaction-mode pooling je kompatibilan, ali to treba eksplicitno verifikovati.

Zaključak: ne treba redizajn — treba **dovršavanje pokrivenosti i bezbedan rollout**.

---

## 7. Iskrena procena i preporuka

Dobra vest: ovo je **mnogo bliže gotovom nego što je izgledalo**. Arhitektura je tačna, prati 2026 standarde, ima feature flag, indekse, odvojene uloge i čak namenski skill sa testovima. Loša vest: „poslednjih 90% ruta" je dugotrajan, pažljiv posao i lako se preskoči Faza 0 (DB uloge), čime ceo trud postaje kozmetički.

**Moja preporuka za „sledeći zadatak" konkretno:**
1. Prvo uradi **Fazu 0** (provera produkcionih DB uloga) — to je 1 sat posla a odlučuje da li RLS uopšte išta znači.
2. Zatim **Grupa A (`agents/*`)** wiring kao pilot — dokaži ceo lanac (wiring → cross-tenant test → flag na stagingu) na jednom domenu pre nego što skaliraš na ostatak.
3. Tek kad pilot prođe, mehanički proširi na grupe B–E.

Ako želiš, sledeći korak mogu da budu: (a) konkretan **audit Faze 0** (proverim role/flag/pooling stanje iz koda i env-a i dam ti tačnu checklistu), ili (b) **pilot plan za `agents/*`** sa tačnim fajlovima koje treba izmeniti i test slučajevima. Reci koji.

---

### Izvori (standardi, jun 2026)
- [How to Secure Multi-Tenant Data with Row-Level Security in PostgreSQL — OneUptime](https://oneuptime.com/blog/post/2026-01-25-row-level-security-postgresql/view)
- [Securing Multi-Tenant Applications Using RLS in PostgreSQL with Prisma ORM — Medium](https://medium.com/@francolabuschagne90/securing-multi-tenant-applications-using-row-level-security-in-postgresql-with-prisma-orm-4237f4d4bd35)
- [Building a Multi-Tenant SaaS in 2026: Architecture, Pitfalls, and Production Patterns — GSoft](https://gsoftconsulting.com/en/blog/building-multi-tenant-saas-2026)
- [How to Implement PostgreSQL Row Level Security for Multi-Tenant SaaS — techbuddies.io](https://www.techbuddies.io/2026/01/01/how-to-implement-postgresql-row-level-security-for-multi-tenant-saas/)
- [prisma/prisma-client-extensions — row-level-security (zvanični primer)](https://github.com/prisma/prisma-client-extensions/tree/main/row-level-security)

*Stanje repo-a izmereno 2026-06-14 iz `/Desktop/agent-studio`. Brojevi (19 tabela, 16/165 ruta, 11 indeksa, 14 migracija) dobijeni direktno iz koda.*
