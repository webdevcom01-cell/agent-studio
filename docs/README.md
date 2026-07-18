# Agent Studio dokumentacija

Dokumentacija je organizovana po [Diátaxis](https://diataxis.fr/) standardu: tutorijali za početak, guide-ovi za konkretne zadatke, referenca za činjenice, explanation za razumevanje sistema.

## 01 — Getting Started (tutorijali)

| Dokument | Sadržaj |
|----------|---------|
| [overview.md](01-getting-started/overview.md) | Šta je Agent Studio i od čega se sastoji |
| [quick-start.md](01-getting-started/quick-start.md) | Prvo pokretanje i prvi agent |
| [knowledge-base.md](01-getting-started/knowledge-base.md) | Kako radi knowledge base (RAG) i kako se puni |

## 02 — Guides (kako da...)

| Dokument | Sadržaj |
|----------|---------|
| [flow-patterns.md](02-guides/flow-patterns.md) | Obrasci za građenje flow-ova |
| [analytics.md](02-guides/analytics.md) | Analitika izvršavanja |
| [cli-generator.md](02-guides/cli-generator.md) | Generisanje CLI alata iz agenta |
| [agent-evals.md](02-guides/agent-evals.md) | Evaluacija agenata (suites, cases, regression) |
| [faq.md](02-guides/faq.md) | FAQ i troubleshooting |
| [rls-testing.md](02-guides/rls-testing.md) | Testiranje PostgreSQL RLS izolacije |

## 03 — Reference (činjenice)

| Dokument | Sadržaj |
|----------|---------|
| [nodes/basic.md](03-reference/nodes/basic.md) | Osnovni nodovi |
| [nodes/ai.md](03-reference/nodes/ai.md) | AI nodovi |
| [nodes/flow-control.md](03-reference/nodes/flow-control.md) | Flow-control nodovi |
| [nodes/integrations.md](03-reference/nodes/integrations.md) | Integracioni nodovi |
| [nodes/reference.md](03-reference/nodes/reference.md) | Kompletna referenca svih 66 node tipova |
| [api.md](03-reference/api.md) | Svih 170 API ruta (generisano iz koda) |
| [data-model.md](03-reference/data-model.md) | Svih 63 Prisma modela (generisano iz šeme) |
| [config-env.md](03-reference/config-env.md) | Environment varijable i konfiguracija |
| [glossary.md](03-reference/glossary.md) | Pojmovnik |

## 04 — Explanation (razumevanje)

| Dokument | Sadržaj |
|----------|---------|
| [devops-swarm/ARCHITECTURE.md](04-explanation/devops-swarm/ARCHITECTURE.md) | Arhitektura DevOps swarm-a |
| [devops-swarm/SETUP.md](04-explanation/devops-swarm/SETUP.md) | Setup DevOps swarm-a |

## Ostalo

- [adr/](adr/) — Architecture Decision Records
- [agents/](agents/) — meta-dokumentacija za AI agente koji rade nad ovim repo-om (referencirano iz `CLAUDE.md`)
- [_archive/](_archive/) — završeni/prevaziđeni planovi, radni dokumenti i istorijski auditi
