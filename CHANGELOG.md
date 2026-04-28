# Changelog

All notable changes to Agent Studio are documented in this file.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## 1.0.0 (2026-04-28)


### Features

* A2A agent cards metadata for SDLC agents (SDLC Korak 5) ([fec112b](https://github.com/webdevcom01-cell/agent-studio/commit/fec112b8bef7d4cd05515c266695f5a8c5ea57d8))
* A2A Agent Cards v0.3 — Phase 5 agent improvement ([f7448d2](https://github.com/webdevcom01-cell/agent-studio/commit/f7448d2b74d044a98c5b256d00b099ee25e8ea65))
* **a2a:** P4-T2 — visited-agents tracking, monitoring API, 33 tests ([a8dfffb](https://github.com/webdevcom01-cell/agent-studio/commit/a8dfffb44dea53175765be388d1aa55d5104ce20))
* **A3:** Persistent Mode for reflexive_loop with build/test verification ([1df9142](https://github.com/webdevcom01-cell/agent-studio/commit/1df91422798538ad6d2f36fdc89e3d9cc3762ff6))
* add .claude/scripts/upgrade_agents.py — bulk agent upgrade to 2026 standards ([81158b3](https://github.com/webdevcom01-cell/agent-studio/commit/81158b3eb6c37d2151aa5faa31f0f57ad4325111))
* add @agent-studio/cli package with init, dev, build commands ([1f50585](https://github.com/webdevcom01-cell/agent-studio/commit/1f505857556cc22949c34382a6fcb1f8973681ed))
* add 3 new flow nodes — semantic_router, cost_monitor, aggregate ([de3f20b](https://github.com/webdevcom01-cell/agent-studio/commit/de3f20bebc4db5ad00d4dc0a8665d813658631c7))
* add 5 new flow nodes — structured_output, cache, embeddings, retry, ab_test ([5480c6b](https://github.com/webdevcom01-cell/agent-studio/commit/5480c6b1e46755cd3b768590b4398b534d753f78))
* add agent-creator and agent-auditor skills (2026 enterprise standards) ([da7d0bf](https://github.com/webdevcom01-cell/agent-studio/commit/da7d0bf62cd5317ea1b577427cd28cf96b5e9634))
* add ArchitectureOutput schema + ECC agent metadata (SDLC Korak 2) ([9c925e8](https://github.com/webdevcom01-cell/agent-studio/commit/9c925e889d7c8ff8a4af36f433e37b89a18e8401))
* add audit logging to org/invite/approval routes (SEC-08) ([9e06875](https://github.com/webdevcom01-cell/agent-studio/commit/9e06875dcce82dcc0f1b3b9c922509db1889c19b))
* add claude_agent_sdk node type with subagents, session resume, MCP tools, and streaming ([d79da1c](https://github.com/webdevcom01-cell/agent-studio/commit/d79da1cc798d593dc99423a513877e18b4cd91af))
* add conversationId to AgentCallLog + auto-update Conversation.status ([48b5e74](https://github.com/webdevcom01-cell/agent-studio/commit/48b5e74f1157d2461ae05882e5ee79b579792cd1))
* add database_query, file_operations, mcp_task_runner nodes (Sprint 5) ([042197b](https://github.com/webdevcom01-cell/agent-studio/commit/042197bf2f3d6d0acdce7da763bd3f1fe729e9fa))
* add Docusaurus docs site with GitHub Pages workflow ([80a3867](https://github.com/webdevcom01-cell/agent-studio/commit/80a386763f598ca14dd29e44d2cc5a5389fff998))
* add guardrails, code_interpreter, trajectory_evaluator (Sprint 6 — FINAL) ([296ab90](https://github.com/webdevcom01-cell/agent-studio/commit/296ab906a7c78769165b9b0786207f358606ae56))
* add human approval + feature branch safety to sdlc-autonomous-pipeline ([ce63068](https://github.com/webdevcom01-cell/agent-studio/commit/ce63068df2947d71c27372fbbe4d3af574827070))
* add image_generation and speech_audio nodes (Sprint 4) ([5005b28](https://github.com/webdevcom01-cell/agent-studio/commit/5005b28e851a2e94962820704105a91bd64a9503))
* add onboarding gate with onboardingCompletedAt field ([79bac09](https://github.com/webdevcom01-cell/agent-studio/commit/79bac09a20cf248cf3e25968686ceb41f17c5880))
* add one-click deploy buttons (Railway + Render) ([58c4ac3](https://github.com/webdevcom01-cell/agent-studio/commit/58c4ac3ee876e8db13219c0c882423645235f024))
* add project_context node — Phase 1 agent improvement ([87bc70d](https://github.com/webdevcom01-cell/agent-studio/commit/87bc70df4cef6a73232700f18290b85a448e3b99))
* add Python Code node with dual execution (browser + server) ([b24b6e6](https://github.com/webdevcom01-cell/agent-studio/commit/b24b6e6c9f76dbad8bd41f0e45df9e9d099ad6c8))
* add remote MCP server exposing agent-studio as Claude Code tool ([9db8812](https://github.com/webdevcom01-cell/agent-studio/commit/9db88124dacac67b630d159b8d855ffed9bce4b0))
* add sandbox_verify node — Phase 2 agent improvement ([a7de96a](https://github.com/webdevcom01-cell/agent-studio/commit/a7de96a2f93c04aebf30ceaa01f395fbede71870))
* add sdlc-autonomous-pipeline starter flow ([cfd83d5](https://github.com/webdevcom01-cell/agent-studio/commit/cfd83d5a4e76c80911522ed10aa13456cdeda137))
* add skill eval definition files for agent-creator and agent-auditor ([c7c73c4](https://github.com/webdevcom01-cell/agent-studio/commit/c7c73c4f4ee45867da088a80947788d5e7c9b86b))
* add web_search and multimodal_input nodes (Sprint 3) ([bfc4b7e](https://github.com/webdevcom01-cell/agent-studio/commit/bfc4b7ef4548395187b1bd6c8023bbd6bf825d3b))
* **agents:** add failure_modes + LLM Top10 + GitHub patterns to Swarm Security Analyst (AGENT-04 67→70) ([fd8a6f0](https://github.com/webdevcom01-cell/agent-studio/commit/fd8a6f0afe30f2a7b7f5da56c286e0172a198526))
* **agents:** add output schemas and escalation paths (AGENT-01 batch 1) ([b7d8891](https://github.com/webdevcom01-cell/agent-studio/commit/b7d889181a9e28c920e2b6052938dd7796a8ba2d))
* **agents:** final schemas for perf/python/prd/reality (AGENT-01 batch 4 complete - all 16 done) ([cc098d4](https://github.com/webdevcom01-cell/agent-studio/commit/cc098d49a2534bee3d2e21c1c2a2f8fd779e88c9))
* **agents:** structured output for deploy/docs/frontend/refactor (AGENT-01 batch 2) ([b16c777](https://github.com/webdevcom01-cell/agent-studio/commit/b16c777a66c0bb7c52d5aaf7738f5a766b52f445))
* **agents:** structured output for deploy/docs/frontend/refactor (AGENT-01 batch 2) ([e409c41](https://github.com/webdevcom01-cell/agent-studio/commit/e409c414ba583b8789b676987cf15a06307700d5))
* **agents:** trade-off schema for architecture agent (AGENT-01 batch 3 complete) ([a88cb08](https://github.com/webdevcom01-cell/agent-studio/commit/a88cb0876516fb7fe143fdb631b2bf891087250f))
* **api:** OpenAPI 3.1 spec + Swagger UI (faza 3.2) ([6602cdd](https://github.com/webdevcom01-cell/agent-studio/commit/6602cdd3c645d921c5f598b61fbbae6df89f6885))
* **audit:** wire org admin events to AuditLog (SEC-05) ([69db316](https://github.com/webdevcom01-cell/agent-studio/commit/69db3160baa25201dfd8b57645566027634d8d38))
* **audit:** wire writeAuditLog for MCP tool RBAC denials in mcp-tool-handler ([8309e80](https://github.com/webdevcom01-cell/agent-studio/commit/8309e80ad73097ba60b242eeff93c8ca06677595))
* **auth:** add email/password authentication ([4c3abc0](https://github.com/webdevcom01-cell/agent-studio/commit/4c3abc0c10f2a4a893700e10499104814f6abfd9))
* Autonomous DevOps Swarm — 4-agent AI security pipeline ([119cc0d](https://github.com/webdevcom01-cell/agent-studio/commit/119cc0dc91767dec51aae8a7f59d80becdd171db))
* Autonomous DevSecOps Pipeline — multi-agent CI/CD security guard (2026) ([ae61d4a](https://github.com/webdevcom01-cell/agent-studio/commit/ae61d4a9b7ab3c2cf40b6c56dd8d754c8325ea6e))
* autonomous SDLC pipeline — 4 new node types for file writing, process execution, git ops, and Vercel deployment ([bc31d91](https://github.com/webdevcom01-cell/agent-studio/commit/bc31d91245d050a7bac4de3faa4041dbb59a087c))
* **B1:** swarm node — dynamic task pool with N concurrent workers ([7aaf200](https://github.com/webdevcom01-cell/agent-studio/commit/7aaf200eb2ea75e1dfb90d3092d3f7bdad36d8d1))
* **B2+B3:** parallel context isolation, MAX_BRANCHES=10, ecomode + tier override fix ([842896c](https://github.com/webdevcom01-cell/agent-studio/commit/842896cf876b7944a433d3bec24b2f0959b5667e))
* **builder:** redesign node picker with categorized search, tooltips, and keyboard navigation ([5922051](https://github.com/webdevcom01-cell/agent-studio/commit/59220517a1995c4b91f2328b2d74430d66733745))
* **C1:** memsearch-style memory layer — hot/cold tiers, markdown export, API routes, UI ([0354883](https://github.com/webdevcom01-cell/agent-studio/commit/0354883a58e288dd443f2c1d00573eee6fdfb3d6))
* **C2+C3:** 3-layer skill composition + bayesian hybrid search fusion ([2d3220a](https://github.com/webdevcom01-cell/agent-studio/commit/2d3220afdc929ed279d403b9ab92736ae820f473))
* cancel propagation to sub-agents on user Stop (Faza 2, Task 2.3) ([01bb52a](https://github.com/webdevcom01-cell/agent-studio/commit/01bb52ab8693e01809327cb24ab1a859bfb4ec4f))
* **cli-generator:** CLI Generator v2 — retry hardening, live preview, auto-fix, MCP test panel, quick-start scripts ([a564862](https://github.com/webdevcom01-cell/agent-studio/commit/a56486224326dfc26374cb787e78d0b5ca90c236))
* **cli-generator:** P3-T3 — exponential backoff retry with 429/500 detection ([da0c9e1](https://github.com/webdevcom01-cell/agent-studio/commit/da0c9e180b4f3e89c6e69d9ddeb825063692d994))
* **cli-generator:** P4-T3 — TypeScript output validation and quality gates ([6c05e36](https://github.com/webdevcom01-cell/agent-studio/commit/6c05e36c54255503ed987c01804d84054dc0c020))
* **debugger:** add FlowTrace schema + type bridge (Phase 5) ([f8211ff](https://github.com/webdevcom01-cell/agent-studio/commit/f8211ff2c6c2f67344bac4ff46c14024db3f753c))
* **debugger:** Phase 5 — Trace Persistence & History ([3a5e99f](https://github.com/webdevcom01-cell/agent-studio/commit/3a5e99f5d6c7098dfde5539fc16a471f76dcf041))
* **debugger:** Phase 6 — Breakpoints & Step-by-Step Execution ([04c03ed](https://github.com/webdevcom01-cell/agent-studio/commit/04c03ed4263c380c7e5a79691c892e8f4a4fbe0c))
* **debugger:** Phase 7 — Variable Watch & Live Edit ([26f895c](https://github.com/webdevcom01-cell/agent-studio/commit/26f895cb12966b3f025053c0e114e15ff1293961))
* **deferred:** A1.9 hook integration test, B3.3 per-task model logging, C3.4 Bayesian benchmark ([800883f](https://github.com/webdevcom01-cell/agent-studio/commit/800883f354944829a51550245b1b2bed769c2236))
* **ecc-p3:** SDK Learn Hook — auto AgentExecution + ECC instinct extraction ([6679589](https://github.com/webdevcom01-cell/agent-studio/commit/6679589807e8ec0c839e6813eb24e8f4175b9754))
* **ecc:** P2-T3 — ECC production activation with health monitoring ([e473e75](https://github.com/webdevcom01-cell/agent-studio/commit/e473e75b07d9b4e004cffe4090c12c4f08a27408))
* **ecc:** P3-T5 — configurable batch size with backpressure for skill vectorization ([e9980e8](https://github.com/webdevcom01-cell/agent-studio/commit/e9980e89a4851de6a8a4288f22b3d1c8a13452b5))
* **ecc:** P4-T1 — instinct evolution with AI clustering and auto-promotion ([c0505ec](https://github.com/webdevcom01-cell/agent-studio/commit/c0505ecbaae53bb9058a34fa838c81719a630c50))
* **ecc:** P4-T4 — Obsidian vault integration via GitHub API ([f129c1d](https://github.com/webdevcom01-cell/agent-studio/commit/f129c1dfffa77a00f8426f3d435c8de49cdfc65b))
* **ecc:** Phase F3 — dynamic skill router with C2.3 fallback ([6d189cf](https://github.com/webdevcom01-cell/agent-studio/commit/6d189cf43fc065c9894d94f0f50841f28f6716f0))
* escalating feedback loop — Phase 4 agent improvement ([4056d0f](https://github.com/webdevcom01-cell/agent-studio/commit/4056d0f7a4c740b0e6199f274997962d4b909c7f))
* **evals:** CSV export, scheduled runs, and A/B comparison ([e249ba6](https://github.com/webdevcom01-cell/agent-studio/commit/e249ba695ca9b28fbc084bbbb5d38ca14076dda3))
* **evals:** timeout+retry in runner, cron timezone support, assertion-level compare breakdown ([61355de](https://github.com/webdevcom01-cell/agent-studio/commit/61355dee89635ffeb687d9924038f1dc75e851fb))
* **F-01:** call_agent built-in retry with exponential backoff and jitter ([3ab629f](https://github.com/webdevcom01-cell/agent-studio/commit/3ab629f246a29e4fcf7c5a77c90f4c1e2fe3218f))
* **F-02:** guardrails per-module action config (block/warn/redact) with safety pipeline ([a364d05](https://github.com/webdevcom01-cell/agent-studio/commit/a364d05b7c5d8f1c6f76816dd4b185898770e3b6))
* **F-03:** cost monitor adaptive mode with automatic model tier downgrade (FinOps 2025) ([5afa7e5](https://github.com/webdevcom01-cell/agent-studio/commit/5afa7e5ce2dc66032c48498c81e1fc7720b879ec))
* **F-06:** engine safety middleware auto-checks all AI calls (EU AI Act 2025) ([a178f58](https://github.com/webdevcom01-cell/agent-studio/commit/a178f58836cc1f13713be4592623f557da0a5a65))
* **F1:** lsp_query node (59th) — Language Server Protocol integration ([41eaec5](https://github.com/webdevcom01-cell/agent-studio/commit/41eaec59a9b4b14b0a2190eb3a6949c93eba01cb))
* **F2:** ast_transform node (58th) — AST-grep structural code search & refactor ([60ca3a2](https://github.com/webdevcom01-cell/agent-studio/commit/60ca3a2ea4685591f7e591c504306876c2c87cb0))
* Faza 2.4–4.1 — webhook retry, worker service, open source prep, admin dashboard ([27e33cd](https://github.com/webdevcom01-cell/agent-studio/commit/27e33cd73e625b8180dc9a3d22d24475d737eb2f))
* incremental DB save per sub-agent completion (Faza 2, Task 2.2) ([1efd88d](https://github.com/webdevcom01-cell/agent-studio/commit/1efd88d1a6aef6288f2369138fe585ec1434c869))
* **infra:** P5-T1 — Redis cluster setup for cache, sessions, MCP pool ([335319e](https://github.com/webdevcom01-cell/agent-studio/commit/335319e7bfa55eeb2f2c91c7864e6c370d3e1290))
* **infra:** P5-T2 — multi-replica deployment with rolling updates ([6838a80](https://github.com/webdevcom01-cell/agent-studio/commit/6838a809c446fd75fe6ed6a73f9cad0846a9a24b))
* **infra:** P5-T3 — CDN-ready Cache-Control headers for static assets ([1a76577](https://github.com/webdevcom01-cell/agent-studio/commit/1a76577529dccb62255fb78797b587eb735f56f5))
* **infra:** P5-T4 — database read replica for analytics and discover ([777a482](https://github.com/webdevcom01-cell/agent-studio/commit/777a4829c09cee0e82408a638aed699a799799f3))
* **kb:** Faza 5 Sesija 1 — embedding retry, stuck-source watchdog, security audit ([4e3a932](https://github.com/webdevcom01-cell/agent-studio/commit/4e3a932ddf3e9e59b9fc80b83e6b187d46a88698))
* **knowledge:** add HNSW vector search indexes + dynamic ef_search tuning ([9f1901c](https://github.com/webdevcom01-cell/agent-studio/commit/9f1901c2e061aabb2668e8b015b0dadf78fb16c5))
* **knowledge:** enterprise RAG pipeline upgrade — 4 sprints, 24 features ([be24bf0](https://github.com/webdevcom01-cell/agent-studio/commit/be24bf08c8631e72790eabb5ecf7e1cc8afb5230))
* **knowledge:** HNSW vector search optimization ([0fe3ad5](https://github.com/webdevcom01-cell/agent-studio/commit/0fe3ad541b3e46d8478bc6e84b7548f8b0e971b3))
* **knowledge:** P3-T4 — auto-enable LLM reranking for short queries ([0e68218](https://github.com/webdevcom01-cell/agent-studio/commit/0e68218a57e1189bcd76c3546cd1171353dcbe3c))
* Linear sidebar, monochrome design system, DM Sans typography ([aa6da79](https://github.com/webdevcom01-cell/agent-studio/commit/aa6da79b49ef1a8a1c145465a20247d54de83b22))
* live pipeline progress + better error messages (Faza 1, Task 1.1 + 1.3) ([5f29083](https://github.com/webdevcom01-cell/agent-studio/commit/5f290833be4ab6f108a1a6f6c01cbb4ec5e652dc))
* **local:** add Ollama local inference support (qwen3:8b) ([6bd6120](https://github.com/webdevcom01-cell/agent-studio/commit/6bd6120f0766f402894c8cb733b30a74cc867187))
* MCP enforcement layer — Phase 6 agent improvement ([98298ba](https://github.com/webdevcom01-cell/agent-studio/commit/98298ba5c39b67f45b7f8096fa8110e042bd7f76))
* **mcp-server:** add as_update_flow tool for structural flow rewiring ([cb6cadc](https://github.com/webdevcom01-cell/agent-studio/commit/cb6cadc855b16cb39ea0783031b7a0b630ffe282))
* **mcp-server:** add OAuth2 endpoints for Claude Connectors compatibility ([302ee0a](https://github.com/webdevcom01-cell/agent-studio/commit/302ee0a894483fc1ebd39563a688f3c4e5d96f3f))
* **mcp-server:** add Railway PostgreSQL MCP server for direct agent/flow access ([80bdf2e](https://github.com/webdevcom01-cell/agent-studio/commit/80bdf2eb42c295e4bb1c21d3417d2959b7c792ee))
* **mcp:** trigger_agent now async via BullMQ — returns taskId immediately ([23407aa](https://github.com/webdevcom01-cell/agent-studio/commit/23407aa5429d5a97789da207b25da8bfe5b3cc32))
* monochrome design system — all pages and builder nodes ([9606065](https://github.com/webdevcom01-cell/agent-studio/commit/96060655d93a3e33e706e4da342d369caf9c4ad8))
* multi-agent orchestration Phase 1 — Plan-and-Execute + Reflexive Loop ([8e14377](https://github.com/webdevcom01-cell/agent-studio/commit/8e14377babaa0b9f8024d48ad780dfdb7ee1f0d0))
* **observability:** add OTEL traces and metrics to SDLC pipeline orchestrator ([7ddaed9](https://github.com/webdevcom01-cell/agent-studio/commit/7ddaed9480d6443c344c1dbd9997105c637a941c))
* **observability:** P3-T1 — wire OpenTelemetry tracing into AI handlers ([dbd78c1](https://github.com/webdevcom01-cell/agent-studio/commit/dbd78c198425d0a87e6eb6b8c34ceab9500c44cf))
* open-source setup — Docker, CI/CD, community files ([a97f220](https://github.com/webdevcom01-cell/agent-studio/commit/a97f220d7120c6eb7dbd61bfa8177fa826ba41ca))
* **P-05:** eval runner supports webhook triggerMode for webhook-triggered flows ([408e419](https://github.com/webdevcom01-cell/agent-studio/commit/408e419145bb28b2a96fb0324339e1983654b4c4))
* **P-07:** eval suite editor shows correct fields per assertion type with helpers ([fd4ca11](https://github.com/webdevcom01-cell/agent-studio/commit/fd4ca1191845d2be065321daa04a3a6e0d36c40f))
* **P-12:** webhook body mapping logs warning on JSONPath miss with strict mode option ([a08fc83](https://github.com/webdevcom01-cell/agent-studio/commit/a08fc8321f31c213c44a771b4041330516286242))
* **P-13:** memory-write supports merge_object, deep_merge, append_array, increment strategies ([7cd1993](https://github.com/webdevcom01-cell/agent-studio/commit/7cd1993bb2a68182ab4b294bc10dc7339e5ad1ed))
* **P4:** Managed Agent Tasks — long-running async execution via BullMQ ([6a667d2](https://github.com/webdevcom01-cell/agent-studio/commit/6a667d22d6f574d389bfed580b595b3fc7f29cb5))
* **P5:** add SDLC pipeline orchestration — schema, manager, API routes, worker, tests ([69bd771](https://github.com/webdevcom01-cell/agent-studio/commit/69bd77160a2d94facf3d2b8946bdce0b4825fa94))
* parallel sub-agent execution via system prompt hint (Faza 2, Task 2.1) ([03d7dcd](https://github.com/webdevcom01-cell/agent-studio/commit/03d7dcd358abe1cba98e90677ac2c30227957c41))
* **parallel-node:** explicit branches[] config, validation, UI editor ([3a53845](https://github.com/webdevcom01-cell/agent-studio/commit/3a53845589dbc5487c1f41df1d430e957d746081))
* **phase-D:** complete Phase D — verification node + cross-provider orchestration ([f03674c](https://github.com/webdevcom01-cell/agent-studio/commit/f03674cf98e0f967327b32e2f44b916dcc36538d))
* **phase-d:** verification node + multi-provider orchestration ([44e2372](https://github.com/webdevcom01-cell/agent-studio/commit/44e237247b93b5d4109eefe98e20a64671fccc6d))
* **phase-E:** session events + renderer/sink notification system ([2e3976c](https://github.com/webdevcom01-cell/agent-studio/commit/2e3976cf9c99dc71e3079aeff0069c957aa680f4))
* pipeline resume — skip already-completed sub-agents on restart (Faza 3, Task 3.1) ([8bd20f3](https://github.com/webdevcom01-cell/agent-studio/commit/8bd20f3a7e2f6a40f08077f7f860aaf2dd5fa326))
* post-deploy verifier with 6 NIST-inspired checks ([97059b5](https://github.com/webdevcom01-cell/agent-studio/commit/97059b5989e61d9d43cf6d08246b4fc010d28d81))
* propagate sub-agent waitForInput through call_agent to parent ([1411bd5](https://github.com/webdevcom01-cell/agent-studio/commit/1411bd57b0c8799c5ded8bad6385bab89a4f0eb4))
* **property-panel:** Phase 1 — condition/learn nodes, ModelSelect consistency, temperature, w-96 ([20b4a6c](https://github.com/webdevcom01-cell/agent-studio/commit/20b4a6ce61e749d06a7312b1b7df9d93d66e49c4))
* **property-panel:** Phase 2 — {{variable}} autocomplete in all template fields ([12c097c](https://github.com/webdevcom01-cell/agent-studio/commit/12c097c4e612b44a2ece8f259932f1c50c1633a8))
* **property-panel:** Phase 3 — conditional field visibility ([563dacd](https://github.com/webdevcom01-cell/agent-studio/commit/563dacd2efb323ac4b863dfc1862dccc7071deaa))
* **property-panel:** Phase 4 — inline field validation + FieldHint ([f90c2db](https://github.com/webdevcom01-cell/agent-studio/commit/f90c2db08f6ec7d1b56af37c6a1c2e282ad9236e))
* **property-panel:** Phase 5 — QoL polish ([9a142d2](https://github.com/webdevcom01-cell/agent-studio/commit/9a142d276e9477610cf1e2c1d299a557ea23c9b8))
* publish agent-studio-cli to npm ([85353b1](https://github.com/webdevcom01-cell/agent-studio/commit/85353b17a11e056acfa36a7b933c6f97e76c87c8))
* **python-node:** matplotlib plots, pip packages, metadata pipeline ([d4465d8](https://github.com/webdevcom01-cell/agent-studio/commit/d4465d866eb4ed53d0b2db472c4c8cf3ddcb5e35))
* **rag:** Faza 0 — RAG injection into AI handlers, multi-turn query reformulation, HNSW index script ([a82c8b8](https://github.com/webdevcom01-cell/agent-studio/commit/a82c8b8d1301bee0ee2b1ca53d8505ec343ec215))
* **rag:** Faza 1 — Contextual Enrichment (Anthropic approach) ([fbf4bdf](https://github.com/webdevcom01-cell/agent-studio/commit/fbf4bdfc7b1218aae6f12870cbbc92797cb74902))
* **rag:** Faza 2 — Bezbednost, robustnost, chunker popravke ([7d4e1c3](https://github.com/webdevcom01-cell/agent-studio/commit/7d4e1c3b94ea119eaf3a45b06ba7beadd62ad4f7))
* **rag:** Faza 3 — agentic retrieval, query routing, grounding check, RAG eval assertions ([ce442b8](https://github.com/webdevcom01-cell/agent-studio/commit/ce442b853ef72f454bd60fe0dbff46d4055ea782))
* **reliability:** Faza 6 — worker shutdown, admin guard, agent-calls tests ([19a9f97](https://github.com/webdevcom01-cell/agent-studio/commit/19a9f97869b9bba89dafb22cfef1cb68fd14b47e))
* render structured AI outputs in chat UI (CodeGen/PRGate/Architecture) ([3dfa870](https://github.com/webdevcom01-cell/agent-studio/commit/3dfa870b8d1c96d389114569362f8fbc687e754d))
* **runtime:** A1 lifecycle hook system + A2.4 onPreCompact event ([d19ef32](https://github.com/webdevcom01-cell/agent-studio/commit/d19ef3226aed35f408c7e08456272999e871cd4d))
* **saas:** Phase 0.1 — ECC Skills MCP numReplicas 1 → 2 ([3c444d2](https://github.com/webdevcom01-cell/agent-studio/commit/3c444d28fccbe5b67358e63d02d26818cd41ca38))
* **saas:** Phase 0.2 — RBAC enforcement in MCP tool handler ([c90ac59](https://github.com/webdevcom01-cell/agent-studio/commit/c90ac59b9ef0ae51e8488b6f466c9fcce75afff9))
* **saas:** Phase 0.3 — AuditLog in flow execution and handler paths ([c3cdf4b](https://github.com/webdevcom01-cell/agent-studio/commit/c3cdf4bde25c29a689e664399e9360d9161a6924))
* **saas:** Phase 0.4 — OTEL warning when endpoint not configured ([795a6e8](https://github.com/webdevcom01-cell/agent-studio/commit/795a6e8154f182944740846af2ae7738f4b0d004))
* **saas:** Phase 1.1 — BullMQ queue infrastructure ([cbc07cf](https://github.com/webdevcom01-cell/agent-studio/commit/cbc07cf3f73e0428e2044eeb873b15d12b566bf6))
* **saas:** Phase 1.2 — Chat API async job-based execution ([fa78de2](https://github.com/webdevcom01-cell/agent-studio/commit/fa78de2f582e1a9926097da0345bf4a483ce7072))
* **saas:** Phase 1.3 — Worker Railway service configuration ([a6d116e](https://github.com/webdevcom01-cell/agent-studio/commit/a6d116ecb6479300c14e575202a58b7e05283915))
* **saas:** Phase 1.4 — Job monitoring dashboard ([c5f0c57](https://github.com/webdevcom01-cell/agent-studio/commit/c5f0c57f8ccdeadd8a9b6ade1601b30effa2c0ea))
* **saas:** Phase 1.5 — Email (Resend) + Error Monitoring (Sentry) ([f103b4c](https://github.com/webdevcom01-cell/agent-studio/commit/f103b4c1d932ffa4b72c52ad2d9d942baf4df25b))
* **saas:** Phase 2 — Multi-tenancy (Organization model + RBAC + Invite flow) ([3d533fe](https://github.com/webdevcom01-cell/agent-studio/commit/3d533fe5b31b56cd7a535b1f7e868da0106b62cb))
* **saas:** Phase 2.5 — GDPR Compliance (deletion, export, retention) ([c903571](https://github.com/webdevcom01-cell/agent-studio/commit/c90357110719920bd4d179ca4841d492bc127539))
* **saas:** Phase 3 — Security Hardening (CSP, sessions, uploads, rate limits) ([7ae4860](https://github.com/webdevcom01-cell/agent-studio/commit/7ae48601c7dee9bc2de4e411d8176339e0f3e182))
* **saas:** Phase 3.5 — Webhook Reliability (retry engine + dead letter queue) ([4ca36fb](https://github.com/webdevcom01-cell/agent-studio/commit/4ca36fbcc5462732fc43d163784e3e7fedf27289))
* **saas:** Phase 4 — Beta Launch Prep (onboarding, admin, landing, security audit) ([e023f4b](https://github.com/webdevcom01-cell/agent-studio/commit/e023f4b8cd2223ebe65ae01e4bf2e0d0d9340c14))
* **saas:** Phase 4.5 — Feature Flags + API Versioning ([6ad7f58](https://github.com/webdevcom01-cell/agent-studio/commit/6ad7f582d1766977b4895c353eeca024dddf9895))
* **scheduler:** P2-T5 — schedule failure notifications with webhook callback ([f8afed1](https://github.com/webdevcom01-cell/agent-studio/commit/f8afed132bf4f96882a46c4cf2d3bfb196464a9f))
* schema-aware routing in meta-orchestrator (SDLC Korak 4) ([a714879](https://github.com/webdevcom01-cell/agent-studio/commit/a714879cff39c1bff60c085144025bb2648e8069))
* **sdk-sessions:** Phase 2 — DB-backed session persistence for claude_agent_sdk node ([ea67c50](https://github.com/webdevcom01-cell/agent-studio/commit/ea67c50ba6c98af9f93e742a40efdc7493c3a345))
* **sdlc:** add 25 SDLC pipeline agents + Phase C/D ([a28b578](https://github.com/webdevcom01-cell/agent-studio/commit/a28b5786bc1d1c566935b00ad15eac17e6b63b36))
* **sdlc:** add 25 SDLC pipeline agents + Phase C/D specialist agents ([649f15a](https://github.com/webdevcom01-cell/agent-studio/commit/649f15addf2985ea8b4606cbdabab9bb252a0950))
* **sdlc:** add gpt-4o-mini to model catalog and set as primary model for all phases ([0544392](https://github.com/webdevcom01-cell/agent-studio/commit/054439202ae680f47bd113c133c8b9dc7f468ee8))
* **sdlc:** E2B cloud sandbox integration for isolated code execution ([46f7f74](https://github.com/webdevcom01-cell/agent-studio/commit/46f7f7447f9f5cd43500dff7bc84b225d91c5b5c))
* **sdlc:** integrate RAG, multi-step planning, and feedback loop (P6) ([432f959](https://github.com/webdevcom01-cell/agent-studio/commit/432f95921d901b9457103051960d007fa6d992c7))
* **sdlc:** P2-P5 — model overrides, phase-aware RAG, AI retry, real-fs integration tests + deploy-trigger fix ([0e6f5d3](https://github.com/webdevcom01-cell/agent-studio/commit/0e6f5d3e03b5c335b8fb9787ac32006f3c101cba))
* **sdlc:** real file writing + compilation + test execution (P7) ([4493187](https://github.com/webdevcom01-cell/agent-studio/commit/4493187acb9f23748a751183767ba0066f07d05a))
* **sdlc:** switch default model from deepseek-chat to gpt-4o-mini ([a72b9af](https://github.com/webdevcom01-cell/agent-studio/commit/a72b9afa7d55420e5547a80ca83eb2b6f217b385))
* **sdlc:** Tier 3 + Tier 4 — real-exec bug fix, observability, adaptive routing & retry escalation ([006cef4](https://github.com/webdevcom01-cell/agent-studio/commit/006cef4d4aa1fc3c4bb63a61562baf426c2059da))
* **sdlc:** Tier 5 — git/PR integration after pipeline completion ([45e5bcb](https://github.com/webdevcom01-cell/agent-studio/commit/45e5bcb14876ef855f1f7759ab9d2e2705591c45))
* **security:** enforce org-level RBAC in mcp-tool-handler ([6a9ab03](https://github.com/webdevcom01-cell/agent-studio/commit/6a9ab03055e5424e7b6ff348842197d0c1469ea5))
* **security:** enterprise hardening — RBAC, API keys, OIDC, circuit breaker, audit log ([4f1de60](https://github.com/webdevcom01-cell/agent-studio/commit/4f1de60fa4721880fbbf6c63f94f5b6148a531cd))
* **security:** P1-T1 — encrypt webhook secrets at rest with AES-256-GCM ([dc3cd74](https://github.com/webdevcom01-cell/agent-studio/commit/dc3cd74357e64acdb43bb3d826a78ae29821c641))
* **security:** P1-T2 — encrypt OAuth tokens at rest with AES-256-GCM ([6ede260](https://github.com/webdevcom01-cell/agent-studio/commit/6ede26072c62acedcb4b46f751bb8402ebe3b34d))
* **security:** P1-T3 — A2A circuit breaker depth limit and cycle detection ([a156b5a](https://github.com/webdevcom01-cell/agent-studio/commit/a156b5a35200081a451bf11ae959cae8af40175c))
* **security:** P1-T4 — Redis-based sliding window rate limiter ([3f6696b](https://github.com/webdevcom01-cell/agent-studio/commit/3f6696bcb49163f064cd5c2d2dcdd3ab3c81d529))
* **sesija-2:** optimistic locking + schema-drift test coverage ([8a70c59](https://github.com/webdevcom01-cell/agent-studio/commit/8a70c591b1d74ee1836d4163d9b9843e749367b2))
* **sesija-3:** embed error state, redis null-path tests, coverage setup ([a17ce7b](https://github.com/webdevcom01-cell/agent-studio/commit/a17ce7b031088851e5837f5e37b2576bc5d888e3))
* **session-5:** ECC human approval gate, OpenAPI security schemes, CHANGELOG ([b0b1b12](https://github.com/webdevcom01-cell/agent-studio/commit/b0b1b121a53de0cdcbc0ec2e92e9367825100696))
* **session-6:** CLI stuck notification, rate-limit headers on all responses ([bc04dd6](https://github.com/webdevcom01-cell/agent-studio/commit/bc04dd69c5380a5b6f6fc559e6857a9fb485a16f))
* smart context compaction before history truncation (A2) ([cfe42f9](https://github.com/webdevcom01-cell/agent-studio/commit/cfe42f94fc15884f032fc235a773360e02c158d6))
* **Task 3.2:** Per-Agent Timeout Profiles for agent-as-tool orchestration ([b675d59](https://github.com/webdevcom01-cell/agent-studio/commit/b675d5959302e1ee0f6a2b556069614cc27385ad))
* **Task 3.3:** OpenTelemetry AAIF 2026 multi-hop agent tracing ([fcb05c4](https://github.com/webdevcom01-cell/agent-studio/commit/fcb05c490aafb350f417c995bb2db78c519c3224))
* **tech-debt:** Phase 3-5 — error boundaries, loading states, unused imports, ESLint ([e87b3ff](https://github.com/webdevcom01-cell/agent-studio/commit/e87b3ff970bb647982b3392936defad0ff50e7e2))
* **tech-debt:** Phase 6 — Knip, warning budget baseline, unused param cleanup ([6064de3](https://github.com/webdevcom01-cell/agent-studio/commit/6064de31bb2b418fe47e5930f8fb9d54c3579b4f))
* **templates:** add 12 Blok A templates — research, writing, data, coding ([beb2e2d](https://github.com/webdevcom01-cell/agent-studio/commit/beb2e2dfc0ae1d090d525bf0b7cc3e53eaca13ee))
* **templates:** add 15 Blok B templates — finance (5), hr (5), sales (5) ([3c997fe](https://github.com/webdevcom01-cell/agent-studio/commit/3c997fe0ae80f1a471ae41decc11cae64c1c4186))
* **templates:** add finance, hr, sales categories ([c098750](https://github.com/webdevcom01-cell/agent-studio/commit/c098750b2a551a54f87504f6998405c45e744069))
* **templates:** add finance/hr/sales labels to template gallery ([082da71](https://github.com/webdevcom01-cell/agent-studio/commit/082da71212c002e9cfc54ad8b12c3ff697a632ea))
* **templates:** Blok C — +26 templates (product×6, research×5, writing×5, data×5, coding×5) ([28c2485](https://github.com/webdevcom01-cell/agent-studio/commit/28c24850542aac5f3a02cdc6e3fc81737af660fb))
* **templates:** Blok D — +15 templates (paid-media×3, project-mgmt×4, spatial×4, support×4) ([c199e4a](https://github.com/webdevcom01-cell/agent-studio/commit/c199e4ae0edd7bf11e26f6d62e3986644c2034ea))
* **templates:** Blok E — +15 templates (finance×5, hr×5, sales×5) ([2a16751](https://github.com/webdevcom01-cell/agent-studio/commit/2a16751fd955616ec5f2cfb1915bb2eac24bcfee))
* **templates:** update header — total 160→216, all 19 categories at Dobro+ standard ([c625a57](https://github.com/webdevcom01-cell/agent-studio/commit/c625a57c87108e58ac6521d6a875783ac12985e0))
* **templates:** update JSON header — total 133→160, add 7 new categories ([b80b8c6](https://github.com/webdevcom01-cell/agent-studio/commit/b80b8c66482d06d10789d4f17e70a26a6cf68ec0))
* typed output schemas — Phase 3 agent improvement ([566afa1](https://github.com/webdevcom01-cell/agent-studio/commit/566afa105a3749401ad585820d4e61da72c692b7))
* **ui:** add SDLC Pipelines page with step metrics and finalOutput viewer ([8b35eb7](https://github.com/webdevcom01-cell/agent-studio/commit/8b35eb7a5138fb43eb22a6f6dc897656df62c34c))
* update agent-auditor skill with Phase 1-6 audit standards (Plan 2) ([6bb3465](https://github.com/webdevcom01-cell/agent-studio/commit/6bb3465cafca81fb41ebcdb49a9444cc2b319e77))
* update agent-creator skill with Phase 1-6 node standards (Plan 1) ([1a40927](https://github.com/webdevcom01-cell/agent-studio/commit/1a40927d34c3bf8c2c16b9e0a7c36d0ade5e0f73))
* update SDLC orchestrator prompt with Phase 1-6 node types (SDLC Korak 3) ([52795d2](https://github.com/webdevcom01-cell/agent-studio/commit/52795d241dd4b21444e5bbbe2ff2c8e28c355b4f))
* update starter flows with Phase 1-6 node types (SDLC Korak 1) ([5d2d3f2](https://github.com/webdevcom01-cell/agent-studio/commit/5d2d3f226333badb94132787b75ec5af754cf6e6))
* v2 SDLC pipeline — async webhook, issue idempotency, RAG KB seed, code review node, PR creation ([a0ce580](https://github.com/webdevcom01-cell/agent-studio/commit/a0ce580fcfe8522e06114687762e2e8dd2a6a197))
* **versioning:** P3-T2 — FlowVersion cleanup job for DB bloat prevention ([e2e3ab3](https://github.com/webdevcom01-cell/agent-studio/commit/e2e3ab37d543ea733b74adec1b3760975fc31144))
* Visual Flow Debugger — Phase 3 (Debug Panel deep inspection) ([765c0c5](https://github.com/webdevcom01-cell/agent-studio/commit/765c0c5db204aa52bba5103e84ece9464ec55be0))
* Visual Flow Debugger — Phase 4 (Execution Timeline) ([7633bea](https://github.com/webdevcom01-cell/agent-studio/commit/7633bea460920f01b1b9b80f901515ad4bdd8844))
* Visual Flow Debugger Phase 1+2 ([4f0e6f7](https://github.com/webdevcom01-cell/agent-studio/commit/4f0e6f7e69ab57ce5ab12f8ebb62a7a012d88b53))
* webhook eval assertions — webhook_response_valid and webhook_payload_echoed ([0cf96ce](https://github.com/webdevcom01-cell/agent-studio/commit/0cf96ce054d05bfe9c7ecebce4faa73925ae258f))
* webhook improvements — JSONPath tester, execution CSV export, replay chain + status filter E2E tests ([dd81939](https://github.com/webdevcom01-cell/agent-studio/commit/dd81939da1109aa66de815162f4131ab4b138ce2))
* **webhooks:** add execution replay — re-trigger webhook with stored payload ([75e628e](https://github.com/webdevcom01-cell/agent-studio/commit/75e628e5906b68089ac05850f5438060a7df6a54))
* **webhooks:** paginated executions, status filters, auto-refresh, and search ([ba39e43](https://github.com/webdevcom01-cell/agent-studio/commit/ba39e430858afb67d7d10233c67f2677bf63c2fc))
* **worker:** add Dockerfile.worker for Railway worker service ([9b9cf51](https://github.com/webdevcom01-cell/agent-studio/commit/9b9cf51a52b418b5eccff7e21a666a5cea10047a))
* **worker:** add railway.worker.toml for BullMQ worker service ([cd93394](https://github.com/webdevcom01-cell/agent-studio/commit/cd9339403dd1f7055c45db5d58442fab28b61d99))


### Bug Fixes

* Fix:  ([932209a](https://github.com/webdevcom01-cell/agent-studio/commit/932209a4b3c0b13645bfad59cd2c83575d68d97e))
* accept GITHUB_TOKEN env var (in addition to GITHUB_PAT) for git integration ([ab4a9ff](https://github.com/webdevcom01-cell/agent-studio/commit/ab4a9ff4f965439b3cdde1a4fa3127f9891c861d))
* add /evals redirect to /evals/standards ([b01d080](https://github.com/webdevcom01-cell/agent-studio/commit/b01d080fb6de72664751111e6d948dfbe91ae502))
* add BotMessageSquare to lucide mock, update node counts for claude_agent_sdk node ([e9f15e4](https://github.com/webdevcom01-cell/agent-studio/commit/e9f15e478db5dfd8355c88d16f23dd9f943aab70))
* add compositionLayer migration + settings/profile page ([0157553](https://github.com/webdevcom01-cell/agent-studio/commit/0157553c3a194d56608cb47546e48471f13b2302))
* add lockVersion to Flow schema and make route resilient ([a4e9e77](https://github.com/webdevcom01-cell/agent-studio/commit/a4e9e7708516e2584acf93f43f4321fdb7fa769e))
* add missing columns migration — fusionStrategy + User soft-delete ([8d2c9ae](https://github.com/webdevcom01-cell/agent-studio/commit/8d2c9aea534c2c13c38caf16a5dbb13a97702d6a))
* add packages field to pnpm-workspace.yaml for Railway build ([df6689e](https://github.com/webdevcom01-cell/agent-studio/commit/df6689ea7a054ddd43f35ecd3657beda2401f55a))
* **ai-handler:** surface errors in catch block + write to outputVariable ([c66df16](https://github.com/webdevcom01-cell/agent-studio/commit/c66df16bd4633c977d3cd6a175fa9c3df66a4276))
* **ai-response:** add try/catch fallback on generateObject failure ([2c7f117](https://github.com/webdevcom01-cell/agent-studio/commit/2c7f117a38c7995eb62d4e76cc374c69ce90fe95))
* **ai-response:** use json_object mode + larger token budget for generateObject ([2fd7a4a](https://github.com/webdevcom01-cell/agent-studio/commit/2fd7a4a716768a696c3bbd15f5c0d1eea08f9f0d))
* **ai-response:** use strictJsonSchema:false for OpenAI generateObject compatibility ([c49eec3](https://github.com/webdevcom01-cell/agent-studio/commit/c49eec3cdc1fe093a5712a894a92538f1de496ab))
* **auth:** allow Google account linking to existing email accounts ([585ff94](https://github.com/webdevcom01-cell/agent-studio/commit/585ff94f28de9e496e8b7eb4227f07747c709578))
* **auth:** explicit secret + revert prisma db push from buildCommand ([a8627f4](https://github.com/webdevcom01-cell/agent-studio/commit/a8627f4bfcef948781de9f12dfdfda118082d3a8))
* **auth:** P2-T2 — NextAuth stabilization with cookie pinning and fallback detection ([b0af9ff](https://github.com/webdevcom01-cell/agent-studio/commit/b0af9ff5b3143199868fc0e717a4f75515aa1a60))
* **auth:** remove custom logger that broke TS build ([39eedc8](https://github.com/webdevcom01-cell/agent-studio/commit/39eedc81189588073e52e720ed40fb212651eb01))
* **auth:** set GitHub OAuth issuer to fix RFC 9207 iss mismatch ([a115882](https://github.com/webdevcom01-cell/agent-studio/commit/a115882eb12e83d592f46efd7bb6f6af6c710bfd))
* **auth:** strip GitHub iss param at route level to bypass RFC 9207 mismatch ([bf2874b](https://github.com/webdevcom01-cell/agent-studio/commit/bf2874b2ff411a616704575ee92f5dd633a1f7c6))
* **build:** add @ast-grep/napi to serverExternalPackages ([74c4d50](https://github.com/webdevcom01-cell/agent-studio/commit/74c4d508af3510b636488b5fda9db8a1c9a02c17))
* **build:** add missing popover, property-section, and variable-input components ([1e8dafd](https://github.com/webdevcom01-cell/agent-studio/commit/1e8dafd54b39ffed1c37210511b7fad359c35492))
* **build:** create .git marker in build script for Tailwind v4 ([1855775](https://github.com/webdevcom01-cell/agent-studio/commit/1855775d4bec274240f18e548b42e1cf478b5cce))
* **build:** create minimal .git/HEAD for Tailwind v4 Oxide scanner ([7200484](https://github.com/webdevcom01-cell/agent-studio/commit/7200484dec3ad0bd91b9d14658b7328c00af7723))
* **build:** exclude mcp-server from root tsconfig to fix Next.js build ([dc303e5](https://github.com/webdevcom01-cell/agent-studio/commit/dc303e53db07b365b94a92d0531626aef310231e))
* **build:** explicitly add ioredis via pnpm add in buildCommand ([462e035](https://github.com/webdevcom01-cell/agent-studio/commit/462e03570df8fb2558345ede456e3c03d0beceed))
* **build:** include all workspace files in commit — resolve schemas.ts missing exports ([dea9838](https://github.com/webdevcom01-cell/agent-studio/commit/dea9838ac2008196ce9229268e018e6d8977a7c1))
* **build:** override nixpacks install phase to allow lockfile updates ([3e66e80](https://github.com/webdevcom01-cell/agent-studio/commit/3e66e8057a268a1d988fc193f0a6f5ef794476be))
* **build:** replace crypto import with Web Crypto API in tracer.ts ([425b22a](https://github.com/webdevcom01-cell/agent-studio/commit/425b22a61849f236f1eeb9740dc10fa965171738))
* **build:** resolve all lint errors blocking Railway deploy ([18149a1](https://github.com/webdevcom01-cell/agent-studio/commit/18149a166dc8639372a5603d246db29df54b86dc))
* **build:** restore accidentally deleted files from Session 7 commit ([d990242](https://github.com/webdevcom01-cell/agent-studio/commit/d9902423c79fff61405dc05583783cd4858da4d3))
* **build:** restore FlowContent type import in call-agent-handler ([ec662a8](https://github.com/webdevcom01-cell/agent-studio/commit/ec662a80e626c5ddceb2e36b0592156ec56033d6))
* **build:** skip Nixpacks install phase, use explicit pnpm install in buildCommand ([c9e4c54](https://github.com/webdevcom01-cell/agent-studio/commit/c9e4c540b16ff3fff6766e92f5084f6c8f577b74))
* **build:** use --no-frozen-lockfile to ensure ioredis is installed ([a0a08fe](https://github.com/webdevcom01-cell/agent-studio/commit/a0a08fe3fe0ae7432c516be0b94534821a43c56c))
* **build:** use npx knip instead of devDependency to avoid lockfile mismatch ([e9e41c1](https://github.com/webdevcom01-cell/agent-studio/commit/e9e41c151a9361a1d2cc2adcf25b89db91fcae8a))
* **cache:** add hit/miss output handles for conditional routing ([3fb1ffb](https://github.com/webdevcom01-cell/agent-studio/commit/3fb1ffbdf11ecdc5b6539147001a9279c00c302a))
* **chat:** inject session userId into context for human_approval node ([6f5d356](https://github.com/webdevcom01-cell/agent-studio/commit/6f5d356c69ee5e5b762ed92b7ea2af93b9db7a8d))
* **ci:** add /bin/ to CLI security allowed paths for Ubuntu compatibility ([58ada12](https://github.com/webdevcom01-cell/agent-studio/commit/58ada1202ba480f784f9bbe2017e2c73bfd2ef87))
* **ci:** fix Release workflow — remove invalid input, add config file ([ddfdb76](https://github.com/webdevcom01-cell/agent-studio/commit/ddfdb7611c28b2477d740f68990b924b17dab2d1))
* **ci:** ignore major version bumps for all Dependabot ecosystems ([d9c795a](https://github.com/webdevcom01-cell/agent-studio/commit/d9c795aedada7b26fdb3552be3da7b89ccac1a50))
* **ci:** ignore major version bumps in Dependabot ([b02ce3e](https://github.com/webdevcom01-cell/agent-studio/commit/b02ce3e646cac20ac361a4ba67f4ea5fa298f912))
* **ci:** inline next-auth in vitest to fix ESM resolution in CI ([1f2a5f1](https://github.com/webdevcom01-cell/agent-studio/commit/1f2a5f13f7e65fc5314413cd6b9d8a00215be09b))
* **ci:** resolve 5 failing unit tests causing CI to fail ([f8b21cd](https://github.com/webdevcom01-cell/agent-studio/commit/f8b21cdc73ddc061165f76749041e879395c7a81))
* **ci:** revert eslint no-unused-vars to default warning level ([431f9cb](https://github.com/webdevcom01-cell/agent-studio/commit/431f9cb58eb1cdef0f82fd03b3721b85dfcc814d))
* **config:** move outputFileTracingIncludes to top-level (Next.js 15.5+) ([3f93eb2](https://github.com/webdevcom01-cell/agent-studio/commit/3f93eb2aff711b1ae0c15e9dec85f84a12c0bd89))
* configure pnpm cross-platform native binaries for Cowork sandbox ([4af6419](https://github.com/webdevcom01-cell/agent-studio/commit/4af6419263857b751b88688d12ef79739ced1b54))
* conversationId type mismatch in PipelineProgress (string | undefined → null) ([93b5714](https://github.com/webdevcom01-cell/agent-studio/commit/93b57146683713a3408e9bbdd540da4317602380))
* correct E2E test selectors and make /evals/standards public ([aa3f915](https://github.com/webdevcom01-cell/agent-studio/commit/aa3f915fb49eb65abc5011ead2d6372fafbebfe2))
* **csp:** remove strict-dynamic that blocked all JS execution ([117f881](https://github.com/webdevcom01-cell/agent-studio/commit/117f881246e959dd6f514647db77240639cf0a69))
* CSRF host-only comparison for Railway HTTPS proxy ([0ac8e34](https://github.com/webdevcom01-cell/agent-studio/commit/0ac8e344fb11967121b5df5fab53b4b32ab6d7c5))
* **css:** add [@source](https://github.com/source) directive so Tailwind v4 scans tsx files ([c63a7b8](https://github.com/webdevcom01-cell/agent-studio/commit/c63a7b808135d795385eb185b1e127e3fc724b7f))
* **css:** ensure Tailwind v4 finds project root in Docker build ([7dc8081](https://github.com/webdevcom01-cell/agent-studio/commit/7dc80810b84afe1daba083c21740e3ac52aa97f3))
* **css:** use [@source](https://github.com/source) directory path to fix Tailwind v4 scanning in production ([0ee8f94](https://github.com/webdevcom01-cell/agent-studio/commit/0ee8f9457d3e8a33d382e2d4f64e8f9b49622a7e))
* **css:** use source(none) + explicit [@source](https://github.com/source) to bypass .gitignore scanning issue ([97de3f3](https://github.com/webdevcom01-cell/agent-studio/commit/97de3f3f47bac85bef4ba9df37516ad5ddca923a))
* **db:** add migration for Organization, ApiKey, and Agent columns missing from prod ([6dea67d](https://github.com/webdevcom01-cell/agent-studio/commit/6dea67d8dae9fc4af502f31858a5977decf9ec06))
* **debugger:** add missing component and API files omitted by virtiofs workaround ([9c09cd6](https://github.com/webdevcom01-cell/agent-studio/commit/9c09cd6f235859692ee33cbf41e0ee6a598bd194))
* **debugger:** resolve ESLint errors blocking CI ([01a3191](https://github.com/webdevcom01-cell/agent-studio/commit/01a319147bd2e8e793a4fc04880ac0e1baaca0b1))
* deploy-trigger skips gracefully when VERCEL_TOKEN not set ([c1c7060](https://github.com/webdevcom01-cell/agent-studio/commit/c1c7060e42dc949dbb35fb02a86667266f8a9e28))
* **deploy-trigger:** guard clauses returned nextNodeId "passed" instead of "failed" ([0e6f5d3](https://github.com/webdevcom01-cell/agent-studio/commit/0e6f5d3e03b5c335b8fb9787ac32006f3c101cba))
* **deploy:** copy static files into standalone output for Railway ([2e0c82b](https://github.com/webdevcom01-cell/agent-studio/commit/2e0c82b1307cc2494dc54e4ab90c441a8e608bc7))
* **deploy:** correct Next.js standalone server path in railway.toml ([d40a284](https://github.com/webdevcom01-cell/agent-studio/commit/d40a2845f2456e1e3c60346d54ded4c937b729fe))
* **deploy:** replace db:push with prisma migrate deploy in render.yaml ([a0d709f](https://github.com/webdevcom01-cell/agent-studio/commit/a0d709f3929ca6077ec16293626112cc63348808))
* **deploy:** revert startCommand to 'node server.js' — Nixpacks flattens standalone ([89eac43](https://github.com/webdevcom01-cell/agent-studio/commit/89eac433b3455ddde9aad4b6232b59f4734b8b1c))
* **deploy:** run prisma db push during build to sync DB schema ([1506649](https://github.com/webdevcom01-cell/agent-studio/commit/1506649cf4d79bdbd2093044ce6f17706e284832))
* **deploy:** switch to Dockerfile builder, runner stage last for Railway ([4d524c6](https://github.com/webdevcom01-cell/agent-studio/commit/4d524c65fe48eccc5206d20838e1351af1616f78))
* **deps:** replace xlsx (SheetJS) with exceljs — eliminate HIGH CVEs ([e0bd0ce](https://github.com/webdevcom01-cell/agent-studio/commit/e0bd0ce39eea1e4a1246d17a1c987b123145f74d))
* **devops-swarm:** fix FastMCP init + add HTTP /health endpoints ([e87136a](https://github.com/webdevcom01-cell/agent-studio/commit/e87136aa5d8d70c2b31004dabc4b564b794a4e4b))
* **docker:** add cache bust arg to force rebuild ([89d8056](https://github.com/webdevcom01-cell/agent-studio/commit/89d805610f24e446f0930a27b5151dc136633950))
* **docker:** add git to runner stage apk install ([7f2c302](https://github.com/webdevcom01-cell/agent-studio/commit/7f2c30291c0f9f2d1b3ca92a9ceec37c60308e6b))
* **docker:** create .git marker before pnpm build for Tailwind v4 scanning ([a960b17](https://github.com/webdevcom01-cell/agent-studio/commit/a960b17c45bd74d549a36b71bcba5f07c6099cdc))
* **docker:** git init in builder stage for Tailwind v4 Oxide scanner ([97dcf7e](https://github.com/webdevcom01-cell/agent-studio/commit/97dcf7ef107b13b5cd18ce13b24269bef91ee7dc))
* **docker:** install vitest globally in runner stage ([74b1e8f](https://github.com/webdevcom01-cell/agent-studio/commit/74b1e8fb33bf8c56ed130f17e59f05eb79fb1e94))
* EACCES fallback to /tmp/sdlc for Railway read-only /app directory ([f764bef](https://github.com/webdevcom01-cell/agent-studio/commit/f764bef483e053206d71b6e6659964617c0948ae))
* **ecc:** P0 fixes — eccEnabled toggle, HITL gate, instincts endpoint, ECC dashboard + test suite cleanup ([913692f](https://github.com/webdevcom01-cell/agent-studio/commit/913692f9058a6ebb2a107a7a21aa1d78b5a64c23))
* exclude website/ from main tsconfig and dockerignore ([c36f13c](https://github.com/webdevcom01-cell/agent-studio/commit/c36f13c78724ec2a4cd231079996f703ce8b729d))
* **file-writer:** add direct filePath+content mode for single-file writes ([ee32ac8](https://github.com/webdevcom01-cell/agent-studio/commit/ee32ac8a44eafbcdeda9978435d3091149fc1036))
* forensic audit P0+P1 — routes, inline styles, icon compliance ([4b48027](https://github.com/webdevcom01-cell/agent-studio/commit/4b480273176111ce89f67f86f14906784a0cf174))
* function handler auto-unwrap, btoa sandbox, dark mode layout ([c82741a](https://github.com/webdevcom01-cell/agent-studio/commit/c82741a8c20618235f94799a9a0b1931d1028522))
* **git-node:** bootstrap git repo in /tmp/sdlc before operations ([e34193e](https://github.com/webdevcom01-cell/agent-studio/commit/e34193e54cff27ab025700f1ca2b88e27825fe6b))
* **git-node:** configure identity + HTTPS auth for Railway ephemeral env ([2ecd040](https://github.com/webdevcom01-cell/agent-studio/commit/2ecd040bd2bb72b6863508c07c63241cf1c7b8c8))
* **git-node:** correct logger.error signature — root cause of [object Object] ([3c48f52](https://github.com/webdevcom01-cell/agent-studio/commit/3c48f523d98a0dca32a9567e3eb39f464b26e0dd))
* **git-node:** rename log fields to avoid logger token-key redaction ([b4b6c8b](https://github.com/webdevcom01-cell/agent-studio/commit/b4b6c8b06269376de4d54d63a9d4e10c6e7993b4))
* **git-node:** sanitize branch name to strip spaces and invalid chars ([7562f91](https://github.com/webdevcom01-cell/agent-studio/commit/7562f91e50978674ce7411fcf743c751c311995e))
* **git-node:** startup credentials guard + clear error serialization ([2658f13](https://github.com/webdevcom01-cell/agent-studio/commit/2658f133e3ee1ccdfcbecd9224281ba7f349e2c0))
* **git-node:** use || instead of ?? for GIT_REPO fallback in push case ([43b21b0](https://github.com/webdevcom01-cell/agent-studio/commit/43b21b02f0ad890fe81417c6107584277cc44886))
* **gitignore:** correctly unignore services/ecc-skills-mcp + trigger redeploy ([938e575](https://github.com/webdevcom01-cell/agent-studio/commit/938e57544ba0ab6e7ffb9264253112515d5eb94d))
* guard all writer.write() calls in streaming handler + propagate cancel to inner stream ([f0a27a3](https://github.com/webdevcom01-cell/agent-studio/commit/f0a27a360089d74e1d2ac3045f92e707b4a81748))
* **human-approval:** accept typed approve/reject in chat for authenti… ([59bf92c](https://github.com/webdevcom01-cell/agent-studio/commit/59bf92ce320e79435cf7a09f420fb824e7967933))
* **human-approval:** accept typed approve/reject in chat for authenticated users ([4f2ec3a](https://github.com/webdevcom01-cell/agent-studio/commit/4f2ec3a3c338f238c39884e5b365db89f1d27288))
* **human-approval:** add conversational fallback when userId is null ([2494454](https://github.com/webdevcom01-cell/agent-studio/commit/2494454e83128a67925a5ef7f8cba6fcb0715dda))
* **human-approval:** conversational fallback when userId is null ([2cba233](https://github.com/webdevcom01-cell/agent-studio/commit/2cba233e1aa57cb5bf29e39d6c7e2b098beffbd2))
* include CLAUDE.md in standalone build + use gpt-4o-mini for RAG query transform ([3c82491](https://github.com/webdevcom01-cell/agent-studio/commit/3c824912266fcc1194772158bdd21d15865b6911))
* include tiktoken wasm in Docker build for Railway deploy ([1760bb4](https://github.com/webdevcom01-cell/agent-studio/commit/1760bb4d88303b61d4f50bb3c7eab84043fd1ac2))
* increase sub-agent timeout, maxTokens, and agent discovery limit ([ccb5f0f](https://github.com/webdevcom01-cell/agent-studio/commit/ccb5f0f72345edaa78bf80de533dbf2852cf46f6))
* increase sub-agent timeout, maxTokens, and agent discovery limit ([5a22e9a](https://github.com/webdevcom01-cell/agent-studio/commit/5a22e9a9de4db3bfd75b8f930202baed9a0c569f))
* **infra:** add ioredis as explicit dependency for Redis connectivity ([84c6d1a](https://github.com/webdevcom01-cell/agent-studio/commit/84c6d1a5a4185394910d15ccc1c4662723946bf9))
* **infra:** Redis dual-stack IPv4+IPv6 for Railway internal networking ([be7f186](https://github.com/webdevcom01-cell/agent-studio/commit/be7f1863808ce8636460d0275002b5a62c0fb04b))
* **infra:** remove ioredis family option — not in TypeScript types ([1d593e5](https://github.com/webdevcom01-cell/agent-studio/commit/1d593e5d0708a4b68bdeaeba358219d652320f51))
* invisible button text on evals page (white-on-white) ([8394bc0](https://github.com/webdevcom01-cell/agent-studio/commit/8394bc09d589c230f069d6166365f7d152e11e30))
* **lint:** escape unescaped entities in devsecops page ([b90ecdf](https://github.com/webdevcom01-cell/agent-studio/commit/b90ecdfe2ffb2b4addf30e4d42e0ab67a21bed8c))
* **lint:** replace console.error with logger in error-display and flow-builder (DEBT-05) ([e9d6247](https://github.com/webdevcom01-cell/agent-studio/commit/e9d624743cc2351a223a17f307f53bd984506331))
* **lint:** resolve pre-existing no-unused-vars warnings to unblock CI ([c7a0c5c](https://github.com/webdevcom01-cell/agent-studio/commit/c7a0c5c5f13593d54b74d86afc717d93a08632b4))
* **mcp:** configure MCP_ALLOWED_HOSTS with Railway domain before FastMCP init ([9e5a10e](https://github.com/webdevcom01-cell/agent-studio/commit/9e5a10e83a731c5f03eae6275dd134423d8c74ef))
* **mcp:** fix orphaned conversation + misleading total field ([5426c80](https://github.com/webdevcom01-cell/agent-studio/commit/5426c8065e18947e7e14313c4e7d8135e4afd0c2))
* **mcp:** guard NaN inputs and validate variables is a JSON object ([56985c1](https://github.com/webdevcom01-cell/agent-studio/commit/56985c1356c4e4c7fd7ef78f619b4087eca6efdd))
* **mcp:** notifications/initialized returns 202 Accepted per MCP spec ([217837e](https://github.com/webdevcom01-cell/agent-studio/commit/217837ec354b244e2439130db7f5e4807e25a0ac))
* **mcp:** P2-T1 — replace monkey-patch with Host header rewrite middleware ([6c3a77f](https://github.com/webdevcom01-cell/agent-studio/commit/6c3a77f1d5296dee83e4c9b46eecd8c5b1feefe9))
* **mcp:** patch TransportSecurityManager for Railway TLS deployment ([aae5e3a](https://github.com/webdevcom01-cell/agent-studio/commit/aae5e3addfb534ec9d84e14bb4307b0caf578a34))
* **mcp:** patch TransportSecurityMiddleware._validate_host — correct class name ([3b8595c](https://github.com/webdevcom01-cell/agent-studio/commit/3b8595c531c1ae689ffd55367ee78554033a4739))
* **mcp:** queue failure guard, ABANDONED status, trim validation, args check ([990e42c](https://github.com/webdevcom01-cell/agent-studio/commit/990e42cdfbda7206bee4714de7e536b8f49199d0))
* **mcp:** round 6 — ABANDONED progress, cancelTask guard, conversation status paths ([624ced0](https://github.com/webdevcom01-cell/agent-studio/commit/624ced0fa5c446ec9a4331c3439860d978335da9))
* **middleware:** check all proxy host headers for CSRF validation ([3be437e](https://github.com/webdevcom01-cell/agent-studio/commit/3be437e66043217bf4963e2ad7415687b74b6461))
* **middleware:** use request.nextUrl for CSRF host check ([978f00b](https://github.com/webdevcom01-cell/agent-studio/commit/978f00bec396bdc3dc02d4761b4a11d36bdf6785))
* move getModel call inside AI step branch, default to deepseek-chat ([586fff3](https://github.com/webdevcom01-cell/agent-studio/commit/586fff341984a159f4f565cebb2abc8410ec7004))
* **openapi:** explicit auth type for SecurityRequirementObject TS2322 ([e3d33cc](https://github.com/webdevcom01-cell/agent-studio/commit/e3d33cc08ea777642b13938a462e3d2d9cb7c552))
* **P-01:** parallel node requires explicit branches[] config with branchId/outputVariable ([b0a0790](https://github.com/webdevcom01-cell/agent-studio/commit/b0a0790839d657873235440e1aaf75084119593e))
* **P-02:** template engine auto-parses JSON string variables for nested path access ([3dc81bf](https://github.com/webdevcom01-cell/agent-studio/commit/3dc81bf4733abd91d52425a97317ceec1b5ee0fc))
* **P-03:** memory-read handler supports both searchQuery and query fields ([2c96b14](https://github.com/webdevcom01-cell/agent-studio/commit/2c96b149e5e3e5b4bb5d2f348053b1559c89e3dd))
* **P-04:** evaluator auto-strips template syntax from inputVariable and converts string criteria ([91945dd](https://github.com/webdevcom01-cell/agent-studio/commit/91945dd6bd4509629dff3ea89e003261d54f3f14))
* **P-06:** prevent double node execution with SELF_ROUTING_NODES in engine ([69873c6](https://github.com/webdevcom01-cell/agent-studio/commit/69873c6fc96b661e414970aa2ffb42cb066eec21))
* **P-08:** aggregate node requires explicit branchVariables[] with UI editor and validation ([5d4ca3a](https://github.com/webdevcom01-cell/agent-studio/commit/5d4ca3a43f4eb56ceccce27f017329995a76655e))
* **P-09:** call_agent inputMapping validation with warnings and UI editor ([89c8018](https://github.com/webdevcom01-cell/agent-studio/commit/89c80189efa116944dd17e43ba50c31f057492f8))
* **P-09:** extend inputMapping warning to executeParallel() path ([2062986](https://github.com/webdevcom01-cell/agent-studio/commit/2062986075b1c258700cfba3178b2c70010be561))
* **P-10:** structured-output supports string format and secondary output variable ([5983189](https://github.com/webdevcom01-cell/agent-studio/commit/598318982b56632e4ca0b7fa8d48da129c3e5b62))
* **P-11:** notification webhook URL resolution priority: runtime &gt; config &gt; env ([fbebc7a](https://github.com/webdevcom01-cell/agent-studio/commit/fbebc7ad742a2eff9545473b0b23ede90b274a12))
* **P-14:** function node warns on missing outputVariable and uses fallback __function_result ([7ff9d8f](https://github.com/webdevcom01-cell/agent-studio/commit/7ff9d8fd89775e97274cb8d46c8920eee7023b7c))
* **P-15:** ai_extract auto-converts schema objects to fields[] with structured editor ([1a44175](https://github.com/webdevcom01-cell/agent-studio/commit/1a441756f9618371e141212a69760a6f258af89f))
* pass input message to sub-agent executeFlow call ([4a220dc](https://github.com/webdevcom01-cell/agent-studio/commit/4a220dcd52a1b91259b58e227d690d2e2c542078))
* **phase-F:** close all audit gaps — 100% Phase F completion ([bd72051](https://github.com/webdevcom01-cell/agent-studio/commit/bd720515e7c6948c93fbc6e946d9132ecdc7b942))
* prevent client disconnect from losing pipeline results in streaming engine ([324b52e](https://github.com/webdevcom01-cell/agent-studio/commit/324b52e72b362d57b52bfffc205867366f0b3eee))
* **process-runner:** resolve template args and support args[] array on node.data ([0ea4aa4](https://github.com/webdevcom01-cell/agent-studio/commit/0ea4aa41b2c031e1253eed72133cc2028b4a9c5c))
* **rag:** use Prisma.raw for SET LOCAL hnsw.ef_search to avoid $1 syntax error ([0d82fbd](https://github.com/webdevcom01-cell/agent-studio/commit/0d82fbd01d089fc73528e44e37573a7fd9b554ed))
* **railway:** add watchPaths to ensure all source changes trigger deploy ([c170f0a](https://github.com/webdevcom01-cell/agent-studio/commit/c170f0a39265763a0a08243fd5994f58bf1f28dd))
* **railway:** restore correct startCommand and copy static files for Nixpacks ([53552f4](https://github.com/webdevcom01-cell/agent-studio/commit/53552f4b617198e8f218ded81ce8380bd5faada0))
* **railway:** revert startCommand to node server.js — Nixpacks copies standalone to root ([ea3c489](https://github.com/webdevcom01-cell/agent-studio/commit/ea3c489e5d6645fe25011473fff40faddc4b2362))
* **redis:** force redeploy with correct REDIS_URL and ioredis dependency ([eaa58c2](https://github.com/webdevcom01-cell/agent-studio/commit/eaa58c25fd693682230067016f832ab54a470a74))
* remove conflicting railway.json, railway.toml is source of truth ([6df3053](https://github.com/webdevcom01-cell/agent-studio/commit/6df30533050130912ae2447a839a9e392ae0cac5))
* remove invalid --skip-generate prisma flag, use standalone server ([222eec0](https://github.com/webdevcom01-cell/agent-studio/commit/222eec0d43149f650da4f8405c8e3a08c136dff3))
* remove node:crypto fallback and static logger import to fix webpack build ([e4dfd83](https://github.com/webdevcom01-cell/agent-studio/commit/e4dfd8364a20fe7dc1a5131500db372ae12adc81))
* remove prisma db push from start command, not available in standalone runner ([daa8277](https://github.com/webdevcom01-cell/agent-studio/commit/daa8277c6a8c70fbf7bc536b74b20a7008b0305f))
* rename GIT_TOKEN to GITHUB_PAT ([788b467](https://github.com/webdevcom01-cell/agent-studio/commit/788b467fad10a63edeec693569515dd07d5a9139))
* replace isolated-vm with Node.js vm module to fix Railway build ([ad3113a](https://github.com/webdevcom01-cell/agent-studio/commit/ad3113a6bead89bf73d0554c4ecd656732d034e6))
* replace node:crypto with Web Crypto API in security-headers (Edge compat) ([4413351](https://github.com/webdevcom01-cell/agent-studio/commit/44133511afbc2dc233ff8098a2d4f6c98e365a26))
* resolve all E2E test failures (99/99 passing) ([a80acda](https://github.com/webdevcom01-cell/agent-studio/commit/a80acdaf50bd8ab35346a41c41f78185796c4f60))
* resolve all pre-existing test failures ([3e140cf](https://github.com/webdevcom01-cell/agent-studio/commit/3e140cf7f537edc1919f2579ab1f1667ddcdd127))
* restore files accidentally removed from git index ([6364886](https://github.com/webdevcom01-cell/agent-studio/commit/63648866e54d489ae74ac38986900248eaf4d6bb))
* rewrite auth request URL to public origin (Railway proxy iss mismatch) ([f07071c](https://github.com/webdevcom01-cell/agent-studio/commit/f07071c6774e11cd5f56f2702ff90bfb34b46294))
* **runtime:** resolve template vars in file-writer targetDir ([#54](https://github.com/webdevcom01-cell/agent-studio/issues/54)) ([1295a54](https://github.com/webdevcom01-cell/agent-studio/commit/1295a54eecaa8abaeb79e9945924cf08a353188f))
* **runtime:** resolve template vars in git-node-handler workingDir ([4de2602](https://github.com/webdevcom01-cell/agent-studio/commit/4de2602424de1f0424043ea090be49dc74694eb6))
* **runtime:** resolve template vars in git-node-handler workingDir ([#56](https://github.com/webdevcom01-cell/agent-studio/issues/56)) ([e35a42d](https://github.com/webdevcom01-cell/agent-studio/commit/e35a42d9d590e110e6da4d77ca0c722f80068bf7))
* **runtime:** surface real file-writer error in logs and UI ([#55](https://github.com/webdevcom01-cell/agent-studio/issues/55)) ([7ab5821](https://github.com/webdevcom01-cell/agent-studio/commit/7ab58212b394963d297550616f6782bf900ee429))
* **sandbox:** add encodeURIComponent/unescape/escape to vm sandbox ([1d7134c](https://github.com/webdevcom01-cell/agent-studio/commit/1d7134c69e3465512334664bb5f2ad71e0c2d793))
* **schema:** move expectedDurationSeconds from Account to Agent model ([c220808](https://github.com/webdevcom01-cell/agent-studio/commit/c22080895df9f1b637501b5e49a3ad37cb19593c))
* **sdlc:** 7 forensic fixes — sandbox_verify conflict, timeout, stale impl, collectFiles cap, Error: false positive, stack trace noise, dead variable ([b74a252](https://github.com/webdevcom01-cell/agent-studio/commit/b74a2526b294394cd45c9c99e593cca9dff88404))
* **sdlc:** add missing diagnostic logs for zero-files implementation steps ([cadaba4](https://github.com/webdevcom01-cell/agent-studio/commit/cadaba43624c9eee5b4b564e290513181e004bd7))
* **sdlc:** add workspace diagnostic logging to git-integration ([adb37fe](https://github.com/webdevcom01-cell/agent-studio/commit/adb37feb60a9bec7ef05616ac8128588aa35e956))
* **sdlc:** always use phase priority for implementation steps (gpt-4o-mini lacks structured output) ([15617c3](https://github.com/webdevcom01-cell/agent-studio/commit/15617c3ae10ff5555cf127e50d1cabae85b1923e))
* **sdlc:** block path traversal and absolute paths in patch-applier (S3/C8) ([932209a](https://github.com/webdevcom01-cell/agent-studio/commit/932209a4b3c0b13645bfad59cd2c83575d68d97e))
* **sdlc:** catch runtime errors in feedback loop + enforce vitest imports in codegen ([4a1a311](https://github.com/webdevcom01-cell/agent-studio/commit/4a1a3110355ba145e3b09a620a71ad02577791b3))
* **sdlc:** disable OpenAI strict-mode schema for generateObject ([bdce830](https://github.com/webdevcom01-cell/agent-studio/commit/bdce8306d2d430539cb7a05aa66a761fc6bbf153))
* **sdlc:** extend PATH in runVerificationCommands so vitest resolves on Railway ([c99deb3](https://github.com/webdevcom01-cell/agent-studio/commit/c99deb37f80fedcec5f677310b305425cbdd99ea))
* **sdlc:** fail implementation step when zero files generated ([6272a82](https://github.com/webdevcom01-cell/agent-studio/commit/6272a826e165441665708e9d196c75213eef670e))
* **sdlc:** fix contextParts off-by-one when priorMemory present (C2+D4) ([0b8e53d](https://github.com/webdevcom01-cell/agent-studio/commit/0b8e53d87cc3657e4384d5d5d167dd0d3988b800))
* **sdlc:** log model fallback and escalation events in model router ([c553185](https://github.com/webdevcom01-cell/agent-studio/commit/c55318533b6ef2a6fec532acaaa27c3593c09ebb))
* **sdlc:** move vitest to dependencies so it survives Railway prod prune ([45440db](https://github.com/webdevcom01-cell/agent-studio/commit/45440db25659be30a09ffe08764368d546c2824d))
* **sdlc:** preserve workspace on pipeline failure for post-mortem inspection ([514428e](https://github.com/webdevcom01-cell/agent-studio/commit/514428e65f563d9b786da52a273c50e0470f297a))
* **sdlc:** prevent false positive didTestsFail on vitest '0 failed' summary (C1) ([22955aa](https://github.com/webdevcom01-cell/agent-studio/commit/22955aafa341ccb75c3633694f39aba6539cc484))
* **sdlc:** redact GitHub PAT from git error messages before logging (S1) ([a6698e2](https://github.com/webdevcom01-cell/agent-studio/commit/a6698e265df88f76850ef795abb9870306c805b7))
* **sdlc:** schema + typecheck fixes for generateObject ([7e150e3](https://github.com/webdevcom01-cell/agent-studio/commit/7e150e34cadd366bac23b0a190d9b93e6a1701a6))
* **sdlc:** surface git integration errors in pipeline result and UI ([c368d60](https://github.com/webdevcom01-cell/agent-studio/commit/c368d60c1e29d22c65fe5352f5097a8ac54e53c0))
* **sdlc:** switch pipeline-memory extraction from deepseek-chat to gpt-4o-mini ([8601864](https://github.com/webdevcom01-cell/agent-studio/commit/8601864f16973938ec2599e3b975a3eec19c4b2b))
* **sdlc:** use gpt-4.1 first for implementation steps (supports generateObject) ([0fcd271](https://github.com/webdevcom01-cell/agent-studio/commit/0fcd27126e52d0a04f8beb343987c62cc976a198))
* **security:** harden Python and JS executor sandboxing (Session 7) ([f71c834](https://github.com/webdevcom01-cell/agent-studio/commit/f71c834df21bd8f4b5ecf7e9c76d946cd7b361cd))
* **security:** return error message in RBAC denial response ([a6a47b2](https://github.com/webdevcom01-cell/agent-studio/commit/a6a47b2cd750469fd0a8d15daaea24454eb7800f))
* simplify startCommand to node server.js ([5eb7c1b](https://github.com/webdevcom01-cell/agent-studio/commit/5eb7c1b93c5bc3a40e9ca3c23d7182df51510ccd))
* **slack:** truncate Block Kit fields to stay within Slack's hard limits ([55219e9](https://github.com/webdevcom01-cell/agent-studio/commit/55219e9bc82b32ea33e07d98dee20d7c5e13fdae))
* sync local Faza 6 changes that were never committed to git ([f319258](https://github.com/webdevcom01-cell/agent-studio/commit/f319258a258d1d27c7f94e8b7d5cb1ef3a15df2b))
* **Task 3.2:** remove duplicate DEFAULT_TIMEOUT_SECONDS declaration ([0cfb6b1](https://github.com/webdevcom01-cell/agent-studio/commit/0cfb6b187013e34f8df31e6740f5370199410fe9))
* **tech-debt:** remove all remaining any casts after pnpm db:generate ([29c6379](https://github.com/webdevcom01-cell/agent-studio/commit/29c6379aef28c038d82de5890b3338f90ff0d644))
* **tech-debt:** replace any types with proper types in discover/route and agent-tools ([23301a0](https://github.com/webdevcom01-cell/agent-studio/commit/23301a04439b9850f46fe8bfd2aedd4fe5e8ce7c))
* **test:** fix error-display and env test failures ([c177563](https://github.com/webdevcom01-cell/agent-studio/commit/c177563b8034a918ca7f2600ae4b8b661f6b17a7))
* **test:** make parallel-agents test deterministic ([71daaee](https://github.com/webdevcom01-cell/agent-studio/commit/71daaeec2d5c6d9db7f9a438d40072387a3436ae))
* **test:** mock auth-guard in chat-validation test ([2dd867c](https://github.com/webdevcom01-cell/agent-studio/commit/2dd867c40d165af58bb836d5a08612bd80e182ad))
* **tests:** fix unresolved ../types import in schema-drift-empty-data test ([dddb0ca](https://github.com/webdevcom01-cell/agent-studio/commit/dddb0cac82de0ffb0b65c9ec3472fe7c00c87d55))
* **test:** update property-panel test for Phase 2-5 changes ([be9fef9](https://github.com/webdevcom01-cell/agent-studio/commit/be9fef9cf07628a7ffec782e0a479d9f2eef0ef4))
* **theme:** add dark class to html root and fix ThemeProvider blank screen ([428f6fd](https://github.com/webdevcom01-cell/agent-studio/commit/428f6fdf7bc85ab795b16afac68636eaad3eed2b))
* **timeouts:** increase agent-as-tool timeout profiles for DeepSeek latency ([db0359a](https://github.com/webdevcom01-cell/agent-studio/commit/db0359ab5905a118a83b96ccf9229653e1bdd6c2))
* **ui:** fix pipelines data shape - use data.runs not data directly ([a915b5d](https://github.com/webdevcom01-cell/agent-studio/commit/a915b5d9a1058e69621c260196e5dc962f7cf9d4))
* **ui:** remove ReactMarkdown and prose classes from pipelines page ([242ad8f](https://github.com/webdevcom01-cell/agent-studio/commit/242ad8fff61974d535004efaf45c3bb0d72867a0))
* **ui:** rewrite pipelines page with stable components ([7980c7c](https://github.com/webdevcom01-cell/agent-studio/commit/7980c7c1b0d2eab67dca22045db1c3e23e768edb))
* upgrade @auth/core + rewrite auth URL for Railway proxy (iss mismatch fix) ([dee17a2](https://github.com/webdevcom01-cell/agent-studio/commit/dee17a2826bfe7d4a44edf98e9df4bf33f2ad8e3))
* upgrade CI pnpm version to v10 to match local pnpm v10.28.2 ([657e628](https://github.com/webdevcom01-cell/agent-studio/commit/657e628ebbeae455d4dd11ea9799e77017c018f4))
* use --no-frozen-lockfile in Dockerfile to sync with package.json ([be4da9b](https://github.com/webdevcom01-cell/agent-studio/commit/be4da9bc409ae5a47c3f62e753a0f8b6c000feca))
* use local prisma v6 instead of npx to avoid version mismatch ([3999177](https://github.com/webdevcom01-cell/agent-studio/commit/3999177f092a3fd59278f542cc065f9a3266f670))
* vitest outside /app root — cwd + symlinks for /tmp/sdlc workspace ([ae1eff2](https://github.com/webdevcom01-cell/agent-studio/commit/ae1eff25452534d620863851708a01611ac4cd1c))
* **worker:** install git in Docker image for SDLC git integration ([e75140e](https://github.com/webdevcom01-cell/agent-studio/commit/e75140e825f8f96feddc0977bd8a94165628eb1f))


### Performance Improvements

* **sdlc:** add SHA-256 hash-based cache to indexCodebase to skip unchanged files (P1) ([bbb37b1](https://github.com/webdevcom01-cell/agent-studio/commit/bbb37b1630191da3e7ec9af4783148f144c762cf))

## [Unreleased]

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
