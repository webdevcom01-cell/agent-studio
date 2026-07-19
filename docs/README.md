# Agent Studio Documentation

The documentation follows the [Diátaxis](https://diataxis.fr/) standard: tutorials to get started, guides for concrete tasks, reference for facts, and explanation for understanding the system.

## 01 — Getting Started (tutorials)

| Document | Contents |
|----------|----------|
| [overview.md](01-getting-started/overview.md) | What Agent Studio is and what it consists of |
| [quick-start.md](01-getting-started/quick-start.md) | First run and your first agent |
| [knowledge-base.md](01-getting-started/knowledge-base.md) | How the knowledge base (RAG) works and how to fill it |

## 02 — Guides (how to…)

| Document | Contents |
|----------|----------|
| [flow-patterns.md](02-guides/flow-patterns.md) | Patterns for building flows |
| [analytics.md](02-guides/analytics.md) | Execution analytics |
| [cli-generator.md](02-guides/cli-generator.md) | Generating a CLI tool from an agent |
| [agent-evals.md](02-guides/agent-evals.md) | Evaluating agents (suites, cases, regression) |
| [faq.md](02-guides/faq.md) | FAQ and troubleshooting |
| [rls-testing.md](02-guides/rls-testing.md) | Testing PostgreSQL RLS isolation |

## 03 — Reference (facts)

| Document | Contents |
|----------|----------|
| [nodes/basic.md](03-reference/nodes/basic.md) | Basic nodes |
| [nodes/ai.md](03-reference/nodes/ai.md) | AI nodes |
| [nodes/flow-control.md](03-reference/nodes/flow-control.md) | Flow-control nodes |
| [nodes/integrations.md](03-reference/nodes/integrations.md) | Integration nodes |
| [nodes/reference.md](03-reference/nodes/reference.md) | Complete reference of all 66 node types |
| [api.md](03-reference/api.md) | All 170 API routes (generated from code) |
| [data-model.md](03-reference/data-model.md) | All 63 Prisma models (generated from the schema) |
| [config-env.md](03-reference/config-env.md) | Environment variables and configuration |
| [glossary.md](03-reference/glossary.md) | Glossary |

## 04 — Explanation (understanding)

| Document | Contents |
|----------|----------|
| [architecture.md](04-explanation/architecture.md) | How the system is put together and why — runtime, RAG, queue, RLS, interop |
| [devops-swarm/ARCHITECTURE.md](04-explanation/devops-swarm/ARCHITECTURE.md) | DevOps swarm architecture |
| [devops-swarm/SETUP.md](04-explanation/devops-swarm/SETUP.md) | DevOps swarm setup |

## Other

- [adr/](adr/) — Architecture Decision Records
- [agents/](agents/) — meta-documentation for AI agents working on this repo (referenced from `CLAUDE.md`)
- [_archive/](_archive/) — completed/superseded plans, working documents, and historical audits
