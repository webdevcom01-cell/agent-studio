# Agent Studio — Implementation Plan v2.0

## Deployment, Distribution & Onboarding Strategy

**Based on:** 2026 market analysis (Docker AI Compose, Anthropic AAIF/MCP, Google A2A/ADK, competitor benchmarks: Dify 134K★, n8n 72K★, Flowise 39K★, OpenClaw 210K★)

**Problem:** Time-to-First-Agent is 45+ min (Railway account + 12 env vars + 3 service linking). Competitors: Dify `docker compose up` (5 min), Flowise `npx flowise start` (2 min), n8n `docker run n8n` (3 min).

**Goal:** Reduce Time-to-First-Agent from 45 min → under 5 min without sacrificing architectural sophistication.

---

## PHASE 0: GitHub Public Repository [Week 1, Days 1-2]

**Priority: CRITICAL — everything depends on this**

This must happen BEFORE Docker, CLI, or anything else. Without a public repo, Docker images have no registry, CLI has no source, and community has no entry point.

### Tasks

- [ ] **0.1 Choose license**
  - Recommendation: **Apache 2.0** (same as Flowise, patent protection, enterprise-friendly)
  - Alternatives: MIT (simpler, LangGraph uses it), AGPL (Dify uses modified Apache with multi-tenant restriction)
  - Rationale: Apache 2.0 gives patent protection that MIT lacks, while being permissive enough for enterprise adoption. Avoids AGPL's copyleft complexity.
  - Create `LICENSE` file in repo root

- [ ] **0.2 Clean repo for public release**
  - Audit for hardcoded secrets, internal URLs, private API keys in code/comments
  - Remove or genericize any Railway-specific configs that expose internal URLs
  - Ensure `.env.example` has ALL variables documented with comments
  - Verify `.gitignore` covers: `.env`, `.env.local`, `node_modules/`, `src/generated/`, `.next/`, `*.log`
  - Remove any `console.log` statements (per CLAUDE.md hard rules)

- [ ] **0.3 README.md rewrite**
  - Structure must follow this exact order (proven pattern from 100K+ star repos):
    1. Logo + one-line description
    2. Badges row (build status, license, npm version, Docker pulls, Discord)
    3. Screenshot/GIF (dashboard or flow editor — 3 second impression)
    4. "Quick Start" section with ONE command (`docker compose up` or `npx agent-studio start`)
    5. Feature highlights (bullet list, max 8 items)
    6. Architecture diagram (Mermaid)
    7. Documentation link
    8. Contributing link
    9. License
  - Max 300 lines. Every line after 300 loses readers.

- [ ] **0.4 Community files**
  - `CONTRIBUTING.md` — fork → branch → PR workflow, code style, testing requirements
  - `CODE_OF_CONDUCT.md` — Contributor Covenant v2.1
  - `.github/ISSUE_TEMPLATE/bug_report.yml` — structured bug template
  - `.github/ISSUE_TEMPLATE/feature_request.yml` — structured feature template
  - `.github/PULL_REQUEST_TEMPLATE.md` — checklist (tests pass, no console.log, types clean)
  - `.github/DISCUSSION_TEMPLATE/` — Q&A and Ideas categories

- [ ] **0.5 GitHub Discussions enabled**
  - Enable Discussions tab (Settings → Features)
  - Create categories: Announcements, Q&A, Ideas, Show & Tell
  - Pin a "Welcome" discussion with links to docs and quick start

- [ ] **0.6 Make repository public**
  - Settings → Change visibility → Public
  - Verify GitHub Pages or Actions are not exposing secrets
  - Add repo topics: `ai-agent`, `mcp`, `a2a`, `rag`, `flow-editor`, `nextjs`, `open-source`

### Acceptance Criteria
- Repo is public on GitHub
- `LICENSE` file exists (Apache 2.0)
- README has quick start with single command
- Issue templates work
- No secrets exposed (audit complete)

---

## PHASE 1: Docker Compose Setup [Week 1-2, Days 3-10]

**Priority: CRITICAL — reduces onboarding from 45 min to 5 min**

### Tasks

- [ ] **1.1 Create Dockerfile for Next.js app**
  - Multi-stage build: deps → build → runner
  - Base: `node:22-alpine` (smallest)
  - Copy only `package.json`, `pnpm-lock.yaml` first (layer cache)
  - `pnpm install --frozen-lockfile` in deps stage
  - `pnpm build` in build stage
  - Runner stage: copy `.next/standalone`, `.next/static`, `public/`
  - HEALTHCHECK: `curl -f http://localhost:3000/api/health || exit 1`
  - Expected image size: < 500MB
  - Location: `Dockerfile` in repo root

- [ ] **1.2 Create Dockerfile for ECC Skills MCP**
  - Base: `python:3.12-slim`
  - Copy `requirements.txt`, `pip install`
  - Copy `main.py` and skill files
  - HEALTHCHECK: `curl -f http://localhost:8000/health || exit 1`
  - Expected image size: < 200MB
  - Location: `services/ecc-skills-mcp/Dockerfile`

- [ ] **1.3 Create docker-compose.yml**
  ```yaml
  # Target UX: git clone → cp .env.example .env → docker compose up
  services:
    app:
      build: .
      ports: ["3000:3000"]
      env_file: .env
      depends_on:
        db: { condition: service_healthy }
        redis: { condition: service_healthy }
      environment:
        DATABASE_URL: postgresql://postgres:postgres@db:5432/agent_studio
        DIRECT_URL: postgresql://postgres:postgres@db:5432/agent_studio
        REDIS_URL: redis://redis:6379
        ECC_MCP_URL: http://mcp:8000
      healthcheck:
        test: ["CMD", "curl", "-f", "http://localhost:3000/api/health"]
        interval: 30s
        timeout: 10s
        retries: 3

    db:
      image: pgvector/pgvector:pg16
      volumes: [pgdata:/var/lib/postgresql/data]
      environment:
        POSTGRES_DB: agent_studio
        POSTGRES_USER: postgres
        POSTGRES_PASSWORD: postgres
      healthcheck:
        test: ["CMD-SHELL", "pg_isready -U postgres"]
        interval: 10s
        timeout: 5s
        retries: 5

    redis:
      image: redis:7-alpine
      volumes: [redisdata:/data]
      healthcheck:
        test: ["CMD", "redis-cli", "ping"]
        interval: 10s
        timeout: 5s
        retries: 5

    mcp:
      build: ./services/ecc-skills-mcp
      environment:
        DATABASE_URL: postgresql://postgres:postgres@db:5432/agent_studio
        PORT: "8000"
      depends_on:
        db: { condition: service_healthy }

  volumes:
    pgdata:
    redisdata:
  ```

- [ ] **1.4 Create docker-compose.dev.yml (override for development)**
  - Mount source code as volume for hot reload
  - Expose debug ports (9229 for Node.js)
  - Use `pnpm dev` instead of production build
  - Expose PostgreSQL port 5432 for Prisma Studio access
  - Expose Redis port 6379 for debugging

- [ ] **1.5 Create init-db.sh script**
  - Runs inside db container on first start
  - `CREATE EXTENSION IF NOT EXISTS vector;`
  - Prisma migration or `pnpm db:push` equivalent
  - Seed data (optional demo agent)
  - Location: `scripts/init-db.sh`

- [ ] **1.6 Create .env.example with full documentation**
  ```bash
  # ═══════════════════════════════════════════════
  # Agent Studio — Environment Configuration
  # ═══════════════════════════════════════════════
  # Copy this file: cp .env.example .env
  # Then fill in your API keys below.

  # ── REQUIRED (minimum to run) ──────────────────
  # Get from: https://platform.deepseek.com
  DEEPSEEK_API_KEY=your_deepseek_key_here

  # Get from: https://platform.openai.com (needed for embeddings)
  OPENAI_API_KEY=your_openai_key_here

  # Generate with: openssl rand -base64 32
  AUTH_SECRET=generate_a_random_secret_here

  # ── DOCKER (auto-configured, don't change) ────
  DATABASE_URL=postgresql://postgres:postgres@db:5432/agent_studio
  DIRECT_URL=postgresql://postgres:postgres@db:5432/agent_studio
  REDIS_URL=redis://redis:6379
  ECC_MCP_URL=http://mcp:8000

  # ── OAUTH (optional, for login) ────────────────
  # AUTH_GITHUB_ID=
  # AUTH_GITHUB_SECRET=
  # AUTH_GOOGLE_ID=
  # AUTH_GOOGLE_SECRET=

  # ── OPTIONAL AI PROVIDERS ──────────────────────
  # ANTHROPIC_API_KEY=
  # GOOGLE_GENERATIVE_AI_API_KEY=
  # GROQ_API_KEY=
  # MISTRAL_API_KEY=

  # ── FEATURE FLAGS ──────────────────────────────
  ECC_ENABLED=true
  ```

- [ ] **1.7 Create Makefile for common commands**
  ```makefile
  up:         docker compose up -d
  down:       docker compose down
  logs:       docker compose logs -f
  dev:        docker compose -f docker-compose.yml -f docker-compose.dev.yml up
  seed:       docker compose exec app pnpm db:seed
  migrate:    docker compose exec app pnpm db:push
  studio:     docker compose exec app pnpm db:studio
  clean:      docker compose down -v  # WARNING: deletes data
  ```

- [ ] **1.8 GitHub Actions: Build & push Docker images**
  - Trigger: push to `main` branch
  - Build: `ghcr.io/<user>/agent-studio:latest` + `ghcr.io/<user>/agent-studio:v<version>`
  - Multi-arch: `linux/amd64` + `linux/arm64`
  - Push to GitHub Container Registry (ghcr.io)
  - Location: `.github/workflows/docker-build.yml`

- [ ] **1.9 Test full docker compose cycle**
  - Fresh clone → `cp .env.example .env` → fill 2 keys → `docker compose up`
  - Verify: app healthy, db healthy, redis healthy, mcp healthy
  - Verify: can create agent, save flow, chat with agent
  - Measure: time from clone to first agent < 5 minutes
  - Document any issues found

### Acceptance Criteria
- `docker compose up` starts all 4 services with health checks passing
- New user needs only 2 API keys (DEEPSEEK + OPENAI) to get running
- Total time from git clone to working app < 5 minutes
- Docker images are auto-built and pushed via GitHub Actions
- Image sizes: app < 500MB, mcp < 200MB

---

## PHASE 2: NPX CLI Tool [Week 2-3]

**Priority: HIGH — viral "wow moment" for developers**

### Tasks

- [ ] **2.1 Scaffold CLI package**
  - Create `packages/cli/` directory (or separate repo `agent-studio-cli`)
  - `package.json` with `bin: { "agent-studio": "./dist/index.js" }`
  - TypeScript + tsup for bundling
  - Dependencies: `commander` (CLI framework), `inquirer` (interactive prompts), `ora` (spinners), `chalk` (colors)

- [ ] **2.2 Implement `npx agent-studio init`**
  - Interactive wizard:
    1. "Enter project name" (default: `my-agent-studio`)
    2. "Enter DeepSeek API key" (with link to get one)
    3. "Enter OpenAI API key" (with link to get one)
    4. "Setup OAuth? (optional)" — skip or enter GitHub/Google credentials
    5. "Use Docker or Lite mode?" — detect Docker availability, recommend accordingly
  - Creates project folder with: `docker-compose.yml`, `.env` (filled), `.gitignore`
  - Prints: "Run `cd my-agent-studio && npx agent-studio start` to begin"

- [ ] **2.3 Implement `npx agent-studio start`**
  - Detect Docker: `docker compose version` check
  - If Docker available: run `docker compose up -d`, wait for health checks, open browser
  - If Docker NOT available: start Lite mode (see 2.5)
  - Show spinner with status: "Starting database... Starting app... Starting MCP..."
  - On success: print URL and open `http://localhost:3000` in default browser

- [ ] **2.4 Implement `npx agent-studio doctor`**
  - Check: Node.js version (>= 18)
  - Check: Docker installed and running
  - Check: .env file exists and has required keys
  - Check: Database connection
  - Check: Redis connection
  - Check: MCP server reachable
  - Check: API keys valid (test call)
  - Output: green checkmarks for passing, red X for failing, with fix instructions

- [ ] **2.5 SQLite Lite Mode (no Docker fallback)**
  - When Docker is not available, CLI runs a simplified stack:
  - Database: SQLite via Prisma (requires `prisma/schema.sqlite.prisma` alternate schema)
  - Vector search: `better-sqlite3` + manual cosine similarity (no pgvector)
  - Cache: In-memory LRU (no Redis)
  - MCP: Skip ECC Skills MCP (or embed as subprocess)
  - Limitations clearly printed: "Running in Lite mode — some features limited. Install Docker for full experience."
  - NOTE: This requires abstracting vector search behind an interface in `src/lib/knowledge/search.ts`

- [ ] **2.6 Implement `npx agent-studio import <file.json>`**
  - Read agent export JSON, validate with Zod schema
  - POST to running instance at `http://localhost:3000/api/agents/import`
  - Print success with agent name and URL

- [ ] **2.7 Implement `npx agent-studio template list`**
  - Fetch from `src/data/agent-templates.json` (bundled in CLI)
  - Display: name, category, description in table format
  - Filter: `--category developer`, `--search "security"`

- [ ] **2.8 Publish to npm**
  - Package name: `agent-studio` (check availability first, fallback: `@agent-studio/cli`)
  - npm publish with GitHub Actions on tag push
  - Verify: `npx agent-studio --version` works globally

### Acceptance Criteria
- `npx agent-studio init && npx agent-studio start` works end-to-end
- Doctor command catches and explains all common setup issues
- Lite mode starts without Docker (degraded but functional)
- Published on npm, installable via `npx`

---

## PHASE 3: One-Click Deploy Buttons + Docs [Week 3-4]

**Priority: MEDIUM — community growth accelerator**

### Tasks

- [ ] **3.1 Railway Template**
  - Create `railway.toml` template config with all 4 services
  - Pre-configure service linking (DATABASE_URL, REDIS_URL, ECC_MCP_URL)
  - User only fills: DEEPSEEK_API_KEY, OPENAI_API_KEY, AUTH_SECRET
  - Generate deploy button: `[![Deploy on Railway](badge)](template-url)`
  - Test: one-click deploy from zero to running

- [ ] **3.2 Render Blueprint**
  - Create `render.yaml` with service definitions
  - Use Render's managed PostgreSQL (free tier: 1GB)
  - Configure auto-deploy from GitHub
  - Generate deploy button for README

- [ ] **3.3 Vercel Deploy (app only)**
  - Create `vercel.json` with build settings
  - NOTE: Vercel only handles the Next.js app — DB must be Vercel Postgres or external
  - Document Vercel-specific limitations (serverless timeout 300s, no persistent MCP)
  - Generate deploy button for README

- [ ] **3.4 DigitalOcean App Platform spec**
  - Create `.do/app.yaml` with service definitions
  - Leverage $200 free credits program
  - Generate deploy button for README

- [ ] **3.5 Documentation site — Docusaurus**
  - Recommendation: Docusaurus (free, MIT, React-based, full control)
  - Create `docs/` directory with Docusaurus scaffold
  - Sections:
    1. **Getting Started** — Quick Start (Docker), Quick Start (CLI), Quick Start (Cloud)
    2. **Guides** — Create Your First Agent, Build a RAG Pipeline, Multi-Agent Flows, Webhook Integration, CLI Generator
    3. **API Reference** — All 40+ API routes documented with request/response examples
    4. **Architecture** — System overview, node types, runtime engine, streaming protocol
    5. **Deployment** — Docker, Railway, Render, Vercel, self-hosting guide
    6. **Contributing** — Development setup, testing, PR workflow
    7. **ECC Integration** — Skills, Meta-Orchestrator, Continuous Learning
  - Deploy: GitHub Pages (free) or Vercel
  - Domain: `docs.agent-studio.dev` (or similar)

- [ ] **3.6 Quickstart video (3-5 min)**
  - Record: `docker compose up` → create agent → add KB source → chat
  - Tools: OBS Studio (free) or Loom
  - Embed in README and docs landing page
  - Upload to YouTube for SEO

- [ ] **3.7 Interactive Demo / Playground**
  - Deploy a read-only hosted instance with pre-built demo agents
  - URL: `demo.agent-studio.dev` (or similar)
  - Pre-loaded: 3 demo agents (RAG Research, TDD Pipeline, Customer Support)
  - Rate-limited: 10 messages per session, no agent creation
  - Purpose: "try before you install" for window shoppers

### Acceptance Criteria
- All 4 deploy buttons work end-to-end
- Documentation site live with at least Getting Started + API Reference
- Demo instance accessible without installation

---

## PHASE 4: Marketplace & Community Ecosystem [Month 2]

**Priority: MEDIUM — network effect builder**

### Tasks

- [ ] **4.1 Community Contribution Pipeline**
  - Create `AGENTS.md` — guide for contributing agent templates
  - Create `SKILLS.md` — guide for contributing ECC skills
  - Submission flow: Fork → add template JSON → PR → review → merge → auto-publish
  - GitHub Actions: validate submitted agent templates with Zod schema
  - Template directory: `community/agents/` and `community/skills/`

- [ ] **4.2 Agent Marketplace Page Enhancement**
  - Expand `/discover` page with:
    - "Verified" badge for team-reviewed agents
    - Install count tracking (AnalyticsEvent)
    - User ratings (new model: `AgentRating`)
    - "One-click import" button (POST to /api/agents/import)
  - Add "Submit Agent" flow — upload JSON + metadata form

- [ ] **4.3 Skill Marketplace**
  - Expand `/skills` page with:
    - Community skill submissions
    - Skill versioning (semver)
    - Dependency declaration between skills
    - Usage analytics per skill

- [ ] **4.4 Google ADK Compatibility**
  - Research Google Agent Development Kit integration points
  - Implement ADK tool format compatibility in agent-tools.ts
  - Add ADK-compatible agent card format alongside A2A v0.3
  - Goal: Agent Studio agents discoverable by ADK-powered systems

- [ ] **4.5 Discord Community Server**
  - Create Discord with channels: #general, #help, #showcase, #feature-requests, #contributors
  - Bot: GitHub webhook notifications for new PRs and releases
  - Link Discord invite in README, docs, and in-app

### Acceptance Criteria
- At least 5 community-contributed agents merged
- Marketplace has working submission flow
- Discord active with 50+ members

---

## PHASE 5: Cloud Hosted Version [Month 2-3]

**Priority: LOW (but highest long-term ROI)**

### Tasks

- [ ] **5.1 Multi-tenancy Architecture**
  - Add `organizationId` to Agent, Flow, KnowledgeBase models
  - Implement tenant isolation in all API routes
  - Per-tenant resource limits (agents, KB size, message count)
  - NOTE: This is explicitly excluded from current architecture — significant refactor

- [ ] **5.2 Billing Integration**
  - Stripe integration for subscription management
  - Tiers: Free ($0, 3 agents, 1000 msg/mo), Pro ($29, unlimited), Team ($99, collaboration)
  - Usage metering: messages, KB chunks, API calls
  - Webhook: Stripe → update user tier in DB

- [ ] **5.3 Custom Domain Support**
  - Pro/Team feature: CNAME mapping to user's domain
  - SSL certificate auto-provisioning (Let's Encrypt)
  - Embed widget with custom domain support

- [ ] **5.4 Domain & Landing Page**
  - Register domain: `agent-studio.app` or `agentstudio.dev`
  - Landing page: use design-mockup.html as base, convert to Next.js
  - Sections: Hero, Features, Pricing, Docs link, GitHub link
  - SEO: meta tags, OpenGraph, structured data

- [ ] **5.5 Onboarding Flow for Cloud Users**
  - Sign up → choose template or blank → configure agent → chat in < 2 min
  - No Docker, no CLI, no env vars — pure browser experience
  - Guided tour (tooltip walkthrough) on first login

### Acceptance Criteria
- Cloud instance running with tenant isolation
- Stripe billing working with 3 tiers
- Landing page live with pricing

---

## STANDARDS COMPLIANCE CHECKLIST

### Anthropic / AAIF
- [x] MCP 2025-11-25 Spec (Streamable HTTP + SSE)
- [x] AAIF membership alignment (MCP donated Dec 2025)
- [x] Secure deployment (CSRF, rate limiting, SSRF protection, audit)
- [x] OpenTelemetry gen_ai.* semantic conventions
- [ ] Docker MCP Gateway integration (add in Phase 1)
- [ ] Claude Agent SDK Skills format alignment (Phase 4)

### Google
- [x] A2A Protocol v0.3 (Agent Cards, Task Protocol, Discovery)
- [ ] Google ADK tool format compatibility (Phase 4)
- [ ] Signed Agent Cards (when AAIF publishes spec)
- [ ] Streaming task updates

### Docker 2026
- [ ] Docker Compose with healthchecks (Phase 1)
- [ ] Docker MCP Gateway for MCP isolation (Phase 1)
- [ ] Compose `models` block for model gateway (Phase 1, optional)
- [ ] Multi-arch images: amd64 + arm64 (Phase 1)
- [x] Container healthcheck endpoint (/api/health)

### Licensing
- [ ] Apache 2.0 license file (Phase 0)
- [ ] License header in source files (optional but professional)
- [ ] Third-party license audit (check all npm deps)

---

## RISK REGISTER

| # | Risk | Probability | Impact | Mitigation |
|---|------|-------------|--------|------------|
| R1 | pgvector → SQLite-vss compatibility | HIGH | Lite mode nonfunctional | Abstract vector search behind interface; test both paths |
| R2 | Docker image too large (>1GB) | MEDIUM | Slow pull for users | Multi-stage build, .dockerignore, Alpine base |
| R3 | npm package name "agent-studio" taken | MEDIUM | Confusing naming | Check registry first; fallback: @agent-studio/cli |
| R4 | Env var confusion for beginners | HIGH | User abandons on .env step | CLI wizard with interactive prompt; validation on startup |
| R5 | Prisma SQLite adapter bugs | LOW | Inconsistent behavior | Prisma v6 has stable SQLite; test migration path |
| R6 | No license = no forks | HIGH | Community cannot contribute | Apache 2.0 license added in Phase 0 |
| R7 | Secrets exposed in public repo | CRITICAL | Security breach | Full audit before making public; GitHub secret scanning |
| R8 | Railway costs increase | MEDIUM | Unsustainable hosting | Docker Compose self-hosting reduces dependency on Railway |
| R9 | Community spam (bad agent submissions) | LOW | Marketplace quality | PR-based submission with Zod validation + team review |
| R10 | Competitor copies our innovations | MEDIUM | Lost advantage | Apache 2.0 allows this; speed of execution is the moat |

---

## KPIs & SUCCESS METRICS

| Metric | Current | Month 1 Target | Month 3 Target |
|--------|---------|-----------------|-----------------|
| Time-to-First-Agent | 45+ min | < 5 min | < 3 min |
| GitHub Stars | 0 (private) | 200+ | 1,000+ |
| Docker pulls (monthly) | 0 | 500+ | 2,000+ |
| npm installs (weekly) | 0 | 100+ | 500+ |
| README → Agent created | ~5% | 25%+ | 40%+ |
| Onboarding drop-off | ~70% | < 30% | < 15% |
| Contributors | 1 | 5+ | 15+ |
| GitHub Issues (open) | 0 | 20+ | 50+ |
| Discord members | 0 | 50+ | 200+ |
| Docs page views (weekly) | 0 | 500+ | 2,000+ |
| Community agents submitted | 0 | 5+ | 20+ |

---

## IMPLEMENTATION TIMELINE

```
Week 1 (Days 1-2): PHASE 0 — GitHub Public Repo
  ├── License (Apache 2.0)
  ├── README rewrite
  ├── Community files (CONTRIBUTING, issue templates)
  ├── Security audit
  └── Make repo public

Week 1-2 (Days 3-10): PHASE 1 — Docker Compose
  ├── Dockerfile (app)
  ├── Dockerfile (MCP)
  ├── docker-compose.yml
  ├── docker-compose.dev.yml
  ├── .env.example (documented)
  ├── Makefile
  ├── init-db.sh
  ├── GitHub Actions (docker build + push)
  └── Full cycle test

Week 2-3: PHASE 2 — NPX CLI
  ├── CLI scaffold (commander + inquirer)
  ├── npx agent-studio init (wizard)
  ├── npx agent-studio start (Docker + Lite mode)
  ├── npx agent-studio doctor
  ├── SQLite fallback mode
  ├── Template list command
  └── npm publish

Week 3-4: PHASE 3 — Deploy Buttons + Docs
  ├── Railway Template
  ├── Render Blueprint
  ├── Vercel Deploy config
  ├── Docusaurus docs site
  ├── Quickstart video
  └── Interactive demo instance

Month 2: PHASE 4 — Marketplace & Community
  ├── Contribution pipeline
  ├── Marketplace enhancement
  ├── Google ADK compatibility
  └── Discord community

Month 2-3: PHASE 5 — Cloud Hosted
  ├── Multi-tenancy
  ├── Stripe billing
  ├── Custom domains
  ├── Landing page
  └── Cloud onboarding flow
```

---

## HOW TO USE THIS PLAN WITH CLAUDE CODE

This plan is designed to be added to your project's CLAUDE.md or used as a reference file. When working with Claude Code in terminal:

1. Copy this file to your project root
2. Reference specific phases: "Implement Phase 0, task 0.1 — add Apache 2.0 license"
3. Each task has a checkbox — mark completed as you go
4. Acceptance criteria at end of each phase define "done"
5. Risk register helps Claude Code make better decisions about trade-offs

**Example Claude Code prompts:**
- "Read IMPLEMENTATION-PLAN.md and implement Phase 0 completely"
- "Implement task 1.3 — create docker-compose.yml following the spec in the plan"
- "Implement Phase 2 — create the CLI package with all commands"
- "Check the acceptance criteria for Phase 1 and verify all are met"
