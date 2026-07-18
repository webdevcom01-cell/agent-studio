# Glossary

> Pojmovnik Agent Studio projekta. Definicije su izvedene iz `README.md`, `FEATURES.md`, `AGENTS.md` i koda; uz svaki pojam stoji primarni izvor.

| Pojam | Definicija | Izvor |
|-------|-----------|-------|
| **Agent** | Centralni entitet: AI agent sa svojim flow-om, modelom, prompt-om, knowledge base-om i podešavanjima. | `prisma/schema.prisma` (model `Agent`), `FEATURES.md` §27 |
| **Flow** | Vizuelni workflow agenta — graf nodova i veza, čuva se kao JSON. Ima verzionisanje (`FlowVersion`) i deploy pipeline (`FlowDeployment`). | `prisma/schema.prisma` (model `Flow`), `README.md` |
| **Node** | Korak u flow-u. Postoji 66 formalnih tipova (`NodeType` unija). | `src/types/index.ts:32` |
| **Handler** | Runtime implementacija jednog node tipa. Registry ima 67 ključeva (66 `NodeType` + interni `code_review`). | `src/lib/runtime/handlers/index.ts` |
| **NodeType** | TypeScript unija svih formalnih tipova nodova — izvor istine za broj nodova (66). | `src/types/index.ts:32` |
| **Knowledge Base (KB)** | Kolekcija izvora (URL/tekst/fajl) koja se chunk-uje, embed-uje i pretražuje za RAG kontekst agenta. | `docs/01-getting-started/knowledge-base.md` |
| **RAG** | Retrieval-Augmented Generation — hibridna pretraga (semantic + BM25, RRF fuzija) nad KB chunk-ovima koja se ubacuje u kontekst modela. | `src/lib/knowledge/search.ts` |
| **Chunk** | Deo teksta izvora (~512 tokena default) sa embedding vektorom (1536 dim, `text-embedding-3-small`). | `src/lib/knowledge/chunker.ts:20`, `src/lib/ai.ts:117` |
| **hybridAlpha** | Težina semantičke komponente u hibridnoj pretrazi (default 0.7; 0.8 uz contextual enrichment). | `src/lib/schemas/kb-config.ts:61`, `src/lib/knowledge/search.ts:563` |
| **MCP** | Model Context Protocol — protokol za povezivanje spoljnih alata; agenti ga koriste kroz `mcp_tool` node i MCP servere. | `FEATURES.md`, `src/app/api/mcp-servers/` |
| **A2A** | Google Agent-to-Agent protokol — omogućava da spoljni agenti otkriju i pozovu Agent Studio agente (agent-card). | `src/app/api/a2a/` |
| **ECC** | Modul sa specijalizovanim developer agentima (30 template-a) i skills MCP servisom. | `src/lib/ecc/`, `src/data/ecc-agent-templates.json` |
| **SDLC pipeline** | Autonomni software-development pipeline sa specijalizovanim agent prompt-ovima. | `sdlc-prompts/`, `src/lib/sdlc/` |
| **Eval / Eval Suite** | Framework za evaluaciju agenata: suite → case → run → rezultat, sa regression detekcijom. | `src/lib/evals/`, `docs/02-guides/agent-evals.md` |
| **HITL** | Human-in-the-loop — `human_approval` node i approval politike (`ApprovalPolicy`). | `src/lib/runtime/handlers/`, `prisma/schema.prisma` |
| **RLS** | PostgreSQL Row-Level Security — enforcement po organizaciji kroz `withOrgContext` middleware; flag `RLS_ENFORCEMENT_ENABLED`. | `docs/02-guides/rls-testing.md`, `.env.example` |
| **Organizacija** | Multi-tenant jedinica (`Organization`, `OrganizationMember`, `Invitation`) — nosilac RLS izolacije. | `prisma/schema.prisma` |
| **Template** | Deljivi recept za agenta (221 template-a u 20 kategorija) sa opcionim starter flow-om. | `src/data/agent-templates.json` |
| **CLI generator** | Modul koji od agenta generiše samostalan CLI alat. | `docs/02-guides/cli-generator.md`, `src/app/api/cli-generator/` |
| **Heartbeat** | Zakazano periodično buđenje agenta sa kontekstom (schedule + context). | `prisma/schema.prisma`, `src/app/api/schedules/` |
| **BullMQ** | Redis-bazirani queue za pozadinske poslove (izvršavanja, ingestija KB, cron). | `README.md` (tech stack), `REDIS_URL` u `.env.example` |
| **pgvector** | PostgreSQL ekstenzija za vektorsku pretragu (HNSW indeksi) — skladište embeddings-a. | `prisma/schema.prisma`, `README.md` |
