# SPRINT-BOARD.md
> Zamenjuje TASKS.md (97%+ završen, april 2026). Operativni tracker za tekuće poboljšanje projekta.
> **Pravila**: Max 5 stavki po aktivnoj koloni. Svake nedelje: pomeri završeno u Done, promovi iz Backlog-a.

---

## Sistem izvršavanja

| Sloj | Ritam | Cilj |
|------|-------|------|
| 🔴 Zero Tolerance | Odmah (< 1 dan) | Kritične ranjivosti — ne spava se dok nije rešeno |
| 🟡 Weekly Sprint | Ponedeljak → Petak | Max 5 stavki u Ova nedelja, max 5 u Sledeća nedelja |
| 🟢 Monthly Review | Poslednji petak u mesecu | Backlog čišćenje, prioritizacija, retrospektiva |

---

## 🔴 OVA NEDELJA (Sprint: 28. apr – 2. maj 2026)
> Max 5 stavki. P0 = blokiraju produkcijsku sigurnost ili CI/CD.

- [ ] **GIT-02** Merge `fix/human-approval-conversational-fallback` → `main` — Isto kao GIT-01.

---

## 🟡 SLEDEĆA NEDELJA (Sprint: 5. – 9. maj 2026)
> Max 5 stavki. P1 = važni za stabilnost, kvalitet ili Faza 0 SaaS kriterijume.

- [ ] **ENV-01** `REDIS_URL` lokalno — Odkomentarisati u `.env.local`, pokrenuti Redis lokalno ili koristiti Upstash. BullMQ bez Redisa → silent fail.

---

## 🟢 BACKLOG (prioritizovano po kategoriji)

### 🔒 Sigurnost & Compliance
- [ ] **SEC-04** `SENTRY_DSN` + `OTEL_EXPORTER_OTLP_ENDPOINT` — Setovati za production error tracking i tracing. Faza 0 kriterijum.
- [ ] **SEC-05** AuditLog proširiti — Doplatiti `AuditLog` table za sve admin akcije. Trenutno underused. Faza 0 kriterijum.
- [ ] **SEC-06** OAuth token encryption migracija — `tokensEncrypted: Boolean` polje u schema.prisma je već tu. Implementirati zero-downtime encrypt/decrypt. → `prisma/schema.prisma`
- [ ] **SEC-07** Pregled svih Dependabot PRs (remaining) — Ostali Dependabot PRs posle DEP-01. Review + merge ili dismiss sa razlogom.

### 🚀 SaaS Migracija (Faza 0 → Oktobar 2026)
- [ ] **SAAS-01** Faza 0 Acceptance Criteria — Sva 4 kriterijuma moraju biti green pre prelaska na Faza 1: ECC HA, RBAC, AuditLog, OTEL.
- [ ] **SAAS-02** Stripe Billing infrastruktura — Faza 5 target. Subscription model: Free/Pro/Enterprise. Metering po broju executions.
- [ ] **SAAS-03** Multi-tenant Organizations — `Organization` model u Prisma postoji. Implementirati tenant isolation u API layer-u.
- [ ] **SAAS-04** Usage metering — BullMQ job za beleženje token/execution korišćenja po organizaciji. Prerequisit za billing.
- [ ] **SAAS-05** Faza 1: Agent Marketplace — Public agent catalog, clone/fork workflow, rating sistem.

### 🤖 Kvalitet Agenata
- [ ] **AGENT-01** 16 agenata "Need Improvement" — Poboljšati prema scoring rubric iz AGENT-EVAL-RESULTS.md. Fokus na system prompt kvalitet i tool selection.
- [ ] **AGENT-02** 11 agenata "Critical Gaps" — Refaktorisati ili obrisati. Proceniti koji imaju business value.
- [ ] **AGENT-03** Code Gen Agent — PR Gate score 43/48. Implementovati `project_context` i `sandbox_verify` node types per AGENT-IMPROVEMENT-PLAN.md.
- [ ] **AGENT-04** Swarm Security Analyst flagship — 67/70. Ostale 2 poene: poboljšati cost estimation i cross-agent deduplication.
- [ ] **AGENT-05** SDLC-AGENTS-PLAN.md faze 0-9 — Sve faze "Pending". Infra je kompletna, treba pokrenuti implementaciju 4 nova agenta + 3 upgrade-a.

### 🏗 Tehnički Dug
- [ ] **DEBT-02** E2E testovi CI automatizacija — Trenutno samo `workflow_dispatch` (manuelno). Dodati na pull_request trigger. → `.github/workflows/ci.yml`
- [ ] **DEBT-05** ESLint suppressions audit — 11 `eslint-disable` komentara. Proveriti da li su još relevantni ili se mogu ukloniti.
- [ ] **DEBT-06** Knip unused exports — Posle baselineа (DEBT-01), postupno uklanjati unused code.

### ⚙️ Infrastruktura & DevOps
- [ ] **INFRA-03** Vercel deployment verifikacija — Proveriti da li je Vercel connected i properly configured kao secondary target.
- [ ] **INFRA-04** pgvector 0.8.2 upgrade plan — Pratiti Railway PostgreSQL + pgvector kompatibilnost pri future Postgres upgrades.
- [ ] **INFRA-05** Docker Compose za lokalni dev — Verifikovati da `docker-compose.yml` pokreće sve servise (DB + Redis) bez manuelnih koraka.

---

## ✅ DONE (ovaj sprint)
> Pomeri ovde završene stavke sa datumom.

### Sprint 1 — 28. apr 2026

**Iz Ova nedelja:**
- ✅ **SEC-01** (2026-04-28) `ADMIN_USER_IDS` — Setovano u Railway env vars i lokalno u `.env.local`.
- ✅ **SEC-02** (2026-04-28) `CRON_SECRET` — Generisan i dodat u Railway + lokalno.
- ✅ **DEP-01** (2026-04-28) Axios CVE Dependabot PR — Reviewovan i mergovan.
- ✅ **GIT-01** (2026-04-28) Merge `fix/git-node-template-resolution` → `main` — PR + squash merge + branch deleted.

**Iz Sledeća nedelja:**
- ✅ **SEC-03** (2026-04-28) RBAC enforcement u `mcp-tool-handler` — Organizacijska role provera implementirana. Faza 0 ✓
- ✅ **INFRA-01** (2026-04-28) Railway ECC `numReplicas: 2` — Verifikovano, već aktivno. Faza 0 ✓
- ✅ **DEBT-01** (2026-04-28) Knip baseline — Pokrenuto, baseline zabeležen u TECH_DEBT.md.
- ✅ **CLEANUP-01** (2026-04-28) Obrisati 15 dummy/test agenata — SQL izvršen, agenti obrisani.

**Iz Backlog:**
- ✅ **INFRA-02** (2026-04-28) Render.yaml fix — `pnpm db:push` zamenjen sa `prisma migrate deploy` u `startCommand`.
- ✅ **DEBT-03** (2026-04-28) 5 lokalnih grana — Pregledano, 5 grana obrisano.
- ✅ **DEBT-04** (2026-04-28) `_tmp_*` fajlovi — Svi `_tmp_*` fajlovi obrisani iz root-a.

**Bonus (van originalnog board-a):**
- ✅ (2026-04-28) `NEXTAUTH_SECRET` dodat u Railway + `.env.local`
- ✅ (2026-04-28) follow-redirects security fix mergovan
- ✅ (2026-04-28) production-dependencies group (20 paketa) mergovan
- ✅ (2026-04-28) dev-dependencies group (5 paketa) mergovan
- ✅ (2026-04-28) vite 7.3.2 mergovan
- ✅ (2026-04-28) xmldom 0.9.10 mergovan
- ✅ (2026-04-28) Test bug fix: schema-drift-empty-data

---

## 📊 Sprint Metrike

| Metrika | Cilj | Status |
|---------|------|--------|
| Ova nedelja završeno | 5/5 | 5/5 ✅ |
| Sledeća nedelja ready | 5/5 | 1/5 (ENV-01) |
| Backlog veličina | < 30 | ~20 |
| Faza 0 kriterijumi | 4/4 green | 2/4 (RBAC ✅, ECC ✅, AuditLog ❌, OTEL ❌) |
| Critical CVEs | 0 | 0 ✅ (axios fixed) |

---

## 🔄 Pravila rotacije

1. **Svaki ponedeljak**: Premesti završene stavke u Done sekciju sa datumom.
2. **Svaki ponedeljak**: Promovi 1-2 stavke iz Sledeća nedelja → Ova nedelja.
3. **Svaki petak**: Dodaj Retrospektiva komentar (šta je blokiralo, šta je išlo glatko).
4. **Poslednji petak u mesecu**: Monthly review — čisti Backlog, reprioritiziraj, ažuriraj Sprint Metrike.
5. **Nikad više od 5 stavki** u Ova nedelja ili Sledeća nedelja. Disciplina > ambicija.

---

## 📚 Reference dokumenti

| Dokument | Opis |
|----------|------|
| `CLAUDE.md` | Projekt kontekst, tech stack, 61 node tip |
| `TECH_DEBT.md` | ESLint suppressions baseline (2026-03-27) |
| `SAAS-MIGRATION-PLAN.md` | 24-nedeljni SaaS roadmap, Faza 0-8 |
| `AGENT-EVAL-RESULTS.md` | 7D scoring rubric, SQL za brisanje dummy agenata |
| `AGENT-IMPROVEMENT-PLAN.md` | Root cause: Code Gen Agent PR Gate fail |
| `SDLC-AGENTS-PLAN.md` | 4 nova agenta + 3 upgrade-a, sve faze pending |
| `CHANGELOG.md` | Semantic versioning, 55→61 node, 2880→3211 testova |
| `Agent-Studio-Forensic-Analysis-2026-04-27.docx` | Kompletna forenzička analiza |

---

*SPRINT-BOARD.md kreiran: 2026-04-27 | Zamenjuje: TASKS.md (97%+ završen) | Sledeći Monthly Review: poslednji petak maja 2026*
