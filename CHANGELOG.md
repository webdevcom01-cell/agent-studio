# Changelog

All notable changes to Agent Studio are documented in this file.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## 1.0.0 (2026-07-01)


### Features

* **a2a:** add call_agents_parallel tool for simultaneous sub-agent execution ([718c74b](https://github.com/webdevcom01-cell/agent-studio/commit/718c74b5ce1dcebaf3a6a1fbe6eddc7d76eb9bae))
* add audit logging to org/invite/approval routes (SEC-08) ([9e06875](https://github.com/webdevcom01-cell/agent-studio/commit/9e06875dcce82dcc0f1b3b9c922509db1889c19b))
* add monitoring dashboard script + fix gitignore ([f237f8c](https://github.com/webdevcom01-cell/agent-studio/commit/f237f8c2adb81d04e795045f832d4f3fe2a192c5))
* add SOMA human review queue ([2992f4d](https://github.com/webdevcom01-cell/agent-studio/commit/2992f4d10e9ac295d72bd5329f308b590f4b4a3d))
* **admin:** add Review Queue viewer page ([#143](https://github.com/webdevcom01-cell/agent-studio/issues/143)) ([26bec05](https://github.com/webdevcom01-cell/agent-studio/commit/26bec055eca009a542a12f39001631312e6c0be6))
* **agents:** add failure_modes + LLM Top10 + GitHub patterns to Swarm Security Analyst (AGENT-04 67→70) ([fd8a6f0](https://github.com/webdevcom01-cell/agent-studio/commit/fd8a6f0afe30f2a7b7f5da56c286e0172a198526))
* **agents:** add output schemas and escalation paths (AGENT-01 batch 1) ([b7d8891](https://github.com/webdevcom01-cell/agent-studio/commit/b7d889181a9e28c920e2b6052938dd7796a8ba2d))
* **agents:** final schemas for perf/python/prd/reality (AGENT-01 batch 4 complete - all 16 done) ([cc098d4](https://github.com/webdevcom01-cell/agent-studio/commit/cc098d49a2534bee3d2e21c1c2a2f8fd779e88c9))
* **agents:** structured output for deploy/docs/frontend/refactor (AGENT-01 batch 2) ([b16c777](https://github.com/webdevcom01-cell/agent-studio/commit/b16c777a66c0bb7c52d5aaf7738f5a766b52f445))
* **agents:** structured output for deploy/docs/frontend/refactor (AGENT-01 batch 2) ([e409c41](https://github.com/webdevcom01-cell/agent-studio/commit/e409c414ba583b8789b676987cf15a06307700d5))
* **agents:** trade-off schema for architecture agent (AGENT-01 batch 3 complete) ([a88cb08](https://github.com/webdevcom01-cell/agent-studio/commit/a88cb0876516fb7fe143fdb631b2bf891087250f))
* **api:** bind API keys to an organization ([6588c52](https://github.com/webdevcom01-cell/agent-studio/commit/6588c52d1cfa45394464257606f5f7fc0a4e2bf6))
* **audit:** wire org admin events to AuditLog (SEC-05) ([69db316](https://github.com/webdevcom01-cell/agent-studio/commit/69db3160baa25201dfd8b57645566027634d8d38))
* **audit:** wire writeAuditLog for MCP tool RBAC denials in mcp-tool-handler ([8309e80](https://github.com/webdevcom01-cell/agent-studio/commit/8309e80ad73097ba60b242eeff93c8ca06677595))
* **auth:** add email/password authentication ([4c3abc0](https://github.com/webdevcom01-cell/agent-studio/commit/4c3abc0c10f2a4a893700e10499104814f6abfd9))
* **auth:** add org-switch endpoint + persisted User.currentOrgId ([4df4bf2](https://github.com/webdevcom01-cell/agent-studio/commit/4df4bf2bfa71243cfdcbe04d13dc1b47f9932ce2))
* **b1-b2:** Railway worker healthcheck, flag rollout API, and RLS migration ([b593b03](https://github.com/webdevcom01-cell/agent-studio/commit/b593b03a02c8f6920ae6347d65b1bf15ac4ddd7b))
* **call-agent:** make timeout configurable via node.data.timeout, default 90s ([c6453e6](https://github.com/webdevcom01-cell/agent-studio/commit/c6453e63937c3ec3e60de944385053705c830fb7))
* **chat:** readable markdown (markdown-body), generic human renderer, message copy + richer empty state ([f1cdb58](https://github.com/webdevcom01-cell/agent-studio/commit/f1cdb58dec8b273aaec38541f2da6697d20e175e))
* **chat:** readable markdown (markdown-body), generic human renderer… ([c688612](https://github.com/webdevcom01-cell/agent-studio/commit/c688612d3d3f3e5057a077b25caa92ab3d275894))
* **dashboard:** enterprise KPI overview + recent activity + metrics … ([13ede08](https://github.com/webdevcom01-cell/agent-studio/commit/13ede083d9cafac048092497045254f3b4afc12b))
* **dashboard:** enterprise KPI overview + recent activity + metrics endpoints ([ffd14a7](https://github.com/webdevcom01-cell/agent-studio/commit/ffd14a795410d0a4cd5fec9fbfe8da1fb442eb35))
* **db:** Phase 0a.7b — schema drift sync migration ([#125](https://github.com/webdevcom01-cell/agent-studio/issues/125)) ([9352c14](https://github.com/webdevcom01-cell/agent-studio/commit/9352c1405484bb949f0b8fbb97e1d89ad5437d8b))
* **db:** Phase 0b — create app_user/admin_user DB roles with least-privilege grants ([407b8d3](https://github.com/webdevcom01-cell/agent-studio/commit/407b8d3e883f3cc5f234eb5902aaea4908856543))
* **ecc:** auto-sync instincts to Obsidian vault after learn hook ([4bdd7d8](https://github.com/webdevcom01-cell/agent-studio/commit/4bdd7d8ce63926eaf4234d49d2555b307dda554d))
* **evals:** make per-case chat timeout configurable in eval runner ([822784a](https://github.com/webdevcom01-cell/agent-studio/commit/822784a27b619db1195ca1cdc5e33deef36cabba))
* Faza 1 Vidljivost — status badge + Resume + bolji error poruke ([263292c](https://github.com/webdevcom01-cell/agent-studio/commit/263292cf4c2151b9ca1f1260c59254340a0edda5))
* **faza3/3.1:** stuck-run detection + force-resume + zombie job guard ([fec622e](https://github.com/webdevcom01-cell/agent-studio/commit/fec622e94683f6fa3e6c8c4140df0c5bd741a243))
* **faza3/3.1:** UI stuck-run badge + Nastavi button + correct Cancel condition ([3e10a80](https://github.com/webdevcom01-cell/agent-studio/commit/3e10a80fdc1a3203ca179c0a48f48f693c9577f1))
* **faza3/3.2:** per-step timeouts — replace flat STEP_TIMEOUT_MS with getStepTimeoutMs() ([aeb6088](https://github.com/webdevcom01-cell/agent-studio/commit/aeb6088fb7508036b018851006fc897c006c7fcf))
* implement Agent Studio + Paperclip integration (F0-F8) ([eff5e22](https://github.com/webdevcom01-cell/agent-studio/commit/eff5e2258dc8f84f64d38c7c9141ea7ba218a093))
* instrument executeFlow to write AgentExecution records ([719f308](https://github.com/webdevcom01-cell/agent-studio/commit/719f308483899784c384f8a57751bafd4d259a97))
* Layer 1 — webhook-to-pipeline bridge + GitHub/GitLab signature support ([b69000b](https://github.com/webdevcom01-cell/agent-studio/commit/b69000b4e03cc342b5e3e6df01ff63ef17da0f1d))
* **managed-tasks:** bound per-step context in long tool-using runs (… ([6259329](https://github.com/webdevcom01-cell/agent-studio/commit/62593294760bf0bc5cf41c0b8084c66a63d8f642))
* **managed-tasks:** bound per-step context in long tool-using runs (N10) ([5afeaf4](https://github.com/webdevcom01-cell/agent-studio/commit/5afeaf49a9eba929e44b5532c9a9357c64f1a0e8))
* **mcp-server:** add 5 eval tools + as_create_agent ([cb91205](https://github.com/webdevcom01-cell/agent-studio/commit/cb9120591fb510b229b556348fb82700270584bf))
* **mcp-server:** add 5 knowledge base tools ([efd996b](https://github.com/webdevcom01-cell/agent-studio/commit/efd996b45029460da07d3d878ced3a838335a372))
* **mcp-server:** add A2A call log tools (as_get_agent_call_log, as_list_agent_calls) ([e29ce2d](https://github.com/webdevcom01-cell/agent-studio/commit/e29ce2de7b700e269001f14e846e376093aeb6e4))
* **mcp-server:** add as_chat_with_agent tool ([c5e95a6](https://github.com/webdevcom01-cell/agent-studio/commit/c5e95a6758ce91c508582ad7b71413cbc3050f94))
* **mcp:** add 5 eval/KB/heartbeat tools (TIER 1+2) ([7773c0d](https://github.com/webdevcom01-cell/agent-studio/commit/7773c0d13f52cb87b2e6464c1f0c9d5cd4b814cc))
* **mcp:** add as_delete_eval_suite (6th tool) ([8b1848b](https://github.com/webdevcom01-cell/agent-studio/commit/8b1848bdb966194bfad70b7e5a4b2f5ab57b4077))
* **mcp:** add as_list_eval_cases, as_update_eval_case, as_delete_eval_case, as_list_kb_sources (41→45 tools) ([855fbfe](https://github.com/webdevcom01-cell/agent-studio/commit/855fbfe81ee2d748143f1736064e98493a08d3f4))
* **observability:** AAIF 2026 OTel attributes + feedbackSpan propagation ([1cb5d63](https://github.com/webdevcom01-cell/agent-studio/commit/1cb5d635fbcf4d268f272a41dbd962c33243546e))
* **observability:** add OTEL traces and metrics to SDLC pipeline orchestrator ([7ddaed9](https://github.com/webdevcom01-cell/agent-studio/commit/7ddaed9480d6443c344c1dbd9997105c637a941c))
* **observability:** tag Sentry events for SQLSTATE 42501 RLS violations ([#111](https://github.com/webdevcom01-cell/agent-studio/issues/111)) ([5a9b131](https://github.com/webdevcom01-cell/agent-studio/commit/5a9b131fba1ff5c33c1dfedcf6118565e35be902))
* **orchestrator:** parallel gate step execution (Prompt 2) ([096874a](https://github.com/webdevcom01-cell/agent-studio/commit/096874af2712db06ff122b24d1738485e555a1a4))
* **orchestrator:** pipeline-level cancel propagation (Prompt 3B) ([dba01c1](https://github.com/webdevcom01-cell/agent-studio/commit/dba01c1669de8476e6f8c5a4187e28b3a57ebba9))
* Phase 10 — live refresh, cancel/retry UI, GitLab subpath fix, cancelled metrics, advanced run options, stepMetrics merge on retry ([3ada1dd](https://github.com/webdevcom01-cell/agent-studio/commit/3ada1dd10380c88e52ce8e9fab0e78d23f77626f))
* Phase 11 — gate enforcement, adaptive routing cache, memory scoring, schema migration, metrics durability ([d719a46](https://github.com/webdevcom01-cell/agent-studio/commit/d719a46f32e46bf7fd57748ae37cd17a345ac992))
* Phase 9 — GitLab support + glob .sdlcignore + metrics phase filter ([5eb6d7d](https://github.com/webdevcom01-cell/agent-studio/commit/5eb6d7dc6598ba85d5cca667d5065b28ef4ab660))
* **phase7:** add sourceRepoUrl — clone source repo before RAG indexing ([1da107d](https://github.com/webdevcom01-cell/agent-studio/commit/1da107dcf25d4e1f1c9b3dbb5a7c8b67f7276d65))
* **phase8:** sourceRepoUrl UI + per-agent metrics + .sdlcignore ([2c4657d](https://github.com/webdevcom01-cell/agent-studio/commit/2c4657d3b475668944ea2ccade757017a8002ec6))
* **pipeline:** Phase 5 — approval gate UI + Slack AWAITING_APPROVAL notification ([0faf4ac](https://github.com/webdevcom01-cell/agent-studio/commit/0faf4ac3bb769b2fc73177206ff42dde7bf3bb88))
* **pipeline:** Phase 6 — metrics summary card with per-agent stats and model performance table ([4da7fca](https://github.com/webdevcom01-cell/agent-studio/commit/4da7fca65dfd1ba04f7c46aca254659693a58c44))
* **rls-rollout:** assemble combined Phase 2 staging migration ([7b95836](https://github.com/webdevcom01-cell/agent-studio/commit/7b958369d27f23325210507b886fc044f166e67d))
* **rls-rollout:** hand-author Phase 2 multi-hop RLS policies ([0d787ae](https://github.com/webdevcom01-cell/agent-studio/commit/0d787ae933873bcd34ef10e58a53982e0eccf6d6))
* **rls:** add rls-status-checker skill with dependency graph ([e72e4ac](https://github.com/webdevcom01-cell/agent-studio/commit/e72e4acc0f545d7c4d8d3bd93a04983aa2a0a2fa))
* **rls:** auto-provision a personal org on first login ([bb702df](https://github.com/webdevcom01-cell/agent-studio/commit/bb702dfd40cbb35fb8cf6bd709e89fb880c2d2fd))
* **rls:** auto-provision a personal org on first login ([1b93db9](https://github.com/webdevcom01-cell/agent-studio/commit/1b93db9b983cbbdcdf9e631c65814d8b7ec5121d))
* **rls:** execution-engine org threading (streaming-safe RLS) ([2ddf58c](https://github.com/webdevcom01-cell/agent-studio/commit/2ddf58c3e3dfbeb154d01aecfefb808234d92174))
* **rls:** mcp tools + chat agent read via withAdminBypass (guard → 0) ([f3b08bb](https://github.com/webdevcom01-cell/agent-studio/commit/f3b08bb5013a163845f67b8be78f1a503e83ea25))
* **rls:** org context for A2A JSON-RPC execution route ([183a21a](https://github.com/webdevcom01-cell/agent-studio/commit/183a21a3c6596764a2522652465e8cf29aadc767))
* **rls:** org context for A2A JSON-RPC execution route ([3d58dfe](https://github.com/webdevcom01-cell/agent-studio/commit/3d58dfe944366c4ffb14d155dca0c1c17fb475f9))
* **rls:** org context for execute route + mcp worker flow job ([66d6a97](https://github.com/webdevcom01-cell/agent-studio/commit/66d6a979e8173be94030342bb6e22555cc5e0b51))
* **rls:** org context for execute route + mcp worker flow job ([f5525e6](https://github.com/webdevcom01-cell/agent-studio/commit/f5525e6332df00e86751bbcf13e123d4c94e7f41))
* **rls:** Phase 0b.5 — refactor 5 raw $transaction helpers ([#121](https://github.com/webdevcom01-cell/agent-studio/issues/121)) ([48a72a5](https://github.com/webdevcom01-cell/agent-studio/commit/48a72a5f1605958f908b9ce754f6bf9fed26637f))
* **rls:** Phase 0c — JWT currentOrgId + AsyncLocalStorage propagation ([#118](https://github.com/webdevcom01-cell/agent-studio/issues/118)) ([8de264f](https://github.com/webdevcom01-cell/agent-studio/commit/8de264f19f16031b73ef0c3a60f51900d9a049ac))
* **rls:** Phase 0d — personal org backfill migration ([#119](https://github.com/webdevcom01-cell/agent-studio/issues/119)) ([5a1a0a9](https://github.com/webdevcom01-cell/agent-studio/commit/5a1a0a92e6f14a6f8a5fbddd7ce33493684dc019))
* **rls:** Phase 0f — RLS_ENFORCEMENT_ENABLED feature flag kill switch ([#115](https://github.com/webdevcom01-cell/agent-studio/issues/115)) ([857e31e](https://github.com/webdevcom01-cell/agent-studio/commit/857e31e4e873c82cb592408870a5ac1f1f211b05))
* **rls:** Phase 1 — managed-tasks API zone (10 sites) via withOrgContext ([b6a37b5](https://github.com/webdevcom01-cell/agent-studio/commit/b6a37b58599ff945b10253f966ffc06182c15635))
* **rls:** Phase 1 — managed-tasks service+API zone (10 sites) ([5c9342c](https://github.com/webdevcom01-cell/agent-studio/commit/5c9342c4ce4e44fcc5b9f548c64c1c99654831e8))
* **rls:** Phase 1 — sdlc pipeline-manager API+cron zone (13 sites) ([6e414bc](https://github.com/webdevcom01-cell/agent-studio/commit/6e414bce0a9ee40c2479af24a78cc9e7d0def2c1))
* **rls:** Phase 1 — sdlc pipeline-manager API+cron zone (13 sites) ([5d6898f](https://github.com/webdevcom01-cell/agent-studio/commit/5d6898f26ba78464a80c589f8ed60f8c9a9b031d))
* **rls:** Phase 1 [#1](https://github.com/webdevcom01-cell/agent-studio/issues/1) — OrganizationMember RLS + blocker fixes ([97a518c](https://github.com/webdevcom01-cell/agent-studio/commit/97a518cde17aaa5d1bcb08f774204af2065c0f9d))
* **rls:** Phase 1 [#1](https://github.com/webdevcom01-cell/agent-studio/issues/1) — OrganizationMember RLS + blocker fixes ([97a518c](https://github.com/webdevcom01-cell/agent-studio/commit/97a518cde17aaa5d1bcb08f774204af2065c0f9d))
* **rls:** Phase 1 [#1](https://github.com/webdevcom01-cell/agent-studio/issues/1) — OrganizationMember RLS + blocker fixes ([34333e6](https://github.com/webdevcom01-cell/agent-studio/commit/34333e6584a1d14b505932bf87b699a6705ced48))
* **rls:** Phase 1 [#10](https://github.com/webdevcom01-cell/agent-studio/issues/10) — ApprovalPolicy RLS + callsite fixes ([#138](https://github.com/webdevcom01-cell/agent-studio/issues/138)) ([9b27c21](https://github.com/webdevcom01-cell/agent-studio/commit/9b27c2179b73f6a08f77876b24394ab3473a815f))
* **rls:** Phase 1 [#11](https://github.com/webdevcom01-cell/agent-studio/issues/11) — PolicyDecision RLS + callsite fixes ([#139](https://github.com/webdevcom01-cell/agent-studio/issues/139)) ([d03825c](https://github.com/webdevcom01-cell/agent-studio/commit/d03825ced4f41ab2ed54c4bfdb53d07b6b05fdd4))
* **rls:** Phase 1 [#2](https://github.com/webdevcom01-cell/agent-studio/issues/2) — Invitation RLS + blocker fixes ([#130](https://github.com/webdevcom01-cell/agent-studio/issues/130)) ([4ab9d19](https://github.com/webdevcom01-cell/agent-studio/commit/4ab9d19eff7793bbf0834a8e1e3a6ab3527b3c17))
* **rls:** Phase 1 [#3](https://github.com/webdevcom01-cell/agent-studio/issues/3) — CompanyMission RLS + callsite fixes ([#131](https://github.com/webdevcom01-cell/agent-studio/issues/131)) ([254a256](https://github.com/webdevcom01-cell/agent-studio/commit/254a25653746239ac7e56c88234fbe440e3f032c))
* **rls:** Phase 1 [#4](https://github.com/webdevcom01-cell/agent-studio/issues/4) — Department RLS + callsite fixes + gitignore scheduler lock ([#132](https://github.com/webdevcom01-cell/agent-studio/issues/132)) ([708e5c7](https://github.com/webdevcom01-cell/agent-studio/commit/708e5c7528df86953c10c6dd24ffc31c99ac8d73))
* **rls:** Phase 1 [#5](https://github.com/webdevcom01-cell/agent-studio/issues/5) — Goal RLS + callsite fixes ([#133](https://github.com/webdevcom01-cell/agent-studio/issues/133)) ([c91ad04](https://github.com/webdevcom01-cell/agent-studio/commit/c91ad04b31a7629845119fa31a26f67ad36b7b76))
* **rls:** Phase 1 [#6](https://github.com/webdevcom01-cell/agent-studio/issues/6) — AgentPermissionGrant RLS + callsite fixes ([#134](https://github.com/webdevcom01-cell/agent-studio/issues/134)) ([e2c5c78](https://github.com/webdevcom01-cell/agent-studio/commit/e2c5c7841246bdcc945f49d445d1c8877d1672eb))
* **rls:** Phase 1 [#7](https://github.com/webdevcom01-cell/agent-studio/issues/7) — HeartbeatConfig RLS + callsite fixes ([#135](https://github.com/webdevcom01-cell/agent-studio/issues/135)) ([4ed3232](https://github.com/webdevcom01-cell/agent-studio/commit/4ed3232b6e36a7a45f81b7afe1fc70b7095f1628))
* **rls:** Phase 1 [#8](https://github.com/webdevcom01-cell/agent-studio/issues/8) — HeartbeatContext RLS + callsite fixes ([#136](https://github.com/webdevcom01-cell/agent-studio/issues/136)) ([7220ca6](https://github.com/webdevcom01-cell/agent-studio/commit/7220ca6dda62839ba314900d441e9680a8646037))
* **rls:** Phase 1 [#9](https://github.com/webdevcom01-cell/agent-studio/issues/9) — HeartbeatRun RLS + callsite fixes ([#137](https://github.com/webdevcom01-cell/agent-studio/issues/137)) ([f58abdc](https://github.com/webdevcom01-cell/agent-studio/commit/f58abdcb1f9be66aca25d53e801dd6a790e7d492))
* **rls:** Phase 1 Batch A — ecc/versioning/knowledge (30 sites) ([5bf7623](https://github.com/webdevcom01-cell/agent-studio/commit/5bf7623b84f9c5608d8e47a3725fb9cb5a5c455d))
* **rls:** Phase 1 Batch A — ecc/versioning/knowledge (30 sites) ([91554d2](https://github.com/webdevcom01-cell/agent-studio/commit/91554d20c8e9d72923185e07c1055690b7d15281))
* **rls:** Phase 1 Batch B — webhooks/analytics/evals (28 sites) ([bfe9b89](https://github.com/webdevcom01-cell/agent-studio/commit/bfe9b89bc2c3a0021d20328995c66719292c670d))
* **rls:** Phase 1 Batch B — webhooks/analytics/evals (28 sites) ([cc9504c](https://github.com/webdevcom01-cell/agent-studio/commit/cc9504cd012615cc932e294dfd24613c9a198d91))
* **rls:** Phase 1 Batch C — runtime/handlers/sdk-sessions/agent-tools ([9329bac](https://github.com/webdevcom01-cell/agent-studio/commit/9329baca1691c1ef29055cbf054dec46e1f59768))
* **rls:** Phase 1 Batch C — runtime/handlers/sdk-sessions/agent-tools (44 writes) ([73f119a](https://github.com/webdevcom01-cell/agent-studio/commit/73f119a3bafd316ebb96363b5bfd4635c95a367c))
* **rls:** Phase 1 Batch D1 — system data services (23 sites) ([14554f0](https://github.com/webdevcom01-cell/agent-studio/commit/14554f0e21c0501d6709fac658e4bcfc6d4f7700))
* **rls:** Phase 1 Batch D1 — system data services (23 sites) ([c2c0f14](https://github.com/webdevcom01-cell/agent-studio/commit/c2c0f1472f031f84502c017ad42b7e1149e12032))
* **rls:** Phase 1 Batch D2 — misc lib + API (21 sites) ([2f2b2a8](https://github.com/webdevcom01-cell/agent-studio/commit/2f2b2a831b86452526b2571c3a334acd1fdb521d))
* **rls:** Phase 1 Batch D2 — misc lib + API (21 sites) ([11989fa](https://github.com/webdevcom01-cell/agent-studio/commit/11989fa7ff5a61695b007cdad6df0c08dcf4c418))
* **rls:** Phase 1 Batch E1 — worker lifecycle + payload-org ([1ae0de3](https://github.com/webdevcom01-cell/agent-studio/commit/1ae0de31111442de1e31a42755b0139e7cd1740c))
* **rls:** Phase 1 Batch E1 — worker lifecycle + payload-org threading ([9cbdbef](https://github.com/webdevcom01-cell/agent-studio/commit/9cbdbef5c584f872d96a0198ad2ac9020766d647))
* **rls:** Phase 1 Batch E2 — burn-down 0 ([a9b7704](https://github.com/webdevcom01-cell/agent-studio/commit/a9b77044270537cc0fef2dd1f41737c00efa9a0e))
* **rls:** Phase 1 Batch E2 — workers/cron/system (burn-down 0) ([bf7d56e](https://github.com/webdevcom01-cell/agent-studio/commit/bf7d56ef50acdb1d9074ecb9fcb8aab32842912f))
* **rls:** Phase 1 Batch F1 — knowledge raw-SQL ([64970c5](https://github.com/webdevcom01-cell/agent-studio/commit/64970c50c1ae5d8f1ed8e4383d895515eae90dfa))
* **rls:** Phase 1 Batch F1 — knowledge raw-SQL via withAdminBypass (21 calls) ([fa4ab08](https://github.com/webdevcom01-cell/agent-studio/commit/fa4ab0819f864300508dce546964770f448f5766))
* **rls:** Phase 1 Batch F2 — API/ecc/scheduler raw-SQL (query-path complete) ([8dd576c](https://github.com/webdevcom01-cell/agent-studio/commit/8dd576c288576c280826c7730a2bb9890efeb518))
* **rls:** Phase 1 Batch F2 — final raw-SQL (query-path complete) ([f4bbf8c](https://github.com/webdevcom01-cell/agent-studio/commit/f4bbf8cc87c4c6619dc8b89d03230824908cd528))
* **rls:** phase-1 app foundation — admin-bypass client + agent route org context ([39b360a](https://github.com/webdevcom01-cell/agent-studio/commit/39b360a2380dd6744c23cdce526d949d1f364f1c))
* **rls:** phase-1 app foundation — admin-bypass client + agent route org context ([697d4f5](https://github.com/webdevcom01-cell/agent-studio/commit/697d4f5884659d1eb387be125951e520b96f086e))
* **rls:** route ADMIN/system paths through withAdminBypass ([3264276](https://github.com/webdevcom01-cell/agent-studio/commit/326427651efef5405a257190cbbe76c999753a26))
* **rls:** route ADMIN/system paths through withAdminBypass ([b655589](https://github.com/webdevcom01-cell/agent-studio/commit/b65558910629465aca62be47ee4efccbc157bfd7))
* **rls:** route ECC system agent access through withAdminBypass ([8ad79f9](https://github.com/webdevcom01-cell/agent-studio/commit/8ad79f99577e88d98c0a9556ae19a91c9e9472a0))
* **rls:** route ECC system agent access through withAdminBypass ([261c9c5](https://github.com/webdevcom01-cell/agent-studio/commit/261c9c59baa0b2a9b9fa124d70dd60bef5ee4a59))
* **rls:** route mcp tools + chat agent read through withAdminBypass ([1789c4d](https://github.com/webdevcom01-cell/agent-studio/commit/1789c4d59213b92b9b56643c57bdec76c19cd850))
* **rls:** route PUBLIC agent-card reads through withAdminBypass ([882eaa6](https://github.com/webdevcom01-cell/agent-studio/commit/882eaa67dd8ccb67050f06e352853ce318c5f310))
* **rls:** route PUBLIC agent-card reads through withAdminBypass ([1ecbfca](https://github.com/webdevcom01-cell/agent-studio/commit/1ecbfca53ad4fdd50e88f31c852baefc68bd3ad3))
* **rls:** route runtime agent reads through withTenant (ALS org context) ([b175e88](https://github.com/webdevcom01-cell/agent-studio/commit/b175e88cb7162ee9d09c28aabe3059bb7eccc3cc))
* **rls:** runtime agent reads via withTenant (ALS org context) ([17d9dd0](https://github.com/webdevcom01-cell/agent-studio/commit/17d9dd00e2b37acc16649eede21b69c640a60df6))
* **rls:** scaffold skills/rls-rollout/ for Phase 1 SQL generation ([#128](https://github.com/webdevcom01-cell/agent-studio/issues/128)) ([50eaab5](https://github.com/webdevcom01-cell/agent-studio/commit/50eaab558a09150beaf118e67583a6c9e131b617))
* **rls:** thread tenant org through execution engine for streaming-safe RLS ([f28c7a9](https://github.com/webdevcom01-cell/agent-studio/commit/f28c7a9caf8018c7e600dfffeaa77ba254015697))
* **rls:** wrap agents/[agentId] tenant routes in withOrgContext ([4cc2136](https://github.com/webdevcom01-cell/agent-studio/commit/4cc2136f53401016ffa338e4ebb0efae4fd42360))
* **rls:** wrap agents/[agentId] tenant routes in withOrgContext ([c9b5e71](https://github.com/webdevcom01-cell/agent-studio/commit/c9b5e71e8a70da1cddade0091d9e0ca391d6e84e))
* **rls:** wrap templates routes (withOrgContext / withAdminBypass) ([03c4f82](https://github.com/webdevcom01-cell/agent-studio/commit/03c4f82cd410291b5369b067b643632bd3a202eb))
* **rls:** wrap templates routes in withOrgContext / withAdminBypass ([9ac31fc](https://github.com/webdevcom01-cell/agent-studio/commit/9ac31fcd7e770cded96a8e9177052be1ad32dae7))
* **rls:** wrap userId-centric agent routes in withOrgContext ([4a49498](https://github.com/webdevcom01-cell/agent-studio/commit/4a49498814b4942f7bd24280c7ed7e3595c8a164))
* **rls:** wrap userId-centric agent routes in withOrgContext (org from session) ([3003ac9](https://github.com/webdevcom01-cell/agent-studio/commit/3003ac92fa22a5daa5cb8ed4d418d3af1de54660))
* route CR payload save to chat endpoint via shared utility ([ea38913](https://github.com/webdevcom01-cell/agent-studio/commit/ea38913ed6e8756ec609cdfa7c0d026159b5e860))
* **runtime:** add mid-run context compaction safety net (N1) ([8033ef1](https://github.com/webdevcom01-cell/agent-studio/commit/8033ef1a98ce5d968fdff4c9cd1e7759220848e2))
* **runtime:** add mid-run context compaction safety net (N1) ([7b6956a](https://github.com/webdevcom01-cell/agent-studio/commit/7b6956a7caabadbc16ca151ad478b13cd43d8873))
* **runtime:** configurable summary model + history window (N5, N2) ([484d019](https://github.com/webdevcom01-cell/agent-studio/commit/484d019712e7acad56610d28ffed6f7446868886))
* **runtime:** configurable summary model + history window (N5, N2) ([33ff134](https://github.com/webdevcom01-cell/agent-studio/commit/33ff1349a63e5a1eb6bab2e7dcebc1b51867871c))
* **runtime:** opt-in stable-prefix system prompt for KV-caching (N7) ([df773b1](https://github.com/webdevcom01-cell/agent-studio/commit/df773b16f924e339ba4fd82409e05dd87dfe283d))
* **runtime:** opt-in stable-prefix system prompt for KV-caching (N7) ([e31f06f](https://github.com/webdevcom01-cell/agent-studio/commit/e31f06f6ff55731c45d8f98c50f1a11f1ae24079))
* **runtime:** per-node opt-out for cost-monitor tier downgrade (N4) ([d732743](https://github.com/webdevcom01-cell/agent-studio/commit/d732743e40b6bc15ff1266c66e6f72c15e952f6a))
* **runtime:** per-node opt-out for cost-monitor tier downgrade (N4) ([9592887](https://github.com/webdevcom01-cell/agent-studio/commit/959288749e93cbe66f41163447b05571222b650e))
* **sdk-sessions:** bound SDK session growth with rolling compaction … ([8704f72](https://github.com/webdevcom01-cell/agent-studio/commit/8704f72089bf66f64035150055f12a86fe65f567))
* **sdk-sessions:** bound SDK session growth with rolling compaction (N9) ([7d2dfd7](https://github.com/webdevcom01-cell/agent-studio/commit/7d2dfd7ddedbbb68c0cf59a98fdf186b05829c46))
* **sdlc:** add ecc-implementer step to new-feature and bug-fix pipelines ([b88e5dc](https://github.com/webdevcom01-cell/agent-studio/commit/b88e5dcdc5aab379582ff43ea6654de82051f1bf))
* **sdlc:** add gpt-4o-mini to model catalog and set as primary model for all phases ([0544392](https://github.com/webdevcom01-cell/agent-studio/commit/054439202ae680f47bd113c133c8b9dc7f468ee8))
* **sdlc:** E2B cloud sandbox integration for isolated code execution ([46f7f74](https://github.com/webdevcom01-cell/agent-studio/commit/46f7f7447f9f5cd43500dff7bc84b225d91c5b5c))
* **sdlc:** inject Obsidian vault context into pipeline runs ([e7ef87f](https://github.com/webdevcom01-cell/agent-studio/commit/e7ef87fac77749cbddd90fef8a9f482359924c0b))
* **sdlc:** integrate RAG, multi-step planning, and feedback loop (P6) ([432f959](https://github.com/webdevcom01-cell/agent-studio/commit/432f95921d901b9457103051960d007fa6d992c7))
* **sdlc:** P2-P5 — model overrides, phase-aware RAG, AI retry, real-fs integration tests + deploy-trigger fix ([0e6f5d3](https://github.com/webdevcom01-cell/agent-studio/commit/0e6f5d3e03b5c335b8fb9787ac32006f3c101cba))
* **sdlc:** Phase 1 — static_analysis infrastructure node (tsc + eslint) ([ecb13ab](https://github.com/webdevcom01-cell/agent-studio/commit/ecb13ab550196159d1bfabf2585834eb948925d2))
* **sdlc:** Phase 2 — pr_generation infrastructure node with rich PR body ([057ee87](https://github.com/webdevcom01-cell/agent-studio/commit/057ee8751ac4f7b113b1d70ef02a671d3610ec04))
* **sdlc:** Phase 3 — ecc-security-reviewer structured output + GATE_STEPS ([5b42230](https://github.com/webdevcom01-cell/agent-studio/commit/5b42230d76138d16b4e9df508e1c21d24d434021))
* **sdlc:** Phase 4 — pipeline resumability + stale-run detection ([f90aba4](https://github.com/webdevcom01-cell/agent-studio/commit/f90aba40f76c1a7693f7aa8964e5551efd320f42))
* **sdlc:** real file writing + compilation + test execution (P7) ([4493187](https://github.com/webdevcom01-cell/agent-studio/commit/4493187acb9f23748a751183767ba0066f07d05a))
* **sdlc:** switch default model from deepseek-chat to gpt-4o-mini ([a72b9af](https://github.com/webdevcom01-cell/agent-studio/commit/a72b9afa7d55420e5547a80ca83eb2b6f217b385))
* **sdlc:** Tier 3 + Tier 4 — real-exec bug fix, observability, adaptive routing & retry escalation ([006cef4](https://github.com/webdevcom01-cell/agent-studio/commit/006cef4d4aa1fc3c4bb63a61562baf426c2059da))
* **sdlc:** Tier 5 — git/PR integration after pipeline completion ([45e5bcb](https://github.com/webdevcom01-cell/agent-studio/commit/45e5bcb14876ef855f1f7759ab9d2e2705591c45))
* **security:** enforce org-level RBAC in mcp-tool-handler ([6a9ab03](https://github.com/webdevcom01-cell/agent-studio/commit/6a9ab03055e5424e7b6ff348842197d0c1469ea5))
* **security:** redact PII in AgentExecution inputParams and outputResult ([74233cf](https://github.com/webdevcom01-cell/agent-studio/commit/74233cffd2d7fc14811f9b2d9b334a8f9c61d282))
* **security:** scan web_search results for prompt injection ([7851675](https://github.com/webdevcom01-cell/agent-studio/commit/785167511b12dbeb25ff691d5f7ce518ca1e2682))
* **skills:** add rls-rollout skill v1.0.0 ([#96](https://github.com/webdevcom01-cell/agent-studio/issues/96)) ([800502b](https://github.com/webdevcom01-cell/agent-studio/commit/800502bfef70cb2b50d61698cd4d8872d98bdd73))
* **soma:** add SOMA marketing trio agent prompts ([e8f7753](https://github.com/webdevcom01-cell/agent-studio/commit/e8f7753f04dc7a1705336cff30c7876c7ed45ea1))
* **soma:** add SOMA Obsidian memory vault ([87b3b3a](https://github.com/webdevcom01-cell/agent-studio/commit/87b3b3a2c215b966b96f344799622bb95582d886))
* **soma:** persist and display quality_flags in review queue ([#157](https://github.com/webdevcom01-cell/agent-studio/issues/157)) ([881d2dd](https://github.com/webdevcom01-cell/agent-studio/commit/881d2ddc6f906a5f21a8dfd2f8759844eb3184fe))
* **ui:** add SDLC Pipelines page with step metrics and finalOutput viewer ([8b35eb7](https://github.com/webdevcom01-cell/agent-studio/commit/8b35eb7a5138fb43eb22a6f6dc897656df62c34c))
* **ui:** Ember design system + landing redesign ([d47c44d](https://github.com/webdevcom01-cell/agent-studio/commit/d47c44d6c0c0ea422a4e26aee46036266817395b))
* **ui:** Ember design system + landing redesign ([6f12a8a](https://github.com/webdevcom01-cell/agent-studio/commit/6f12a8a2ac55e86e12289d469af89f157455211f))
* **ui:** enterprise split-layout for login & register (AuthShell) ([ce6a553](https://github.com/webdevcom01-cell/agent-studio/commit/ce6a55311a8e1d76ab165136617af9d9686adadf))
* **ui:** enterprise split-layout for login & register (AuthShell) ([2fa49a7](https://github.com/webdevcom01-cell/agent-studio/commit/2fa49a7e83f91a05d171137d859cc779ba39b9d4))
* **ui:** white-on-primary (K4) + sidebar theme toggle; verify dark-m… ([1382237](https://github.com/webdevcom01-cell/agent-studio/commit/1382237d46da8a5b4bbe2bb4e7a209a632c52403))
* **ui:** white-on-primary (K4) + sidebar theme toggle; verify dark-mode parity ([7e9411d](https://github.com/webdevcom01-cell/agent-studio/commit/7e9411d60dd4a94495a977e97545474388c850db))
* **vault-lint:** add build-guide to canonical type enum ([daf8750](https://github.com/webdevcom01-cell/agent-studio/commit/daf8750a061229fe1e2533c443d19566e7ebe05a))
* **vault-lint:** add winners-log to canonical type enum ([ce0b71f](https://github.com/webdevcom01-cell/agent-studio/commit/ce0b71f3e474253b6bab0092a28e3f4b48a9880e))
* **vault-lint:** exempt root README.md (front-door meta file) ([f70c2d8](https://github.com/webdevcom01-cell/agent-studio/commit/f70c2d8348d04c193dc7c940dea5ff0f98710869))
* **vault-lint:** validate type against canonical enum (handoff, analysis added) ([6f7ccf8](https://github.com/webdevcom01-cell/agent-studio/commit/6f7ccf8e1e067074506281be3be48f53d41b9a56))
* **worker:** add Slack notification for SDLC pipeline completion and failure ([d18fae3](https://github.com/webdevcom01-cell/agent-studio/commit/d18fae3374a5904def2b4653c4eec95b47fd2200))
* **worker:** enable async-execution flag for BullMQ job routing ([9209e27](https://github.com/webdevcom01-cell/agent-studio/commit/9209e271b78168ee95db95a690eb2338f9c604cf))


### Bug Fixes

* Fix:  ([932209a](https://github.com/webdevcom01-cell/agent-studio/commit/932209a4b3c0b13645bfad59cd2c83575d68d97e))
* A2A format mismatch + timeout ([4231b8f](https://github.com/webdevcom01-cell/agent-studio/commit/4231b8fb42c4ca34f3e1ea86ff89ef736b7648db))
* **a2a:** inject sub-agent input as user message in messageHistory ([e27c2a8](https://github.com/webdevcom01-cell/agent-studio/commit/e27c2a85f1b6c53801e61a43d0f64e3841bc2014))
* accept GITHUB_TOKEN env var (in addition to GITHUB_PAT) for git integration ([ab4a9ff](https://github.com/webdevcom01-cell/agent-studio/commit/ab4a9ff4f965439b3cdde1a4fa3127f9891c861d))
* add JSON extractor nodes to TI and HW flows ([8fd44ef](https://github.com/webdevcom01-cell/agent-studio/commit/8fd44ef438dff22fc3833d0da08bbf50f385419b))
* add Zod validation to evaluator result parsing (K-005) ([#168](https://github.com/webdevcom01-cell/agent-studio/issues/168)) ([3d7df8b](https://github.com/webdevcom01-cell/agent-studio/commit/3d7df8b5f9d5e4c60d592cec805ceab4373432f4))
* add Zod validation to JSON-RPC boundaries (K-001, K-003, K-004) ([#164](https://github.com/webdevcom01-cell/agent-studio/issues/164)) ([59dadc8](https://github.com/webdevcom01-cell/agent-studio/commit/59dadc82fb6501f73e55cf01525c17b23ff5b7af))
* **api:** resolve org context for API-key callers in requireAuth ([84ab842](https://github.com/webdevcom01-cell/agent-studio/commit/84ab842f2c902f48e849d740c14889b82faf4da9))
* **auth:** allow Google account linking to existing email accounts ([585ff94](https://github.com/webdevcom01-cell/agent-studio/commit/585ff94f28de9e496e8b7eb4227f07747c709578))
* **build:** coerce userMessage undefined to null for prepareContextForExecution ([5f50c87](https://github.com/webdevcom01-cell/agent-studio/commit/5f50c8770e2eb76dbc1e689a22e8b683ed22e3d3))
* **chat:** streaming requests bypass async BullMQ queue ([ed9aaf9](https://github.com/webdevcom01-cell/agent-studio/commit/ed9aaf97db65aa4c5aecbced636b85916dd57561))
* **ci:** cache .next + temporary continue-on-error on E2E + tech-debt update ([#106](https://github.com/webdevcom01-cell/agent-studio/issues/106)) ([8a3a01c](https://github.com/webdevcom01-cell/agent-studio/commit/8a3a01c1de710b4a06a49dcd777bbef66cc587a8))
* **ci:** increase Playwright webServer timeout for CI ([#105](https://github.com/webdevcom01-cell/agent-studio/issues/105)) ([2807c8b](https://github.com/webdevcom01-cell/agent-studio/commit/2807c8b22913fb17f8538a2c8fa8346d5c1a8e86))
* **ci:** remove package-lock.json to fix release-please crash ([#108](https://github.com/webdevcom01-cell/agent-studio/issues/108)) ([7bc73fc](https://github.com/webdevcom01-cell/agent-studio/commit/7bc73fce594ff15c2eec542e6e6fa6d437b16c4a))
* configure pnpm cross-platform native binaries for Cowork sandbox ([4af6419](https://github.com/webdevcom01-cell/agent-studio/commit/4af6419263857b751b88688d12ef79739ced1b54))
* **dashboard:** resolve agent names without nested relation on read c… ([ddbd6e4](https://github.com/webdevcom01-cell/agent-studio/commit/ddbd6e4ca347144c7a38f0a0d1744d4272ba0a47))
* **dashboard:** resolve agent names without nested relation on read client (activity 500 under RLS) ([a9681e6](https://github.com/webdevcom01-cell/agent-studio/commit/a9681e6afa12a695985edf75a70712028bfa8c60))
* **dashboard:** route agent query through withOrgContext (RLS coverage guard) ([8a8cfbb](https://github.com/webdevcom01-cell/agent-studio/commit/8a8cfbb5d02ab1841bb008e5682f1b7c10fa2e80))
* **db:** backfill Agent/Template org indexes on fresh replays ([259de2a](https://github.com/webdevcom01-cell/agent-studio/commit/259de2afbc76090cca3c0afe046d379d97991531))
* **db:** ensure SomaReviewPost.qualityFlags on fresh replays ([fae93e3](https://github.com/webdevcom01-cell/agent-studio/commit/fae93e31d96cd7a5640d4c931513c3f4b50c85cd))
* **db:** ensure SomaReviewPost.qualityFlags on fresh replays ([39d623a](https://github.com/webdevcom01-cell/agent-studio/commit/39d623aa70240fd09e5fd38ae1175f2c4d78ad34))
* **db:** wrap SET LOCAL hnsw.ef_search in $transaction (Phase 0e) ([#99](https://github.com/webdevcom01-cell/agent-studio/issues/99)) ([c4cfd9a](https://github.com/webdevcom01-cell/agent-studio/commit/c4cfd9a6f7c9147e3540bef017536079d2648835))
* **db:** wrap withOrgContext in $transaction so session var survives pool (Phase 0a) ([#97](https://github.com/webdevcom01-cell/agent-studio/issues/97)) ([35140d3](https://github.com/webdevcom01-cell/agent-studio/commit/35140d377b3d48185d9fbba186de167dbec002d0))
* deploy-trigger skips gracefully when VERCEL_TOKEN not set ([c1c7060](https://github.com/webdevcom01-cell/agent-studio/commit/c1c7060e42dc949dbb35fb02a86667266f8a9e28))
* **deploy-trigger:** guard clauses returned nextNodeId "passed" instead of "failed" ([0e6f5d3](https://github.com/webdevcom01-cell/agent-studio/commit/0e6f5d3e03b5c335b8fb9787ac32006f3c101cba))
* **deploy:** replace db:push with prisma migrate deploy in render.yaml ([a0d709f](https://github.com/webdevcom01-cell/agent-studio/commit/a0d709f3929ca6077ec16293626112cc63348808))
* **deps:** patch 5 prod vulnerabilities via pnpm overrides ([e79802c](https://github.com/webdevcom01-cell/agent-studio/commit/e79802c24b0a5c55ad439228d6c5a4fd96459fc4))
* **diagnostics:** harden isKeySet to reject placeholder values ([e50d790](https://github.com/webdevcom01-cell/agent-studio/commit/e50d790f61cbfb534d5d548bb29bafda657a8e63))
* disable async-execution flag by default to fix as_chat_with_agent MCP tool ([4ebf95d](https://github.com/webdevcom01-cell/agent-studio/commit/4ebf95d0f35b5c8ab89e819d06e3073082ed6c3e))
* disable async-execution flag until worker service is deployed ([c1d50cd](https://github.com/webdevcom01-cell/agent-studio/commit/c1d50cd8ee2f8171b53edf51a5425bf94d4ca3a9))
* **docker:** add git to runner stage apk install ([7f2c302](https://github.com/webdevcom01-cell/agent-studio/commit/7f2c30291c0f9f2d1b3ca92a9ceec37c60308e6b))
* **docker:** install vitest globally in runner stage ([74b1e8f](https://github.com/webdevcom01-cell/agent-studio/commit/74b1e8fb33bf8c56ed130f17e59f05eb79fb1e94))
* **e2e:** generate encrypted NextAuth JWE session token for CI ([1c0c0e6](https://github.com/webdevcom01-cell/agent-studio/commit/1c0c0e6aaa078e9fa7764ef4f5be250059f4d89b))
* **e2e:** generate encrypted NextAuth JWE session token for CI ([dc58c96](https://github.com/webdevcom01-cell/agent-studio/commit/dc58c96ee65918f3554ec20a9a7bda18381fd617))
* **e2e:** update stale agent-card link selector to /builder/i ([de6ec41](https://github.com/webdevcom01-cell/agent-studio/commit/de6ec41369626862a4b74bbff4bd32c2dd592054))
* **ecc:** P0 fixes — eccEnabled toggle, HITL gate, instincts endpoint, ECC dashboard + test suite cleanup ([913692f](https://github.com/webdevcom01-cell/agent-studio/commit/913692f9058a6ebb2a107a7a21aa1d78b5a64c23))
* **ecc:** switch EXTRACT_MODEL from claude-haiku to gpt-4.1-mini ([6e01a0e](https://github.com/webdevcom01-cell/agent-studio/commit/6e01a0ebe549d00c74dcdc96dca8ef6fd6881e89))
* **feedback-loop:** add externalSignal param + AbortSignal.any (Prompt 3A) ([5cbc51f](https://github.com/webdevcom01-cell/agent-studio/commit/5cbc51fdc8ef811e8ed4bde8998bacc1d66f7be2))
* **fix-log:** close P0-2 and P1-5, escalate P2-11 priority ([4ae1456](https://github.com/webdevcom01-cell/agent-studio/commit/4ae1456ea3c46849fd7eaff1c2403313ff2e0ff5))
* generate review_batch_id server-side to prevent CR agent timestamp hallucination ([b0679d5](https://github.com/webdevcom01-cell/agent-studio/commit/b0679d55a73c6caa592419228d4cea850c2377f1))
* **git-node:** bootstrap git repo in /tmp/sdlc before operations ([e34193e](https://github.com/webdevcom01-cell/agent-studio/commit/e34193e54cff27ab025700f1ca2b88e27825fe6b))
* **git-node:** configure identity + HTTPS auth for Railway ephemeral env ([2ecd040](https://github.com/webdevcom01-cell/agent-studio/commit/2ecd040bd2bb72b6863508c07c63241cf1c7b8c8))
* **git-node:** correct logger.error signature — root cause of [object Object] ([3c48f52](https://github.com/webdevcom01-cell/agent-studio/commit/3c48f523d98a0dca32a9567e3eb39f464b26e0dd))
* **git-node:** rename log fields to avoid logger token-key redaction ([b4b6c8b](https://github.com/webdevcom01-cell/agent-studio/commit/b4b6c8b06269376de4d54d63a9d4e10c6e7993b4))
* **git-node:** sanitize branch name to strip spaces and invalid chars ([7562f91](https://github.com/webdevcom01-cell/agent-studio/commit/7562f91e50978674ce7411fcf743c751c311995e))
* **git-node:** startup credentials guard + clear error serialization ([2658f13](https://github.com/webdevcom01-cell/agent-studio/commit/2658f133e3ee1ccdfcbecd9224281ba7f349e2c0))
* **git-node:** use || instead of ?? for GIT_REPO fallback in push case ([43b21b0](https://github.com/webdevcom01-cell/agent-studio/commit/43b21b02f0ad890fe81417c6107584277cc44886))
* **human-approval:** return sourceHandle 'rejected' for reject and timeout-stop paths ([f7362ce](https://github.com/webdevcom01-cell/agent-studio/commit/f7362ce90d60bffa86fd1dca281108c74c06523a))
* HW A2A payload + CR input validation + banned phrases quality gate ([bfb1117](https://github.com/webdevcom01-cell/agent-studio/commit/bfb1117f87ac3f3d0550297ce9ac3a1e348646df))
* **lint:** replace console.error with logger in error-display and flow-builder (DEBT-05) ([e9d6247](https://github.com/webdevcom01-cell/agent-studio/commit/e9d624743cc2351a223a17f307f53bd984506331))
* **mcp-server:** use 'text' literal type in ToolResult for SDK v1.6.1 compat ([0c2f4ac](https://github.com/webdevcom01-cell/agent-studio/commit/0c2f4ac5d70417482285e21bc53a513b1e3acf45))
* **mcp:** update startup log counts to 45 tools ([c9e6f9f](https://github.com/webdevcom01-cell/agent-studio/commit/c9e6f9f54ea76782cd92443b33563ff7a4da2426))
* **middleware:** allow x-api-key requests through session guard ([5e45b82](https://github.com/webdevcom01-cell/agent-studio/commit/5e45b824e2ac24d031f948132239fec1e58b062f))
* move phases useMemo before early returns (React error [#310](https://github.com/webdevcom01-cell/agent-studio/issues/310)) ([2debc44](https://github.com/webdevcom01-cell/agent-studio/commit/2debc441d38790e6cc243738f6ea474b89194168))
* **phase12:** gate BLOCK retry + UI + performance ([5897447](https://github.com/webdevcom01-cell/agent-studio/commit/58974471cd7c546d6ec9cfa00747a08f206b2a7e))
* **process-runner:** add node to allowed command prefixes ([4fe6219](https://github.com/webdevcom01-cell/agent-studio/commit/4fe6219ca87a85ed89681d5bccfb94e3092c212d))
* rename GIT_TOKEN to GITHUB_PAT ([788b467](https://github.com/webdevcom01-cell/agent-studio/commit/788b467fad10a63edeec693569515dd07d5a9139))
* replace hardcoded deepseek-chat with gpt-4.1-mini across codebase ([01e0811](https://github.com/webdevcom01-cell/agent-studio/commit/01e0811a8f0f6cf0fc7497c63c3ebb6da2e6a464))
* **rls-rollout:** correct RLS-state query in audit.sh inventory ([140f02a](https://github.com/webdevcom01-cell/agent-studio/commit/140f02a3fc4e5f6e73ff696f950cc230562ccb60))
* **rls-rollout:** derive TENANT_INDIRECT policies from tenantPath ([f88cc2e](https://github.com/webdevcom01-cell/agent-studio/commit/f88cc2e99e2bc90ed06276e722d7f63a9cd0257b))
* **rls-rollout:** draft skips done tables + stages outside prisma/migrations ([6e06bd3](https://github.com/webdevcom01-cell/agent-studio/commit/6e06bd3f2ea345e8da72dc92934f4427053f8d12))
* **rls-rollout:** make policy templates idempotent ([6f0bc4c](https://github.com/webdevcom01-cell/agent-studio/commit/6f0bc4c86801c81806ca3f48026d0ecd20155978))
* **rls-rollout:** repair generate-migration.ts for v1.1.0 inventory ([51614be](https://github.com/webdevcom01-cell/agent-studio/commit/51614bebe70d7544c4f6d15bb50686e4fc2cc90c))
* **rls:** close coverage gaps before enforcement — public agent cross-org SELECT + Template RLS + tests ([14551a0](https://github.com/webdevcom01-cell/agent-studio/commit/14551a04ca1800f54ec73caf2d8ef41b5a963c28))
* **rls:** close coverage gaps before enforcement — public agent cross-org SELECT + Template RLS + tests ([bdc3f66](https://github.com/webdevcom01-cell/agent-studio/commit/bdc3f6661eec4316403808735870e15491b7c386))
* **rls:** complete tenant-context coverage (batches B/C/D) ([1490774](https://github.com/webdevcom01-cell/agent-studio/commit/14907746bc99eeef9d31e7d31a537f250cd6df69))
* **rls:** complete tenant-context coverage + CI guard ([2519a1e](https://github.com/webdevcom01-cell/agent-studio/commit/2519a1e49929c470cd5be2e579dd2caac0fd9a2c))
* **rls:** ensure agent create paths set org + are RLS-wrapped ([71a28c0](https://github.com/webdevcom01-cell/agent-studio/commit/71a28c005c4f96985d8bc01010bb2b8b8a5ca893))
* **rls:** harden agent create paths (org always set, RLS-wrapped) ([01ab5ab](https://github.com/webdevcom01-cell/agent-studio/commit/01ab5ab949f7bcd5c993ee4ec6f807aa32a8e7c8))
* **rls:** parse RLS_ENFORCEMENT_ENABLED case-insensitively ([27c10fe](https://github.com/webdevcom01-cell/agent-studio/commit/27c10fe08b3197577714ea747b12625b2d83b329))
* **rls:** parse RLS_ENFORCEMENT_ENABLED case-insensitively ([9193857](https://github.com/webdevcom01-cell/agent-studio/commit/9193857c2488279d4858b27b33bc5b3b75459fd2))
* **rls:** Phase 0a.5 — HAL-8 NULL exploit hotfix ([#107](https://github.com/webdevcom01-cell/agent-studio/issues/107)) ([e9fd740](https://github.com/webdevcom01-cell/agent-studio/commit/e9fd74065ebca1463e6265c5d7b43995dbea4c50))
* **rls:** reclassify ApiKey/MCPServer/GoogleOAuthToken as GLOBAL/BYPASSRLS ([65f15aa](https://github.com/webdevcom01-cell/agent-studio/commit/65f15aa3607cae98d2e70acb5190b01d86f717d1))
* **rls:** reclassify ApiKey/MCPServer/GoogleOAuthToken as GLOBAL/BYPASSRLS ([4c65e0e](https://github.com/webdevcom01-cell/agent-studio/commit/4c65e0ec3c141f2c3620a1a36b40437ba9894ea5))
* **rls:** resolve currentOrgId via SECURITY DEFINER user_primary_org() ([a86df88](https://github.com/webdevcom01-cell/agent-studio/commit/a86df88b5ad0dd8aee7f6bfdb299b0742805316e))
* **rls:** resolve currentOrgId via SECURITY DEFINER user_primary_org() ([ce19ccc](https://github.com/webdevcom01-cell/agent-studio/commit/ce19ccc7b4b9f65cdefc4a480cd586789a3ac5d3))
* **rls:** wrap evals routes + lib in tenant context (batch A) ([69dc99c](https://github.com/webdevcom01-cell/agent-studio/commit/69dc99c3c90ae80aba777cb430414a2e52e327d1))
* **runtime:** loadContext loads 50 most recent messages, not oldest ([66f7ee4](https://github.com/webdevcom01-cell/agent-studio/commit/66f7ee4e9d58e5f6da81945e88c08f665ba0c0d3))
* **runtime:** loadContext loads 50 most recent messages, not oldest ([7a9c087](https://github.com/webdevcom01-cell/agent-studio/commit/7a9c0871dea592e130a7415b468c416da096e929))
* **runtime:** prevent command+args doubling in process-runner-handler ([46a03f5](https://github.com/webdevcom01-cell/agent-studio/commit/46a03f5482c1f84cec97e712913587f59ff9c8cb))
* **runtime:** resolve template vars in file-writer targetDir ([#54](https://github.com/webdevcom01-cell/agent-studio/issues/54)) ([1295a54](https://github.com/webdevcom01-cell/agent-studio/commit/1295a54eecaa8abaeb79e9945924cf08a353188f))
* **runtime:** resolve template vars in git-node-handler workingDir ([4de2602](https://github.com/webdevcom01-cell/agent-studio/commit/4de2602424de1f0424043ea090be49dc74694eb6))
* **runtime:** resolve template vars in git-node-handler workingDir ([#56](https://github.com/webdevcom01-cell/agent-studio/issues/56)) ([e35a42d](https://github.com/webdevcom01-cell/agent-studio/commit/e35a42d9d590e110e6da4d77ca0c722f80068bf7))
* **runtime:** surface real file-writer error in logs and UI ([#55](https://github.com/webdevcom01-cell/agent-studio/issues/55)) ([7ab5821](https://github.com/webdevcom01-cell/agent-studio/commit/7ab58212b394963d297550616f6782bf900ee429))
* **runtime:** vitest source-file guard in process-runner-handler ([33bbebf](https://github.com/webdevcom01-cell/agent-studio/commit/33bbebf8d5cd21d79ff94c0661c53b37f37d7b70))
* **runtime:** vitest source-file guard in process-runner-handler ([645db92](https://github.com/webdevcom01-cell/agent-studio/commit/645db92cdf9fbe831b1a0f3afa6bdaa9177d0fb3))
* **scripts:** link all user agents to GitMCP vault ([32d0385](https://github.com/webdevcom01-cell/agent-studio/commit/32d038583c90762aca0d2fda76ead3d46dbbec9d))
* **scripts:** load .env.local in setup-gitmcp ([046498f](https://github.com/webdevcom01-cell/agent-studio/commit/046498fe7b6c8d3691aa14517e0c515722a1d784))
* **scripts:** use generated prisma client path in migration script ([c5c6740](https://github.com/webdevcom01-cell/agent-studio/commit/c5c6740153959bbfb4450f73f4a58a61e0a921d8))
* **sdlc:** 7 forensic fixes — sandbox_verify conflict, timeout, stale impl, collectFiles cap, Error: false positive, stack trace noise, dead variable ([b74a252](https://github.com/webdevcom01-cell/agent-studio/commit/b74a2526b294394cd45c9c99e593cca9dff88404))
* **sdlc:** add missing diagnostic logs for zero-files implementation steps ([cadaba4](https://github.com/webdevcom01-cell/agent-studio/commit/cadaba43624c9eee5b4b564e290513181e004bd7))
* **sdlc:** add slug+runId to CodeGenOutputSchema, fix 7 pipeline issues, sync tests ([fc38d1a](https://github.com/webdevcom01-cell/agent-studio/commit/fc38d1adc827c0426185d5abdafc1d5252adf19b))
* **sdlc:** add workspace diagnostic logging to git-integration ([adb37fe](https://github.com/webdevcom01-cell/agent-studio/commit/adb37feb60a9bec7ef05616ac8128588aa35e956))
* **sdlc:** always use phase priority for implementation steps (gpt-4o-mini lacks structured output) ([15617c3](https://github.com/webdevcom01-cell/agent-studio/commit/15617c3ae10ff5555cf127e50d1cabae85b1923e))
* **sdlc:** block path traversal and absolute paths in patch-applier (S3/C8) ([932209a](https://github.com/webdevcom01-cell/agent-studio/commit/932209a4b3c0b13645bfad59cd2c83575d68d97e))
* **sdlc:** catch runtime errors in feedback loop + enforce vitest imports in codegen ([4a1a311](https://github.com/webdevcom01-cell/agent-studio/commit/4a1a3110355ba145e3b09a620a71ad02577791b3))
* **sdlc:** corporate-level pipeline hardening — mandatory test enforcement ([3ee6afa](https://github.com/webdevcom01-cell/agent-studio/commit/3ee6afa98e64165330fe41a3584c970182b1921e))
* **sdlc:** disable OpenAI strict-mode schema for generateObject ([bdce830](https://github.com/webdevcom01-cell/agent-studio/commit/bdce8306d2d430539cb7a05aa66a761fc6bbf153))
* **sdlc:** extend PATH in runVerificationCommands so vitest resolves on Railway ([c99deb3](https://github.com/webdevcom01-cell/agent-studio/commit/c99deb37f80fedcec5f677310b305425cbdd99ea))
* **sdlc:** fail implementation step when zero files generated ([6272a82](https://github.com/webdevcom01-cell/agent-studio/commit/6272a826e165441665708e9d196c75213eef670e))
* **sdlc:** fix contextParts off-by-one when priorMemory present (C2+D4) ([0b8e53d](https://github.com/webdevcom01-cell/agent-studio/commit/0b8e53d87cc3657e4384d5d5d167dd0d3988b800))
* **sdlc:** increase maxOutputTokens to prevent code gen truncation ([a0dabc6](https://github.com/webdevcom01-cell/agent-studio/commit/a0dabc60b8be05be7591ddea50559b8f6fff1e55))
* **sdlc:** log model fallback and escalation events in model router ([c553185](https://github.com/webdevcom01-cell/agent-studio/commit/c55318533b6ef2a6fec532acaaa27c3593c09ebb))
* **sdlc:** move vitest to dependencies so it survives Railway prod prune ([45440db](https://github.com/webdevcom01-cell/agent-studio/commit/45440db25659be30a09ffe08764368d546c2824d))
* **sdlc:** pr_generation output shows clear status instead of 'undefined' ([6b07ed6](https://github.com/webdevcom01-cell/agent-studio/commit/6b07ed62e981a238bd006102788ba36630d15283))
* **sdlc:** preserve workspace on pipeline failure for post-mortem inspection ([514428e](https://github.com/webdevcom01-cell/agent-studio/commit/514428e65f563d9b786da52a273c50e0470f297a))
* **sdlc:** prevent false positive didTestsFail on vitest '0 failed' summary (C1) ([22955aa](https://github.com/webdevcom01-cell/agent-studio/commit/22955aafa341ccb75c3633694f39aba6539cc484))
* **sdlc:** redact GitHub PAT from git error messages before logging (S1) ([a6698e2](https://github.com/webdevcom01-cell/agent-studio/commit/a6698e265df88f76850ef795abb9870306c805b7))
* **sdlc:** schema + typecheck fixes for generateObject ([7e150e3](https://github.com/webdevcom01-cell/agent-studio/commit/7e150e34cadd366bac23b0a190d9b93e6a1701a6))
* **sdlc:** surface git integration errors in pipeline result and UI ([c368d60](https://github.com/webdevcom01-cell/agent-studio/commit/c368d60c1e29d22c65fe5352f5097a8ac54e53c0))
* **sdlc:** switch pipeline-memory extraction from deepseek-chat to gpt-4o-mini ([8601864](https://github.com/webdevcom01-cell/agent-studio/commit/8601864f16973938ec2599e3b975a3eec19c4b2b))
* **sdlc:** use gpt-4.1 first for implementation steps (supports generateObject) ([0fcd271](https://github.com/webdevcom01-cell/agent-studio/commit/0fcd27126e52d0a04f8beb343987c62cc976a198))
* **security:** address 20/21 Dependabot alerts — website overrides, mcp-server ip-address, deal-flow-agent pip, dependabot config ([6af5585](https://github.com/webdevcom01-cell/agent-studio/commit/6af55859aa2da7fe59cc6448883f650414923f81))
* **security:** block SSRF in eval runner via baseUrl allowlist ([#169](https://github.com/webdevcom01-cell/agent-studio/issues/169)) ([defca44](https://github.com/webdevcom01-cell/agent-studio/commit/defca4434c509385b95bd1a6d7343ca140a454eb))
* **security:** bump next 15.5.18 + override vulnerable transitive deps ([#144](https://github.com/webdevcom01-cell/agent-studio/issues/144)) ([c0914bf](https://github.com/webdevcom01-cell/agent-studio/commit/c0914bf02ed1c06fa4836b755476c154704fd2c3))
* **security:** escape backslash before sanitizing inputs ([#175](https://github.com/webdevcom01-cell/agent-studio/issues/175)) ([290615c](https://github.com/webdevcom01-cell/agent-studio/commit/290615c64a967bbb27c6cd31cdc21907f0092b5e))
* **security:** remediate mcp-server and website sub-project deps ([#152](https://github.com/webdevcom01-cell/agent-studio/issues/152)) ([d4950da](https://github.com/webdevcom01-cell/agent-studio/commit/d4950da1702579c4f5a141d05783dd05003a8aa5))
* **security:** remove hardcoded DeepSeek API key and Railway DB URL ([650eea7](https://github.com/webdevcom01-cell/agent-studio/commit/650eea7bfac9432e0ff394a319417e183dafa0ca))
* **security:** remove ReDoS-prone quantifier in slug trim ([#177](https://github.com/webdevcom01-cell/agent-studio/issues/177)) ([7142ef7](https://github.com/webdevcom01-cell/agent-studio/commit/7142ef77810b053a95fa9ecae30600b8cbb3e5c2))
* **security:** resolve 3 Phase-0 enterprise blocking issues ([53fa3d0](https://github.com/webdevcom01-cell/agent-studio/commit/53fa3d0ad5342c42152959e6070c1edb6f772718))
* **security:** return error message in RBAC denial response ([a6a47b2](https://github.com/webdevcom01-cell/agent-studio/commit/a6a47b2cd750469fd0a8d15daaea24454eb7800f))
* **security:** use cheerio to strip HTML instead of regex ([#176](https://github.com/webdevcom01-cell/agent-studio/issues/176)) ([a5dc48a](https://github.com/webdevcom01-cell/agent-studio/commit/a5dc48abc9930bd703a397a483e9bb7e3d2ad058))
* **security:** use crypto instead of Math.random for IDs ([#174](https://github.com/webdevcom01-cell/agent-studio/issues/174)) ([ff86acc](https://github.com/webdevcom01-cell/agent-studio/commit/ff86acc32afad326cb60f70f429c31052c0bad6f))
* **security:** validate /authorize query params + redirect_uri allowlist ([#171](https://github.com/webdevcom01-cell/agent-studio/issues/171)) ([19d0487](https://github.com/webdevcom01-cell/agent-studio/commit/19d0487917dd6bdf02e528ba6034087d8294cb48))
* **security:** validate base URL scheme in embed widget ([#178](https://github.com/webdevcom01-cell/agent-studio/issues/178)) ([6425204](https://github.com/webdevcom01-cell/agent-studio/commit/6425204819e29450fd17e4d29ab18e623bd95376))
* **slack:** truncate Block Kit fields to stay within Slack's hard limits ([55219e9](https://github.com/webdevcom01-cell/agent-studio/commit/55219e9bc82b32ea33e07d98dee20d7c5e13fdae))
* **soma:** cr-payload C-2/M-1/M-4 bugs + CR prompt review_batch_id cleanup ([#141](https://github.com/webdevcom01-cell/agent-studio/issues/141)) ([4c199e8](https://github.com/webdevcom01-cell/agent-studio/commit/4c199e8af830507b4c9bb0b221f8bd57fbedee64))
* **soma:** propagate userId into sub-agent context for Review Queue visibility ([1afb0e9](https://github.com/webdevcom01-cell/agent-studio/commit/1afb0e996829b6c481cc20d876be70d3a9cb585a))
* **soma:** remove duplicate SomaReviewBatch creation per CR run ([#142](https://github.com/webdevcom01-cell/agent-studio/issues/142)) ([8d2eecc](https://github.com/webdevcom01-cell/agent-studio/commit/8d2eecc1b99c641551948ea21ee8cf5057d68712))
* **tests:** fix unresolved ../types import in schema-drift-empty-data test ([dddb0ca](https://github.com/webdevcom01-cell/agent-studio/commit/dddb0cac82de0ffb0b65c9ec3472fe7c00c87d55))
* **tests:** orchestrator-model-overrides 3rd-arg assertion for externalSignal ([c462d47](https://github.com/webdevcom01-cell/agent-studio/commit/c462d4773a77063de01ff46f3f7c12feb32a3638))
* **tsconfig:** exclude railway-mcp-server and vitest.rls.config from root typecheck ([2f0e7d9](https://github.com/webdevcom01-cell/agent-studio/commit/2f0e7d948f713f5e5713f4baab85e930c33db6c4))
* **types:** escape shell variable in step5-runbook template literal ([fd836ca](https://github.com/webdevcom01-cell/agent-studio/commit/fd836ca4a601b5598c7dffaf33e5d1079c1318f6))
* **ui:** fix pipelines data shape - use data.runs not data directly ([a915b5d](https://github.com/webdevcom01-cell/agent-studio/commit/a915b5d9a1058e69621c260196e5dc962f7cf9d4))
* **ui:** map off-token colors to semantic tokens across app (+severit… ([7c7e99b](https://github.com/webdevcom01-cell/agent-studio/commit/7c7e99be3f0b7ac459f00ca55fe55736e4534589))
* **ui:** map off-token colors to semantic tokens across app (+severity-high token) ([c5d0e02](https://github.com/webdevcom01-cell/agent-studio/commit/c5d0e02a38edc485382cbefb1d75e368e6e97509))
* **ui:** remove ReactMarkdown and prose classes from pipelines page ([242ad8f](https://github.com/webdevcom01-cell/agent-studio/commit/242ad8fff61974d535004efaf45c3bb0d72867a0))
* **ui:** rewrite pipelines page with stable components ([7980c7c](https://github.com/webdevcom01-cell/agent-studio/commit/7980c7c1b0d2eab67dca22045db1c3e23e768edb))
* **ui:** standardize colors to tokens + add color-token CI guard ([7a95a2e](https://github.com/webdevcom01-cell/agent-studio/commit/7a95a2ef004fa5da4ca030fba66ab30e9e6ba790))
* **ui:** standardize colors to tokens + add color-token CI guard ([cd7c78d](https://github.com/webdevcom01-cell/agent-studio/commit/cd7c78dc786b1a3ab8a271ae5ed6555afad5717f))
* **vault-lint:** don't count canonical type-names as tag sprawl (§3 requires type in tags) ([a9d7068](https://github.com/webdevcom01-cell/agent-studio/commit/a9d70688d96a9227dfb766c7953cbf7e1e38aada))
* **webhooks:** correct pipeline trigger URL + guard + isPipelineTrigger in list ([4c1f059](https://github.com/webdevcom01-cell/agent-studio/commit/4c1f059dd9850a3c06db2a0eb52447d4213417c9))
* **worker:** install git in alpine image for SDLC git integration ([a497f82](https://github.com/webdevcom01-cell/agent-studio/commit/a497f821e7247ab7f1c07577abfd21860be7751e))
* **worker:** install git in Docker image for SDLC git integration ([e75140e](https://github.com/webdevcom01-cell/agent-studio/commit/e75140e825f8f96feddc0977bd8a94165628eb1f))


### Performance Improvements

* **sdlc:** add SHA-256 hash-based cache to indexCodebase to skip unchanged files (P1) ([bbb37b1](https://github.com/webdevcom01-cell/agent-studio/commit/bbb37b1630191da3e7ec9af4783148f144c762cf))

## [Unreleased]

### Documentation (2026-06-27)
- **DOC-FIX** — Corrected stale counts repo-wide: node types 55 → **66**, Prisma models 36 → **63**, API routes → **170**, UI components → **123** (`README.md`, `FEATURES.md`). Source of truth: `src/types/index.ts` `NodeType` union and `prisma/schema.prisma`.
- **DOC-FIX** — `docs/10-node-reference.md`: documented the 5 previously-missing nodes (`claude_agent_sdk`, `deploy_trigger`, `file_writer`, `git_node`, `process_runner`); now covers all 66.
- **DOC-FIX** — `FEATURES.md`: added the 11 missing node rows and 27 missing model rows so tables match the headline counts.
- **DOC-FIX** — `AGENTS.md`: repaired 9 broken links (`.Codex/docs/*` → `.claude/docs/*`).
- **DOC-FIX** — `.gitignore`: fixed `docs/forensic/` → `docs/forensics/` typo; ignored eval-workspace fixtures and root `.skill` bundles.

### Added (2026-04-28)
- **SEC-05** — AuditLog wired for admin actions: `org.member.remove`, `org.member.add`, `org.invite.send`, `org.approval.respond` across 4 API routes. Fire-and-forget typed wrappers.
- **AGENT-01** — 16 "Need Improvement" agents upgraded in 4 batches: JSON output schemas, escalation protocols, SLA thresholds, scope boundaries, before/after formats.
- **AGENT-02** — 11 "Critical Gaps" resolved: 5 deleted (PR Gate Pipeline, Security Audit Pipeline, Eval Test FAQ, Visual Storyteller, Web Browser Test), 3 already rewritten (Bug Detection 17K, Test Engineering 17K, TDD Workflow 15K), 3 confirmed with `<role>` tags.
- **AGENT-04** — Swarm Security Analyst 67→70/70: added `<failure_modes>` (4 edge cases), `<llm_security>` (OWASP LLM Top 10 2025), `<github_integration>` (priority files + per-file risk scoring).
- **AGENT-05** — SDLC pipeline all 7 agents confirmed complete in DB.
- **AGENT-03** — `project_context` and `sandbox_verify` node types: 21/21 tests green.

### Fixed (2026-04-28)
- **DEBT-06** — Knip: removed 10 unused exports across 8 files (-17 lines). Commit 1d245a2.
- **SEC-06** — OAuth token encryption OAUTH_ENCRYPTION_KEY active, plaintext_count=0.
- **DEBT-05** — 2x `console.error` replaced with `logger.error`, ESLint suppressions removed.


### Added
- **SDLC Phase 1-6 pipeline improvements** — `project_context` node (load CLAUDE.md + rules files), `sandbox_verify` node (TypeScript + ESLint + forbidden-pattern checks), escalating retry (`enableEscalation` injects PR Gate fixes + sandbox errors + code examples on each attempt), typed output schemas (`CodeGenOutput`, `PRGateOutput`, `ArchitectureOutput` via Zod registry in `src/lib/sdlc/schemas.ts`), MCP enforcement layer (native JSON Schema + named Zod validation on `mcp_tool` and `call_agent` nodes)
- **`sdlc-full-pipeline` starter flow** — reference implementation: Discovery → parallel(Architecture + Security + TDD) → Code Gen → sandbox_verify → parallel PR Gate → CI/CD Generator → Deploy Decision
- **A2A Agent Cards v0.3** — `GET /api/a2a/[agentId]/agent-card` (JSON-LD), `GET /.well-known/agent-cards` discovery index; both public endpoints added to middleware matcher
- **Optimistic locking on flow saves** (restored) — GET returns `lockVersion` via `$queryRaw`, PUT checks `clientLockVersion` inside transaction, increments via `$executeRaw`, returns 409 with `serverLockVersion` on conflict
- **Session events + renderer/sink notification system** (Phase E) — `session-events.ts` pub/sub for flow execution lifecycle hooks
- **`ecc-tdd-pipeline` and `ecc-code-review-pipeline` updated** — both now start with `project_context`, use typed schemas, and route through `sandbox_verify` + escalating retry

### Changed
- Node count: 55 → 61 (added `project_context`, `sandbox_verify`, `ast_transform`, `lsp_query`, plus earlier additions)
- Test suite: 2880 → 3211 tests across 244 test files

---

## [0.6.0-unreleased-prev]

### Added
- **Multi-tenancy** — Organization, OrganizationMember, Invitation models with OWNER/ADMIN/MEMBER roles
- **GDPR compliance** — account deletion (30-day grace), data export, configurable retention policies (`src/lib/gdpr/`)
- **Safety middleware** — prompt injection detection, PII redaction, content moderation on all AI calls (`src/lib/safety/`)
- **Feature flags** — 3-layer evaluation (org override > Redis > default), percentage-based rollout (`src/lib/feature-flags/`)
- **BullMQ queue integration** (5.10) — KB ingest, eval runs, and webhook retries enqueue via BullMQ with graceful in-process fallback
- **Webhook retry engine** — exponential backoff (1min → 5min → 30min), circuit breaker, dead letter queue (`src/lib/webhooks/retry.ts`)
- **Admin dashboard** — `/admin` with tabs: overview metrics, job queue monitoring, top users; auto-refresh via SWR
- **k6 load tests** (5.12) — `load-tests/agent-studio.js` with 3 scenarios and SLO thresholds
- **OpenAPI securitySchemes** (5.13) — `BearerAuth` and `CookieAuth` added to spec
- **CHANGELOG.md** (5.14) — this file; `pnpm changelog` script for future updates
- **Vitest v8 coverage** (5.5) — `pnpm test:coverage` with 30% baseline thresholds
- **Embed widget error boundary** (5.8) — `src/app/embed/[agentId]/error.tsx` without Dashboard link (iframe-safe)
- **Redis null-path tests** (5.6) — 7 additional unit tests verifying graceful degradation when Redis is unavailable
- **18 new flow node types** (Sprints 1–6) — structured_output, cache, embeddings, retry, ab_test, semantic_router, cost_monitor, aggregate, web_search, multimodal_input, image_generation, speech_audio, database_query, file_operations, mcp_task_runner, guardrails, code_interpreter, trajectory_evaluator
- **DevSecOps pipeline fixes** (P-01 through P-16) — parallel node validation, template engine JSON fallback, engine double-execution prevention, call-agent retry with exponential backoff
- **IMPROVEMENT-PLAN-2026 completed** (10/11 tasks, plan retired) — live pipeline progress UI (`pipeline-progress.tsx`), `Conversation.status=ABANDONED` on client disconnect, structured sub-agent error messages, parallel sub-agent execution (swarm + ECC orchestrator templates), incremental partial-results persistence via atomic `jsonb_set` into `Conversation.variables.__partial_results`, AbortSignal propagation through `agent-tools.ts` for Stop button cancel, `conversationId` on `AgentCallLog` with composite indexes, per-agent timeout profiles (`AGENT_TIMEOUT_PROFILES`), OTel multi-hop tracing with `gen_ai.agent.id`/`gen_ai.agent.name` attributes, MCP Tasks primitive with `pollTaskProgress` and `onProgress` callback. Task 3.1 (Pipeline Resume endpoint + UI) intentionally deferred — no production demand and partial results remain queryable from `Conversation.variables`.

### Changed
- Eval `POST /api/agents/:id/evals/:suiteId/run` returns `202 { queued: true, jobId }` when Redis is available
- 3 KB source API routes use queue-first pattern for ingest
- Auth guards support API key + session cookie dual authentication
- `requireAgentOwner()` now checks organization membership for multi-tenancy
- CSP nonce uses Web Crypto API (`crypto.getRandomValues`) for Edge runtime compatibility

### Fixed
- `schema-drift` test missing `DEFAULT_MODEL` export in AI mock
- `embed/page.tsx` agent fetch error handling with user-friendly inline error state
- Railway deploy CSP failure — replaced `node:crypto` import with Web Crypto API

---

## [0.5.0] — 2026-04-03

### Added
- **Embedding retry with exponential backoff** (5.3) — up to 3 retries, jitter, `embeddingRetries` metric
- **Stuck-source watchdog** (5.1) — cron at `POST /api/cron/cleanup` marks PROCESSING sources stuck > 30 min as FAILED
- **Security audit logging** (5.4) — `auditKBSourceAdd()`, `auditKBSourceDelete()` fire-and-forget calls
- **Optimistic locking on flow saves** (5.7) — `version` field prevents lost-update race conditions; returns 409 on conflict
- **Handler audit** (5.2) — all 55 handlers verified to have graceful try/catch fallbacks

---

## [0.4.0] — 2026-04-02

### Added
- **OpenAPI 3.1 spec + Swagger UI** — `GET /api/openapi.json`, `GET /api/docs` (Swagger UI); 11 tags, 30+ paths
- **Admin dashboard** — `/admin` with SWR-polled stats (agents, jobs, KB sources, queue health)
- **Worker service Railway config** — `services/worker/railway.toml`, Dockerfile worker stage
- **Webhook retry with dead-letter queue** — exponential backoff, idempotency check, BullMQ integration
- **Docker Compose** — multi-service with migrate init container, worker service, ecc-mcp profile
- **CONTRIBUTING.md + GitHub issue/PR templates** — open source community setup
- **Settings UI for API Keys** — `/settings/api-keys` page with create, rename, revoke, copy
- **API Keys backend** — `POST/GET /api/api-keys`, `PATCH/DELETE /api/api-keys/:id`; 11 scopes; `as_live_` prefix (SHA-256 hashed)

### Fixed
- Railway deploy — Dockerfile `runner` stage last, `builder = DOCKERFILE`, `startCommand = node server.js`
- CSP `strict-dynamic` removed (was blocking all JS execution)
- Auth flow fixed via `prisma db push` during build

---

## [0.3.0] — 2026-04-01

### Added
- **ECC integration** (Phases 0–9) — 29 ECC agent templates, 60+ skills, meta-orchestrator, instinct engine, skills MCP service
- **Agent Discovery Marketplace** — `/discover` with faceted search, categories, tags
- **Agent Templates Gallery** — 250 templates across 21 categories (221 general + 29 ECC developer agents)
- **Inbound webhooks** — Standard Webhooks spec, HMAC-SHA256, provider presets (GitHub, Stripe, Slack)
- **Agent Evals framework** — 3-layer (deterministic + semantic + LLM-as-Judge), 12 assertion types, deploy hook
- **CLI Generator** — 6-phase AI pipeline, Python FastMCP + TypeScript Node.js MCP SDK targets
- **Flow versioning** — immutable snapshots, DRAFT → PUBLISHED → ARCHIVED lifecycle, rollback
- **MCP integration** — Streamable HTTP + SSE transports, connection pooling, per-agent tool filtering
- **A2A agent communication** — Google A2A v0.3, circuit breaker, rate limiting, distributed tracing
- **Scheduled flows** — CRON/INTERVAL/MANUAL, IANA timezone support, Railway Cron integration

---

## [0.2.0] — 2026-03-15

### Added
- **Knowledge Base (RAG)** — chunking, OpenAI embeddings, pgvector HNSW indexes, hybrid search (semantic + BM25)
- **Flow editor** — XyFlow-based visual editor, 55 node types, property panel
- **Streaming chat** — NDJSON protocol, `useStreamingChat` hook
- **Human approval workflow** — `human_approval` node, `HumanApprovalRequest` model
- **Agent export/import** — versioned JSON format

---

## [0.1.0] — 2026-02-01

### Added
- Initial release — Next.js 15 app with agent CRUD, basic flow execution, OAuth login (GitHub + Google)
- Prisma + PostgreSQL + pgvector setup
- DeepSeek (default) + OpenAI model routing via Vercel AI SDK

---

*To generate an updated changelog from git history, run:*
```bash
pnpm changelog
```
