# Data Model Reference

> **Izvor istine:** `prisma/schema.prisma` — ovaj dokument je generisan iz stvarnog stanja šeme.
> **Ukupno modela:** 63 | **Generisano:** 2026-07-18 sa grane `docs/reorg-diataxis`

Baza je PostgreSQL sa `pgvector` ekstenzijom (embeddings). ORM je Prisma v6. Migracije se primenjuju isključivo kroz `pnpm prisma migrate deploy` (v. `AGENTS.md`).

| Model | Polja | Linija u šemi | Svrha |
|-------|------:|---------------|-------|
| `User` | 21 | [`schema.prisma:15`](../../prisma/schema.prisma#L15) | Korisnički nalog |
| `ApiKey` | 14 | [`schema.prisma:46`](../../prisma/schema.prisma#L46) | Hashovan API ključ sa scope-ovima i istekom |
| `Account` | 14 | [`schema.prisma:74`](../../prisma/schema.prisma#L74) | OAuth account linking (GitHub/Google) |
| `Session` | 5 | [`schema.prisma:99`](../../prisma/schema.prisma#L99) | NextAuth sesije |
| `VerificationToken` | 3 | [`schema.prisma:109`](../../prisma/schema.prisma#L109) | Email verifikacija |
| `Agent` | 52 | [`schema.prisma:117`](../../prisma/schema.prisma#L117) | Centralni entitet agenta |
| `ManagedAgentTask` | 17 | [`schema.prisma:221`](../../prisma/schema.prisma#L221) | Async managed task (job, input/output, progress, callback) |
| `PipelineRun` | 31 | [`schema.prisma:272`](../../prisma/schema.prisma#L272) | SDLC pipeline run (koraci, metrike, smart routing) |
| `PipelineMemory` | 6 | [`schema.prisma:346`](../../prisma/schema.prisma#L346) | Memorija po pipeline run-u (kategorija, sadržaj) |
| `AgentSdkSession` | 13 | [`schema.prisma:359`](../../prisma/schema.prisma#L359) | Claude Agent SDK sesija (poruke, token usage, resume count) |
| `Flow` | 10 | [`schema.prisma:386`](../../prisma/schema.prisma#L386) | Vizuelni workflow (JSON content) |
| `KnowledgeBase` | 22 | [`schema.prisma:400`](../../prisma/schema.prisma#L400) | KB konfiguracija po agentu |
| `KBSource` | 22 | [`schema.prisma:441`](../../prisma/schema.prisma#L441) | Izvor dokumenta (FILE/URL/SITEMAP/TEXT) |
| `KBChunk` | 11 | [`schema.prisma:470`](../../prisma/schema.prisma#L470) | Tekst chunk sa pgvector embedding-om |
| `AnalyticsEvent` | 15 | [`schema.prisma:499`](../../prisma/schema.prisma#L499) | Usage tracking (token, cost, latency) |
| `Conversation` | 11 | [`schema.prisma:536`](../../prisma/schema.prisma#L536) | Chat sesija |
| `Message` | 8 | [`schema.prisma:558`](../../prisma/schema.prisma#L558) | Chat poruka |
| `MCPServer` | 15 | [`schema.prisma:577`](../../prisma/schema.prisma#L577) | MCP server konfiguracija |
| `AgentMCPServer` | 6 | [`schema.prisma:597`](../../prisma/schema.prisma#L597) | Agent↔MCP server mapping |
| `GoogleOAuthToken` | 10 | [`schema.prisma:617`](../../prisma/schema.prisma#L617) | Google Workspace OAuth token |
| `FlowVersion` | 12 | [`schema.prisma:645`](../../prisma/schema.prisma#L645) | Immutable snapshot verzije |
| `FlowDeployment` | 8 | [`schema.prisma:666`](../../prisma/schema.prisma#L666) | Audit log deploy-a |
| `AgentCard` | 6 | [`schema.prisma:683`](../../prisma/schema.prisma#L683) | A2A agent metadata |
| `HumanApprovalRequest` | 12 | [`schema.prisma:692`](../../prisma/schema.prisma#L692) | Human-in-the-loop zahtev |
| `AgentCallLog` | 23 | [`schema.prisma:720`](../../prisma/schema.prisma#L720) | A2A poziv sa distributed tracing |
| `CLIGeneration` | 15 | [`schema.prisma:774`](../../prisma/schema.prisma#L774) | CLI generator pipeline run |
| `AgentMemory` | 12 | [`schema.prisma:797`](../../prisma/schema.prisma#L797) | Persistent memorija agenta sa embedding-om |
| `FlowSchedule` | 19 | [`schema.prisma:836`](../../prisma/schema.prisma#L836) | Cron schedule konfiguracija |
| `ScheduledExecution` | 12 | [`schema.prisma:886`](../../prisma/schema.prisma#L886) | Execution log rasporeda |
| `WebhookConfig` | 22 | [`schema.prisma:933`](../../prisma/schema.prisma#L933) | Inbound webhook endpoint |
| `WebhookExecution` | 20 | [`schema.prisma:1011`](../../prisma/schema.prisma#L1011) | Webhook trigger log |
| `WebhookDeadLetter` | 9 | [`schema.prisma:1077`](../../prisma/schema.prisma#L1077) | Dead-letter zapis neuspelih webhook isporuka |
| `EvalSuite` | 14 | [`schema.prisma:1110`](../../prisma/schema.prisma#L1110) | Test suite za agenta |
| `EvalTestCase` | 11 | [`schema.prisma:1132`](../../prisma/schema.prisma#L1132) | Jedan test case |
| `EvalRun` | 17 | [`schema.prisma:1148`](../../prisma/schema.prisma#L1148) | Jedno izvršavanje suite-a |
| `EvalResult` | 13 | [`schema.prisma:1172`](../../prisma/schema.prisma#L1172) | Rezultat jednog test case-a |
| `AgentExecution` | 16 | [`schema.prisma:1201`](../../prisma/schema.prisma#L1201) | Execution trace (ECC) |
| `Skill` | 17 | [`schema.prisma:1223`](../../prisma/schema.prisma#L1223) | Skill modul (ECC) |
| `AgentSkillPermission` | 6 | [`schema.prisma:1253`](../../prisma/schema.prisma#L1253) | Agent↔Skill RBAC permisija |
| `Instinct` | 13 | [`schema.prisma:1264`](../../prisma/schema.prisma#L1264) | Naučeni pattern (ECC, confidence 0-1) |
| `AuditLog` | 10 | [`schema.prisma:1282`](../../prisma/schema.prisma#L1282) | Compliance log |
| `FlowTrace` | 15 | [`schema.prisma:1308`](../../prisma/schema.prisma#L1308) | Debug execution snapshot |
| `CompanyMission` | 8 | [`schema.prisma:1332`](../../prisma/schema.prisma#L1332) | Misija organizacije (vizija, vrednosti, ciljevi) |
| `Goal` | 16 | [`schema.prisma:1345`](../../prisma/schema.prisma#L1345) | Hijerarhijski cilj vezan za misiju |
| `AgentGoalLink` | 7 | [`schema.prisma:1369`](../../prisma/schema.prisma#L1369) | Veza agent↔cilj sa ulogom |
| `HeartbeatConfig` | 14 | [`schema.prisma:1388`](../../prisma/schema.prisma#L1388) | Konfiguracija heartbeat-a agenta (cron, system prompt) |
| `HeartbeatContext` | 10 | [`schema.prisma:1412`](../../prisma/schema.prisma#L1412) | Key/value kontekst za heartbeat sa TTL |
| `HeartbeatRun` | 13 | [`schema.prisma:1430`](../../prisma/schema.prisma#L1430) | Log jednog heartbeat izvršavanja |
| `Department` | 10 | [`schema.prisma:1456`](../../prisma/schema.prisma#L1456) | Organizaciona jedinica (hijerarhija, agenti) |
| `AgentPermissionGrant` | 10 | [`schema.prisma:1473`](../../prisma/schema.prisma#L1473) | Grant permisije između agenata (scope, istek) |
| `AgentBudget` | 13 | [`schema.prisma:1495`](../../prisma/schema.prisma#L1495) | Budžet agenta (hard/soft limit, tekuća potrošnja) |
| `CostEvent` | 10 | [`schema.prisma:1520`](../../prisma/schema.prisma#L1520) | Pojedinačni trošak (model, tokeni, USD) |
| `BudgetAlert` | 8 | [`schema.prisma:1539`](../../prisma/schema.prisma#L1539) | Alert pri probijanju budžeta |
| `Organization` | 10 | [`schema.prisma:1571`](../../prisma/schema.prisma#L1571) | Organizacija (plan, članovi, agenti) |
| `OrganizationMember` | 7 | [`schema.prisma:1586`](../../prisma/schema.prisma#L1586) | Članstvo korisnika u organizaciji sa ulogom |
| `Invitation` | 9 | [`schema.prisma:1600`](../../prisma/schema.prisma#L1600) | Pozivnica u organizaciju (token, istek) |
| `ModelPerformanceStat` | 11 | [`schema.prisma:1616`](../../prisma/schema.prisma#L1616) | Statistika performansi modela po fazi (uspeh, retry, tokeni) |
| `Template` | 14 | [`schema.prisma:1636`](../../prisma/schema.prisma#L1636) | Deljivi template agenta (payload, checksum, import count) |
| `ApprovalPolicy` | 13 | [`schema.prisma:1662`](../../prisma/schema.prisma#L1662) | Politika odobravanja akcija (pattern, odobravači, timeout) |
| `PolicyDecision` | 14 | [`schema.prisma:1687`](../../prisma/schema.prisma#L1687) | Odluka po approval politici (status, resolver) |
| `PipelineTemplate` | 16 | [`schema.prisma:1722`](../../prisma/schema.prisma#L1722) | Pre-built pipeline recept (agent slugs, koraci, setup guide) |
| `SomaReviewBatch` | 13 | [`schema.prisma:1775`](../../prisma/schema.prisma#L1775) | SOMA review batch (trend, ugao, status) |
| `SomaReviewPost` | 16 | [`schema.prisma:1802`](../../prisma/schema.prisma#L1802) | SOMA review post (platforma, hook, hashtag-ovi, quality flags) |

