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

## 🔴 OVA NEDELJA (Sprint 2: 5. – 9. maj 2026)
> Max 5 stavki. P0/P1 = blokiraju stabilnost ili Faza 1 SaaS pripremu.

- [ ] **ENV-01** `REDIS_URL` lokalno — Odkomentarisati u `.env.local`, pokrenuti Redis lokalno ili koristiti Upstash. BullMQ bez Redisa → silent fail u lokalnom dev-u.
- [ ] **SEC-06** OAuth token encryption migracija — `tokensEncrypted: Boolean` polje u schema.prisma je već tu. Implementirati zero-downtime encrypt/decrypt. → `prisma/schema.prisma`
- ✅ **DEBT-02** (2026-04-28) E2E CI automatizacija — github.event_name == 'push' dodat u ci.yml. E2E sada radi na svakom push na main.
- ✅ **SEC-07** (2026-04-28) Dependabot PRs — mergováno: #51, #50, #48, #65, #59, #60, #61, #62, #46. Zatvoreno: #66 (pnpm-lock conflict).
- ✅ **GIT-03** (2026-04-28) Stale remote grane obrisane — fix/git-node-template-resolution, sdlc/* već bile obrisane ili uklonjene.

---

## 🟡 SLEDEĆA NEDELJA (Sprint 3: 12. – 16. maj 2026)
> Max 5 stavki. P1 = važni za kvalitet agenata i Faza 1 pripremu.

- [ ] **AGENT-03** Code Gen Agent — PR Gate score 43/48. Implementovati `project_context` i `sandbox_verify` node types per AGENT-IMPROVEMENT-PLAN.md.
- [ ] **DEBT-05** ESLint suppressions audit — 11 `eslint-disable` komentara. Proveriti da li su još relevantni ili se mogu ukloniti.
- [ ] **DEBT-06** Knip unused exports — Posle baselineа (DEBT-01), postupno uklanjati unused code. Fokus na top 10 najlakših.
- [ ] **INFRA-03** Vercel deployment verifikacija — Proveriti da li je Vercel connected i properly configured kao secondary target.
- [ ] **SEC-05** AuditLog proširiti — Doplatiti `AuditLog` table za admin akcije (user management, org changes). Trenutno loguje samo MCP tool denials i flow executions.

---

## 🟢 BACKLOG (prioritizovano po kategoriji)

### 🔒 Sigurnost & Compliance
- [ ] **SEC-08** `SENTRY_DSN` setup — Sentry za production error tracking (zasebno od OTEL tracing-a). Optional ali preporučeno za Faza 1.

### 🚀 SaaS Migracija (Faza 1 → Oktobar 2026)
- [ ] **SAAS-02** Stripe Billing infrastruktura — Faza 5 target. Subscription model: Free/Pro/Enterprise. Metering po broju executions.
- [ ] **SAAS-03** Multi-tenant Organizations — `Organization` model u Prisma postoji. Implementirati tenant isolation u API layer-u.
- [ ] **SAAS-04** Usage metering — BullMQ job za beleženje token/execution korišćenja po organizaciji. Prerequisit za billing.
- [ ] **SAAS-05** Faza 1: Agent Marketplace — Public agent catalog, clone/fork workflow, rating sistem.

### 🤖 Kvalitet Agenata
- [ ] **AGENT-01** 16 agenata "Need Improvement" — Poboljšati prema scoring rubric iz AGENT-EVAL-RESULTS.md. Fokus na system prompt kvalitet i tool selection.
- [ ] **AGENT-02** 11 agenata "Critical Gaps" — Refaktorisati ili obrisati. Proceniti koji imaju business value.
- [ ] **AGENT-04** Swarm Security Analyst flagship — 67/70. Ostale 2 poene: poboljšati cost estimation i cross-agent deduplication.
- [ ] **AGENT-05** SDLC-AGENTS-PLAN.md faze 0-9 — Sve faze "Pending". Infra je kompletna, treba pokrenuti implementaciju 4 nova agenta + 3 upgrade-a.

### ⚙️ Infrastruktura & DevOps
- [ ] **INFRA-04** pgvector 0.8.2 upgrade plan — Pratiti Railway PostgreSQL + pgvector kompatibilnost pri future Postgres upgrades.
- [ ] **INFRA-05** Docker Compose za lokalni dev — Verifikovati da `docker-compose.yml` pokreće sve servise (DB + Redis) bez manuelnih koraka.

---

## ✅ DONE

### Sprint 1 — 28. apr 2026 ✅ ZATVOREN

> **Retrospektiva:** Izvanredan sprint. Faza 0 SaaS acceptance criteria postignuta u jednom danu (4/4 zelena). 
> Blokiralo: git lock fajlovi pri paralelnom brisanju grana, NEXTAUTH_SECRET nije bio nigde setovan.
> Išlo glatko: RBAC implementacija, AuditLog wiring, OTEL dijagnoza (već bio konfigurisan u produkciji).
> **GIT-02 otkazan** — grana `fix/human-approval-conversational-fallback` nikad nije postojala na remote-u. Lažan zapis uklonjen.

**Iz Ova nedelja:**
- ✅ **SEC-01** (2026-04-28) `ADMIN_USER_IDS` — Setovano u Railway env vars i lokalno u `.env.local`.
- ✅ **SEC-02** (2026-04-28) `CRON_SECRET` — Generisan i dodat u Railway + lokalno.
- ✅ **DEP-01** (2026-04-28) Axios CVE Dependabot PR — Reviewovan i mergovan.
- ✅ **GIT-01** (2026-04-28) Merge `fix/git-node-template-resolution` → `main` — PR #56 squash merge.

**Iz Sledeća nedelja:**
- ✅ **SEC-03** (2026-04-28) RBAC enforcement u `mcp-tool-handler` — Gate 0 org membership + Gate 1 tool allowlist. Faza 0 ✓
- ✅ **INFRA-01** (2026-04-28) Railway ECC `numReplicas: 2` — Verifikovano, već aktivno 2/2 replicas. Faza 0 ✓
- ✅ **DEBT-01** (2026-04-28) Knip baseline — 87 unused exports, 8 unused files, 18 unused deps. Zabeleženo u TECH_DEBT.md.
- ✅ **CLEANUP-01** (2026-04-28) Obrisati 15 dummy/test agenata — SQL izvršen, 15 agenata obrisano.

**Iz Backlog:**
- ✅ **INFRA-02** (2026-04-28) Render.yaml fix — `pnpm db:push` → `prisma migrate deploy`.
- ✅ **DEBT-03** (2026-04-28) 5 lokalnih grana obrisano.
- ✅ **DEBT-04** (2026-04-28) `_tmp_*` fajlovi obrisani iz root-a.
- ✅ **SEC-04** (2026-04-28) OTEL — `OTEL_EXPORTER_OTLP_ENDPOINT` + `OTEL_SERVICE_NAME` dodati lokalno. Grafana Cloud prima podatke i lokalno i na Railway. Faza 0 ✓
- ✅ **SAAS-01** (2026-04-28) Faza 0 Acceptance Criteria — **SVA 4 KRITERIJUMA ZELENA** (ECC ✅ RBAC ✅ AuditLog ✅ OTEL ✅).

**Bonus (van originalnog board-a):**
- ✅ (2026-04-28) `NEXTAUTH_SECRET` dodat u Railway + `.env.local`
- ✅ (2026-04-28) AuditLog wired za RBAC denials u `mcp-tool-handler` (`ACCESS_DENIED` events)
- ✅ (2026-04-28) follow-redirects, production-dependencies (20 pak.), dev-dependencies (5 pak.), vite 6.3.2, xmldom 0.9.10 — Dependabot merges
- ✅ (2026-04-28) Test bug fix: `schema-drift-empty-data.test.ts` import path

---

## 📊 Sprint Metrike

| Metrika | Sprint 1 Cilj | Sprint 1 Rezultat |
|---------|--------------|-------------------|
| Ova nedelja završeno | 4/4 | 4/4 ✅ |
| Sledeća nedelja završeno | 4/4 | 4/4 ✅ |
| Backlog stavki završeno | 3 | 5 ✅ (+ bonus) |
| Faza 0 kriterijumi | 4/4 green | **4/4 ✅ SVE ZELENO 🎉** |
| Critical CVEs | 0 | 0 ✅ |
| Stale grane obrisane | - | 5 lokalnih ✅ |

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
| `TECH_DEBT.md` | Knip baseline (2026-04-28): 87 unused exports, 8 files, 18 deps |
| `SAAS-MIGRATION-PLAN.md` | 24-nedeljni SaaS roadmap, Faza 0-8 |
| `AGENT-EVAL-RESULTS.md` | 7D scoring rubric, SQL za brisanje dummy agenata |
| `AGENT-IMPROVEMENT-PLAN.md` | Root cause: Code Gen Agent PR Gate fail |
| `SDLC-AGENTS-PLAN.md` | 4 nova agenta + 3 upgrade-a, sve faze pending |
| `CHANGELOG.md` | Semantic versioning, 55→61 node, 2880→3211 testova |
| `Agent-Studio-Forensic-Analysis-2026-04-27.docx` | Kompletna forenzička analiza |

---

*SPRINT-BOARD.md kreiran: 2026-04-27 | Sprint 1 zatvoren: 2026-04-28 | Sledeći Monthly Review: poslednji petak maja 2026*
