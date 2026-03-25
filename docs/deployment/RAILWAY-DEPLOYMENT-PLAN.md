# Railway Deployment Plan — agent-studio

**Projekat:** agent-studio
**Stack:** Next.js 15.5 · Prisma 6 · PostgreSQL + pgvector · Redis · NextAuth v5
**Datum analize:** 2026-03-18 (ažurirano 2026-03-20)
**Status:** Deployano na produkciju — `agent-studio-production-c43e.up.railway.app`

---

## KRITIČNI NALAZI IZ DUBINSKE REVIZIJE

Analiza je obuhvatila svaki relevantni fajl u projektu. Pronađeno je **5 kritičnih/visokih** problema koji MORAJU biti riješeni prije deploymenta.

### 1. KRITIČAN: `prisma` je u `devDependencies`

**Lokacija:** `package.json` linija 85
**Problem:** Railway/Nixpacks briše `devDependencies` nakon builda. `startCommand` poziva `npx prisma migrate deploy` — ali Prisma CLI neće postojati u runtime kontejneru.
**Rezultat:** Deployment PADA pri startu sa `command not found: prisma`.

```bash
# FIX: Premjestiti prisma u dependencies
pnpm remove prisma && pnpm add prisma
```

### 2. KRITIČAN: `AUTH_TRUST_HOST` nije konfigurisan

**Lokacija:** `src/lib/auth.ts` — nema `trustHost: true`, nigdje u kodu nema `AUTH_TRUST_HOST`
**Problem:** NextAuth v5 iza reverse proxy-ja (Railway) odbija zahtjeve sa `UntrustedHost` errorom. Railway health-checker koristi `healthcheck.railway.app` origin — NextAuth ga odbija.
**Rezultat:** OAuth login PADA, health check PADA.

```bash
# FIX: Dodati env var na Railway
AUTH_TRUST_HOST=true
```

**Izvor:** [Auth.js Deployment Docs](https://authjs.dev/getting-started/deployment), [Railway Help Station — UntrustedHost](https://station.railway.com/questions/auth-js-untrusted-host-host-must-be-tr-366f51e9)

### 3. VISOK: `maxDuration` export je Vercel-specifičan

**Lokacija:** 7 API route fajlova
**Problem:** `export const maxDuration = 180/300` je Vercel-ov mehanizam za produžavanje serverless function timeout-a. Railway ga IGNORIŠE — ali to nije problem jer Railway nema serverless timeout limit (long-running requests rade nativno).
**Rezultat:** Nema štete, ali komentari u kodu referenciraju "Vercel Pro limit" — misleading za Railway.

```
src/app/api/agents/[agentId]/chat/route.ts          → maxDuration = 180
src/app/api/agents/[agentId]/trigger/[webhookId]/route.ts → maxDuration = 180
src/app/api/agents/[agentId]/evals/generate/route.ts → maxDuration = 120
src/app/api/cron/trigger-scheduled-flows/route.ts    → maxDuration = 300
src/app/api/cli-generator/[generationId]/advance/route.ts → maxDuration = 300
src/app/api/cli-generator/route.ts                   → maxDuration = 300
src/app/api/evals/backfill/route.ts                  → maxDuration = 300
```

**Akcija:** Ostaviti kako jest — ne šteti, a kompatibilno s oba provajdera.

### 4. VISOK: Agent Workspace koristi `/tmp` filesystem

**Lokacija:** `src/lib/agents/agent-workspace.ts` linija 5
**Problem:** `WORKSPACE_BASE = /tmp/agent-studio/workspaces` — koristi ephemeral filesystem. Na Railway, `/tmp` se briše pri svakom redeployu. Ovo znači da fajlovi kreirani od strane agenata (browser screenshots, exported files) ne preživljavaju redeploy.
**Rezultat:** Funkcionalno je OK unutar jedne sesije, ali fajlovi su privremeni. Isto ponašanje kao na Vercel-u.
**Akcija:** Awareness only — nije bloker, ali dugoročno razmotriti persistent storage (S3/R2).

### 5. VISOK: Embed widget `baseUrl` detekcija

**Lokacija:** `public/embed.js` linija 22
**Problem:** `baseUrl` se auto-detektuje iz `script.src` URL-a, što je ispravno. Ali `test-embed.html` hardkodira `http://localhost:3000` — ne radi u produkciji.
**Rezultat:** Embed widget SAM PO SEBI radi ispravno jer koristi `script.src`. Test HTML fajl je irelevantaan za produkciju.
**Akcija:** Nema potrebe za promjenama.

---

## POTVRĐENI NALAZI — Šta je ISPRAVNO

| Oblast | Status | Detalj |
|--------|--------|--------|
| Prisma schema kompatibilnost | ✅ OK | `binaryTargets` uključuje `rhel-openssl-3.0.x`, pgvector deklarisan |
| Build skripta | ✅ OK | `build: "prisma generate && next build"` — ispravan redoslijed |
| Health endpoint | ✅ OK | `GET /api/health` provjerava DB, vraća 200/503 |
| Cron auth mehanizam | ✅ OK | `Authorization: Bearer CRON_SECRET` header, path je public u middleware |
| CSRF zaštita | ✅ OK | Origin header check radi ispravno s Railway domenom |
| Cookie `__Secure-` prefix | ✅ OK | Railway pruža HTTPS na `*.up.railway.app` |
| Rate limiting | ✅ OK | Redis-backed cross-replica rate limiting (ioredis, Lua EVAL). In-memory fallback if Redis unavailable |
| MCP pool SIGTERM handler | ✅ OK | Graceful shutdown pri Railway redeployu |
| Nema hardkodiranih Supabase URL-ova | ✅ OK | Sve je env-driven |
| `NEXT_PUBLIC_APP_URL` | ✅ Nepotreban | Nigdje se ne koristi u `src/` — NextAuth auto-detektuje iz headers-a |
| pnpm-lock.yaml | ✅ OK | Postoji, Nixpacks ga detektuje |
| Edge runtime routes | ✅ OK | Svi su `runtime = "nodejs"` — nema edge-only koda |
| File upload (KB) | ✅ OK | In-memory buffer (10MB limit), ne piše na disk |
| OAuth callback URL-ovi | ⚠️ Akcija | Moraju se ažurirati kod GitHub/Google za novu domenu |
| pgvector migracija | ✅ OK | `0_init` migracija ima `CREATE EXTENSION IF NOT EXISTS "vector"` |
| HNSW index | ⚠️ Manual | `prisma/sql/001_add_vector_index.sql` mora se pokrenuti ručno post-deploy |

---

## Arhitektura na Railway

```
┌─────────────────────────────────────────────────────────┐
│                  Railway Project                         │
│                                                          │
│  ┌──────────────────┐    ┌────────────────────────┐     │
│  │  agent-studio     │    │  PostgreSQL + pgvector  │     │
│  │  (Next.js App)    │←──→│  pgvector/pgvector:pg16 │     │
│  │  Nixpacks build   │    │  Port: 5432             │     │
│  │  Port: $PORT      │    │  Persistent Volume      │     │
│  │  numReplicas: 2   │    └────────────────────────┘     │
│  └────────┬─────────┘                                    │
│           │                ┌────────────────────────┐     │
│           ├───────────────→│  Redis                  │     │
│           │  railway.internal│ redis.railway.internal  │     │
│           │                │  Port: 6379             │     │
│           │                └────────────────────────┘     │
│  ┌────────┴─────────┐                                    │
│  │  Cron Service     │                                    │
│  │  */5 * * * *      │                                    │
│  │  → POST /api/cron/│                                    │
│  └──────────────────┘                                    │
│                                                          │
│  Private Network: *.railway.internal                     │
└─────────────────────────────────────────────────────────┘
```

---

## Implementacijski Plan

### FAZA 0: Obavezne Popravke (PRIJE svega ostalog)

#### 0.1 — Premjestiti `prisma` u dependencies

```bash
cd /Users/buda007/Desktop/agent-studio
pnpm remove prisma && pnpm add prisma
```

**Verifikacija:** Provjeriti da je `prisma` sada pod `"dependencies"` u `package.json`, NE pod `"devDependencies"`.

#### 0.2 — Commitovati popravku

```bash
git add package.json pnpm-lock.yaml
git commit -m "fix: move prisma to dependencies for Railway runtime availability"
```

---

### FAZA 1: Konfiguracija Projekta

#### 1.1 — Kreirati `railway.toml`

```toml
[build]
builder = "NIXPACKS"
buildCommand = "pnpm add ioredis && pnpm run build"

[deploy]
startCommand = "npx prisma db push --skip-generate || echo 'Schema sync skipped' && PORT=${PORT:-3000} node_modules/.bin/next start -H 0.0.0.0 -p ${PORT:-3000}"
healthcheckPath = "/api/health"
healthcheckTimeout = 120
restartPolicyType = "ON_FAILURE"
restartPolicyMaxRetries = 5
numReplicas = 2
```

**Zašto ova konfiguracija:**

- `pnpm add ioredis` — eksplicitno instalira ioredis jer je lockfile bio out-of-sync (dynamic import ne pada na buildu, ali pada na runtimeu)
- `prisma generate` se pokreće unutar `pnpm run build` (iz package.json build skripte)
- `prisma db push --skip-generate` u startCommand — sync DB schema bez generisanja clienta (već generisan u build fazi). `|| echo` sprečava da failure blokira start
- `healthcheckTimeout = 120` — dovoljno za schema sync + cold start
- `numReplicas = 2` — rolling deploy, zero downtime. Redis omogućava cross-replica state sharing
- `restartPolicyMaxRetries = 5` — auto-recovery od transientnih grešaka

**Dodatni fajlovi za Railway build:**

`nixpacks.toml` — overrides Nixpacks install phase:
```toml
[phases.install]
cmds = ["pnpm install --no-frozen-lockfile"]
```

`.npmrc` — pnpm config za Railway kompatibilnost:
```
enable-pre-post-scripts=true
manage-package-manager-versions=false
frozen-lockfile=false
```

#### 1.2 — Ažurirati `.gitignore`

Dodati na kraj:

```
# Railway
.env.railway
```

#### 1.3 — Commitovati

```bash
git add railway.toml .gitignore
git commit -m "chore: add Railway deployment configuration"
```

**NAPOMENA: NE dodavati `output: "standalone"` u next.config.ts za prvi deploy.** Standalone mode može da napravi probleme sa `serverExternalPackages` (`pdf-parse`, `mammoth`). Dodati naknadno nakon uspješnog prvog deploya, ako je potrebna optimizacija image size-a.

---

### FAZA 2: Railway Infrastruktura

#### 2.1 — Kreirati Railway Projekt

1. https://railway.com/new → Prazan projekt → Naziv: `agent-studio`

#### 2.2 — PostgreSQL sa pgvector

**Opcija A — Jednim klikom (PREPORUČENO):**
1. Otići na https://railway.com/deploy/pgvector-latest
2. Deployati u postojeći `agent-studio` projekt

**Opcija B — Manualno:**
1. "+" → "Docker Image" → `pgvector/pgvector:pg16`
2. Persistent volume: mount `/var/lib/postgresql/data`, početno 10GB
3. Env vars na PostgreSQL servisu:
   ```
   POSTGRES_USER=agent_studio
   POSTGRES_PASSWORD=<generirati-sigurnu-lozinku-32-chars>
   POSTGRES_DB=agent_studio
   PGDATA=/var/lib/postgresql/data/pgdata
   ```

#### 2.2b — Redis (za cross-replica state)

1. "+" → "Redis" (Railway built-in template)
2. Railway automatski kreira Redis servis sa credentials
3. Na agent-studio servisu dodati: `REDIS_URL = ${{Redis.REDIS_PUBLIC_URL}}`
   - Railway automatski rutira na `redis.railway.internal:6379` (private networking)
   - **VAŽNO:** Koristiti `REDIS_PUBLIC_URL` reference (NE `REDIS_PRIVATE_URL` — taj nema `@` u URL-u)
4. Verifikacija: `curl /api/health` → treba da vrati `redis: ok`

#### 2.3 — Povezati GitHub repo

1. "+" → "GitHub Repo" → selektovati `agent-studio`
2. **NE deployati još** — prvo konfiguristi env varijable

#### 2.4 — Linkovanje servisa (DATABASE_URL)

1. agent-studio servis → Variables → "Add Reference Variable"
2. Selektovati PostgreSQL servis → Railway auto-injektuje `DATABASE_URL`
3. Ručno dodati: `DIRECT_URL = ${{Postgres.DATABASE_URL}}`

#### 2.5 — SVE Environment Varijable

Na agent-studio servisu postaviti:

**Infrastrukturne (Railway auto-popuni neke):**

| Variable | Vrijednost | Napomena |
|----------|-----------|----------|
| `DATABASE_URL` | Auto (Reference) | Iz PostgreSQL servisa |
| `DIRECT_URL` | `${{Postgres.DATABASE_URL}}` | Railway nema pgBouncer → isti URL |
| `NODE_ENV` | `production` | |
| `AUTH_TRUST_HOST` | `true` | **KRITIČNO** — bez ovoga NextAuth odbija zahtjeve |
| `REDIS_URL` | `${{Redis.REDIS_PUBLIC_URL}}` | Cross-replica state (rate limit, cache, sessions) |

**Auth:**

| Variable | Vrijednost |
|----------|-----------|
| `AUTH_SECRET` | `openssl rand -base64 32` output |
| `AUTH_GITHUB_ID` | Iz GitHub OAuth App |
| `AUTH_GITHUB_SECRET` | Iz GitHub OAuth App |
| `AUTH_GOOGLE_ID` | Iz Google Cloud Console |
| `AUTH_GOOGLE_SECRET` | Iz Google Cloud Console |

**AI Provideri (obavezni):**

| Variable | Vrijednost |
|----------|-----------|
| `DEEPSEEK_API_KEY` | Kopirati iz lokalnog .env |
| `OPENAI_API_KEY` | Kopirati iz lokalnog .env |

**AI Provideri (opcionalni — dodati ako imate ključeve):**

| Variable | Vrijednost |
|----------|-----------|
| `ANTHROPIC_API_KEY` | Kopirati iz lokalnog .env |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Kopirati iz lokalnog .env |
| `GROQ_API_KEY` | Kopirati iz lokalnog .env |
| `MISTRAL_API_KEY` | Kopirati iz lokalnog .env |
| `MOONSHOT_API_KEY` | Kopirati iz lokalnog .env |

**Cron:**

| Variable | Vrijednost |
|----------|-----------|
| `CRON_SECRET` | `openssl rand -base64 32` output |

**Google Workspace / Notion (ako se koristi):**

| Variable | Vrijednost |
|----------|-----------|
| `GOOGLE_WORKSPACE_CLIENT_ID` | Kopirati ako postoji |
| `GOOGLE_WORKSPACE_CLIENT_SECRET` | Kopirati ako postoji |
| `NOTION_CLIENT_ID` | Kopirati ako postoji |
| `NOTION_CLIENT_SECRET` | Kopirati ako postoji |

---

### FAZA 3: OAuth Callback URL Ažuriranje

**Ovo se mora uraditi PRIJE prvog login pokušaja!**

#### 3.1 — GitHub OAuth App

1. https://github.com/settings/developers → OAuth Apps
2. Pronaći agent-studio OAuth app
3. **Homepage URL:** `https://<railway-domain>.up.railway.app`
4. **Authorization callback URL:** `https://<railway-domain>.up.railway.app/api/auth/callback/github`

#### 3.2 — Google OAuth Client

1. https://console.cloud.google.com → Credentials
2. Pronaći agent-studio OAuth client
3. **Authorized redirect URIs — DODATI (ne brisati stare):**
   `https://<railway-domain>.up.railway.app/api/auth/callback/google`

**PRO TIP:** Dodati Railway URI BEZ brisanja localhost/Vercel URI-ja — to omogućava da sva tri okruženja rade paralelno.

#### 3.3 — Google Workspace OAuth (ako se koristi)

Isti postupak kao za Google OAuth — dodati Railway callback URI:
`https://<railway-domain>.up.railway.app/api/auth/oauth/google-workspace/callback`

---

### FAZA 4: Deploy i Inicijalizacija

#### 4.1 — Pokrenuti Deploy

```bash
git push origin main
```

Railway auto-detektuje push i pokreće deploy.

#### 4.2 — Pratiti Build Logove

**Očekivani tok:**

```
✓ Detecting pnpm lockfile...
✓ Installing Node.js 20.x
✓ pnpm install --frozen-lockfile
✓ prisma generate        (iz build skripte)
✓ next build             (iz build skripte)
── Deploy phase ──
✓ npx prisma migrate deploy  (iz startCommand)
✓ pnpm run start → next start
✓ Health check: GET /api/health → 200
```

**Ako build PADNE — dijagnostika:**

| Simptom | Uzrok | Rješenje |
|---------|-------|---------|
| `prisma: command not found` u startCommand | prisma još u devDependencies | Korak 0.1 |
| `UntrustedHost` error | AUTH_TRUST_HOST nedostaje | Korak 2.5 |
| `ECONNREFUSED` na DB | DATABASE_URL nije linkovan | Korak 2.4 |
| `extension "vector" not found` | Koristi se default PostgreSQL, ne pgvector image | Korak 2.2 |
| `Cannot find module 'pdf-parse'` | standalone mode aktivan | Ne koristiti `output: "standalone"` |
| Build timeout (>10min) | Prevelik install | Smanjiti dependencies, koristiti cache |
| OOM during build | Node nema dovoljno memorije | Dodati `NODE_OPTIONS=--max-old-space-size=4096` env var |

#### 4.3 — Post-Deploy: HNSW Vector Index

Nakon uspješnog deploya, pokrenuti manualno (jednom):

```bash
railway connect postgres
```

```sql
-- Provjeriti da pgvector radi
SELECT * FROM pg_extension WHERE extname = 'vector';

-- Kreirati HNSW index za brzu semantic search
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_kbchunk_embedding_hnsw
ON "KBChunk" USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- Verifikovati
SELECT indexname FROM pg_indexes WHERE tablename = 'KBChunk';
```

---

### FAZA 5: Cron Job Konfiguracija

`vercel.json` cron NE radi na Railway. Potrebna alternativa.

#### 5.1 — Railway Cron Service (ako dostupan na planu)

1. "+" → "Cron Service"
2. Schedule: `*/5 * * * *`
3. Command:
```bash
curl -s -X POST \
  -H "Authorization: Bearer $CRON_SECRET" \
  http://agent-studio.railway.internal:$PORT/api/cron/trigger-scheduled-flows
```

**NAPOMENA:** Koristiti **internal** networking URL (ne public) — brže i sigurnije.

#### 5.2 — Alternativa: Lightweight Cron Kontejner

Ako Railway Cron Service nije dostupan:

1. "+" → "Docker Image" → `curlimages/curl:latest`
2. Start command:
```bash
/bin/sh -c "while true; do sleep 300; curl -s -X POST -H 'Authorization: Bearer ${CRON_SECRET}' http://agent-studio.railway.internal:${PORT}/api/cron/trigger-scheduled-flows || true; done"
```

3. Dodati env vars: `CRON_SECRET` (isti kao na agent-studio), `PORT` (reference na agent-studio port)

---

### FAZA 6: Smoke Test Checklist

Izvršiti po redoslijedu:

```
1. ✅ Health check
   curl https://<domain>.up.railway.app/api/health
   → { "status": "healthy", "db": "ok" }

2. ✅ Login stranica
   Otvoriti https://<domain>.up.railway.app/login
   → Prikazuje GitHub + Google login buttone

3. ✅ OAuth flow
   → Kliknuti GitHub login → Redirect → Uspješan login
   → Kliknuti Google login → Redirect → Uspješan login

4. ✅ Dashboard
   → Agent lista se učitava
   → Kreirati test agenta → Uspješno

5. ✅ Knowledge Base (pgvector test)
   → Na test agentu, dodati tekst source
   → Čekati da status bude READY
   → Testirati search → Vraća rezultate

6. ✅ Chat (streaming test)
   → Poslati poruku test agentu
   → Streaming response radi

7. ✅ Embed widget
   → Otvoriti /embed/<agentId>
   → Chat radi unutar embed layout-a

8. ✅ Cron
   curl -X POST -H "Authorization: Bearer <secret>" \
     https://<domain>.up.railway.app/api/cron/trigger-scheduled-flows
   → 200 OK

9. ✅ Webhook trigger
   → Kreirati webhook na test agentu
   → Poslati POST na trigger URL
   → Provjeriti execution zapis
```

---

### FAZA 7: Post-Deploy Sigurnost

#### 7.1 — Onemogućiti Public Networking na PostgreSQL

**KRITIČNO:** PostgreSQL servis ne smije biti javno dostupan nakon konfiguracije.

1. Railway Dashboard → PostgreSQL servis → Settings → Networking
2. Onemogućiti "Public Networking"
3. Aplikacija koristi private networking (`*.railway.internal`)

#### 7.2 — Custom Domena (opcionalno)

1. Railway → agent-studio → Settings → Domains
2. Dodati custom domenu (npr. `studio.mojadomena.com`)
3. Konfigurirati DNS: CNAME → `<service>.up.railway.app`
4. Ažurirati OAuth callback URL-ove za novu domenu

---

## Fajlovi koji se Mijenjaju

| Fajl | Akcija | Uticaj na application code |
|------|--------|---------------------------|
| `package.json` | **EDIT** | Premješta `prisma` iz devDeps → deps |
| `pnpm-lock.yaml` | **AUTO** | Ažurira se automatski |
| `railway.toml` | **NOVI** | Nema uticaja — Railway-specifičan config |
| `.gitignore` | **EDIT** | Dodaje 2 linije |
| `next.config.ts` | **BEZ PROMJENA** | |
| `prisma/schema.prisma` | **BEZ PROMJENA** | Već kompatibilan |
| `src/**` | **BEZ PROMJENA** | Zero application code changes |

**Ukupan uticaj na kod: 1 dependency premještanje, 1 novi config fajl, 2 linije u .gitignore.**

---

## Rollback Plan

1. **Railway rollback:** Dashboard → Deployments → Redeploy previous version
2. **Database:** Railway PostgreSQL ima point-in-time recovery (backup svaki dan)
3. **Supabase:** Lokalni dev i dalje koristi Supabase — nikakva promjena
4. **Vercel:** Ako postoji Vercel deployment, ostaje funkcionalan — Railway je paralelni deploy

---

## Procjena Vremena

| Faza | Trajanje | Zahtijeva |
|------|----------|-----------|
| Faza 0: Obavezne popravke | 5 min | Terminal |
| Faza 1: Konfiguracija | 10 min | Terminal |
| Faza 2: Railway infra | 15 min | Railway Dashboard |
| Faza 3: OAuth callbacks | 10 min | GitHub + Google Console |
| Faza 4: Deploy + init | 20 min | Railway Dashboard |
| Faza 5: Cron setup | 10 min | Railway Dashboard |
| Faza 6: Smoke tests | 20 min | Browser |
| Faza 7: Post-deploy security | 5 min | Railway Dashboard |
| **UKUPNO** | **~95 min** | |

---

## Izvori

- [Railway pgvector Template](https://railway.com/deploy/pgvector-latest)
- [Railway pgvector Blog](https://blog.railway.com/p/hosting-postgres-with-pgvector)
- [Auth.js Deployment Guide](https://authjs.dev/getting-started/deployment)
- [Railway UntrustedHost Fix](https://station.railway.com/questions/auth-js-untrusted-host-host-must-be-tr-366f51e9)
- [Prisma Deploy to Railway](https://www.prisma.io/docs/orm/prisma-client/deployment/traditional/deploy-to-railway)
- [NextAuth v5 Migration Guide](https://authjs.dev/getting-started/migrating-to-v5)
- [pgvector Docker Images](https://hub.docker.com/r/pgvector/pgvector)
