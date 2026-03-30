# Changelog

All notable changes to Agent Studio are documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [0.2.0](https://github.com/webdevcom01-cell/agent-studio/compare/v0.1.0...v0.2.0) (2026-03-30)


### Features

* add @agent-studio/cli package with init, dev, build commands ([1f50585](https://github.com/webdevcom01-cell/agent-studio/commit/1f505857556cc22949c34382a6fcb1f8973681ed))
* add 3 new flow nodes — semantic_router, cost_monitor, aggregate ([de3f20b](https://github.com/webdevcom01-cell/agent-studio/commit/de3f20bebc4db5ad00d4dc0a8665d813658631c7))
* add 5 new flow nodes — structured_output, cache, embeddings, retry, ab_test ([5480c6b](https://github.com/webdevcom01-cell/agent-studio/commit/5480c6b1e46755cd3b768590b4398b534d753f78))
* add database_query, file_operations, mcp_task_runner nodes (Sprint 5) ([042197b](https://github.com/webdevcom01-cell/agent-studio/commit/042197bf2f3d6d0acdce7da763bd3f1fe729e9fa))
* add Docusaurus docs site with GitHub Pages workflow ([80a3867](https://github.com/webdevcom01-cell/agent-studio/commit/80a386763f598ca14dd29e44d2cc5a5389fff998))
* add guardrails, code_interpreter, trajectory_evaluator (Sprint 6 — FINAL) ([296ab90](https://github.com/webdevcom01-cell/agent-studio/commit/296ab906a7c78769165b9b0786207f358606ae56))
* add image_generation and speech_audio nodes (Sprint 4) ([5005b28](https://github.com/webdevcom01-cell/agent-studio/commit/5005b28e851a2e94962820704105a91bd64a9503))
* add Python Code node with dual execution (browser + server) ([b24b6e6](https://github.com/webdevcom01-cell/agent-studio/commit/b24b6e6c9f76dbad8bd41f0e45df9e9d099ad6c8))
* add web_search and multimodal_input nodes (Sprint 3) ([bfc4b7e](https://github.com/webdevcom01-cell/agent-studio/commit/bfc4b7ef4548395187b1bd6c8023bbd6bf825d3b))
* Autonomous DevOps Swarm — 4-agent AI security pipeline ([119cc0d](https://github.com/webdevcom01-cell/agent-studio/commit/119cc0dc91767dec51aae8a7f59d80becdd171db))
* Autonomous DevSecOps Pipeline — multi-agent CI/CD security guard (2026) ([ae61d4a](https://github.com/webdevcom01-cell/agent-studio/commit/ae61d4a9b7ab3c2cf40b6c56dd8d754c8325ea6e))
* **builder:** redesign node picker with categorized search, tooltips, and keyboard navigation ([5922051](https://github.com/webdevcom01-cell/agent-studio/commit/59220517a1995c4b91f2328b2d74430d66733745))
* **cli-generator:** CLI Generator v2 — retry hardening, live preview, auto-fix, MCP test panel, quick-start scripts ([a564862](https://github.com/webdevcom01-cell/agent-studio/commit/a56486224326dfc26374cb787e78d0b5ca90c236))
* **debugger:** add FlowTrace schema + type bridge (Phase 5) ([f8211ff](https://github.com/webdevcom01-cell/agent-studio/commit/f8211ff2c6c2f67344bac4ff46c14024db3f753c))
* **debugger:** Phase 5 — Trace Persistence & History ([3a5e99f](https://github.com/webdevcom01-cell/agent-studio/commit/3a5e99f5d6c7098dfde5539fc16a471f76dcf041))
* **debugger:** Phase 6 — Breakpoints & Step-by-Step Execution ([04c03ed](https://github.com/webdevcom01-cell/agent-studio/commit/04c03ed4263c380c7e5a79691c892e8f4a4fbe0c))
* **debugger:** Phase 7 — Variable Watch & Live Edit ([26f895c](https://github.com/webdevcom01-cell/agent-studio/commit/26f895cb12966b3f025053c0e114e15ff1293961))
* **evals:** CSV export, scheduled runs, and A/B comparison ([e249ba6](https://github.com/webdevcom01-cell/agent-studio/commit/e249ba695ca9b28fbc084bbbb5d38ca14076dda3))
* **evals:** timeout+retry in runner, cron timezone support, assertion-level compare breakdown ([61355de](https://github.com/webdevcom01-cell/agent-studio/commit/61355dee89635ffeb687d9924038f1dc75e851fb))
* **F-01:** call_agent built-in retry with exponential backoff and jitter ([3ab629f](https://github.com/webdevcom01-cell/agent-studio/commit/3ab629f246a29e4fcf7c5a77c90f4c1e2fe3218f))
* **F-02:** guardrails per-module action config (block/warn/redact) with safety pipeline ([a364d05](https://github.com/webdevcom01-cell/agent-studio/commit/a364d05b7c5d8f1c6f76816dd4b185898770e3b6))
* **F-03:** cost monitor adaptive mode with automatic model tier downgrade (FinOps 2025) ([5afa7e5](https://github.com/webdevcom01-cell/agent-studio/commit/5afa7e5ce2dc66032c48498c81e1fc7720b879ec))
* **F-06:** engine safety middleware auto-checks all AI calls (EU AI Act 2025) ([a178f58](https://github.com/webdevcom01-cell/agent-studio/commit/a178f58836cc1f13713be4592623f557da0a5a65))
* **knowledge:** add HNSW vector search indexes + dynamic ef_search tuning ([9f1901c](https://github.com/webdevcom01-cell/agent-studio/commit/9f1901c2e061aabb2668e8b015b0dadf78fb16c5))
* **knowledge:** HNSW vector search optimization ([0fe3ad5](https://github.com/webdevcom01-cell/agent-studio/commit/0fe3ad541b3e46d8478bc6e84b7548f8b0e971b3))
* multi-agent orchestration Phase 1 — Plan-and-Execute + Reflexive Loop ([8e14377](https://github.com/webdevcom01-cell/agent-studio/commit/8e14377babaa0b9f8024d48ad780dfdb7ee1f0d0))
* **P-05:** eval runner supports webhook triggerMode for webhook-triggered flows ([408e419](https://github.com/webdevcom01-cell/agent-studio/commit/408e419145bb28b2a96fb0324339e1983654b4c4))
* **P-07:** eval suite editor shows correct fields per assertion type with helpers ([fd4ca11](https://github.com/webdevcom01-cell/agent-studio/commit/fd4ca1191845d2be065321daa04a3a6e0d36c40f))
* **P-12:** webhook body mapping logs warning on JSONPath miss with strict mode option ([a08fc83](https://github.com/webdevcom01-cell/agent-studio/commit/a08fc8321f31c213c44a771b4041330516286242))
* **P-13:** memory-write supports merge_object, deep_merge, append_array, increment strategies ([7cd1993](https://github.com/webdevcom01-cell/agent-studio/commit/7cd1993bb2a68182ab4b294bc10dc7339e5ad1ed))
* post-deploy verifier with 6 NIST-inspired checks ([97059b5](https://github.com/webdevcom01-cell/agent-studio/commit/97059b5989e61d9d43cf6d08246b4fc010d28d81))
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
* Visual Flow Debugger — Phase 3 (Debug Panel deep inspection) ([765c0c5](https://github.com/webdevcom01-cell/agent-studio/commit/765c0c5db204aa52bba5103e84ece9464ec55be0))
* Visual Flow Debugger — Phase 4 (Execution Timeline) ([7633bea](https://github.com/webdevcom01-cell/agent-studio/commit/7633bea460920f01b1b9b80f901515ad4bdd8844))
* Visual Flow Debugger Phase 1+2 ([4f0e6f7](https://github.com/webdevcom01-cell/agent-studio/commit/4f0e6f7e69ab57ce5ab12f8ebb62a7a012d88b53))
* webhook eval assertions — webhook_response_valid and webhook_payload_echoed ([0cf96ce](https://github.com/webdevcom01-cell/agent-studio/commit/0cf96ce054d05bfe9c7ecebce4faa73925ae258f))
* webhook improvements — JSONPath tester, execution CSV export, replay chain + status filter E2E tests ([dd81939](https://github.com/webdevcom01-cell/agent-studio/commit/dd81939da1109aa66de815162f4131ab4b138ce2))
* **webhooks:** paginated executions, status filters, auto-refresh, and search ([ba39e43](https://github.com/webdevcom01-cell/agent-studio/commit/ba39e430858afb67d7d10233c67f2677bf63c2fc))


### Bug Fixes

* add packages field to pnpm-workspace.yaml for Railway build ([df6689e](https://github.com/webdevcom01-cell/agent-studio/commit/df6689ea7a054ddd43f35ecd3657beda2401f55a))
* **build:** add missing popover, property-section, and variable-input components ([1e8dafd](https://github.com/webdevcom01-cell/agent-studio/commit/1e8dafd54b39ffed1c37210511b7fad359c35492))
* **build:** include all workspace files in commit — resolve schemas.ts missing exports ([dea9838](https://github.com/webdevcom01-cell/agent-studio/commit/dea9838ac2008196ce9229268e018e6d8977a7c1))
* **build:** replace crypto import with Web Crypto API in tracer.ts ([425b22a](https://github.com/webdevcom01-cell/agent-studio/commit/425b22a61849f236f1eeb9740dc10fa965171738))
* **build:** resolve all lint errors blocking Railway deploy ([18149a1](https://github.com/webdevcom01-cell/agent-studio/commit/18149a166dc8639372a5603d246db29df54b86dc))
* **build:** restore accidentally deleted files from Session 7 commit ([d990242](https://github.com/webdevcom01-cell/agent-studio/commit/d9902423c79fff61405dc05583783cd4858da4d3))
* **build:** restore FlowContent type import in call-agent-handler ([ec662a8](https://github.com/webdevcom01-cell/agent-studio/commit/ec662a80e626c5ddceb2e36b0592156ec56033d6))
* **build:** skip Nixpacks install phase, use explicit pnpm install in buildCommand ([c9e4c54](https://github.com/webdevcom01-cell/agent-studio/commit/c9e4c540b16ff3fff6766e92f5084f6c8f577b74))
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
* correct E2E test selectors and make /evals/standards public ([aa3f915](https://github.com/webdevcom01-cell/agent-studio/commit/aa3f915fb49eb65abc5011ead2d6372fafbebfe2))
* CSRF host-only comparison for Railway HTTPS proxy ([0ac8e34](https://github.com/webdevcom01-cell/agent-studio/commit/0ac8e344fb11967121b5df5fab53b4b32ab6d7c5))
* **debugger:** add missing component and API files omitted by virtiofs workaround ([9c09cd6](https://github.com/webdevcom01-cell/agent-studio/commit/9c09cd6f235859692ee33cbf41e0ee6a598bd194))
* **debugger:** resolve ESLint errors blocking CI ([01a3191](https://github.com/webdevcom01-cell/agent-studio/commit/01a319147bd2e8e793a4fc04880ac0e1baaca0b1))
* **devops-swarm:** fix FastMCP init + add HTTP /health endpoints ([e87136a](https://github.com/webdevcom01-cell/agent-studio/commit/e87136aa5d8d70c2b31004dabc4b564b794a4e4b))
* exclude website/ from main tsconfig and dockerignore ([c36f13c](https://github.com/webdevcom01-cell/agent-studio/commit/c36f13c78724ec2a4cd231079996f703ce8b729d))
* **gitignore:** correctly unignore services/ecc-skills-mcp + trigger redeploy ([938e575](https://github.com/webdevcom01-cell/agent-studio/commit/938e57544ba0ab6e7ffb9264253112515d5eb94d))
* include tiktoken wasm in Docker build for Railway deploy ([1760bb4](https://github.com/webdevcom01-cell/agent-studio/commit/1760bb4d88303b61d4f50bb3c7eab84043fd1ac2))
* **lint:** escape unescaped entities in devsecops page ([b90ecdf](https://github.com/webdevcom01-cell/agent-studio/commit/b90ecdfe2ffb2b4addf30e4d42e0ab67a21bed8c))
* **lint:** resolve pre-existing no-unused-vars warnings to unblock CI ([c7a0c5c](https://github.com/webdevcom01-cell/agent-studio/commit/c7a0c5c5f13593d54b74d86afc717d93a08632b4))
* **middleware:** check all proxy host headers for CSRF validation ([3be437e](https://github.com/webdevcom01-cell/agent-studio/commit/3be437e66043217bf4963e2ad7415687b74b6461))
* **middleware:** use request.nextUrl for CSRF host check ([978f00b](https://github.com/webdevcom01-cell/agent-studio/commit/978f00bec396bdc3dc02d4761b4a11d36bdf6785))
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
* **railway:** add watchPaths to ensure all source changes trigger deploy ([c170f0a](https://github.com/webdevcom01-cell/agent-studio/commit/c170f0a39265763a0a08243fd5994f58bf1f28dd))
* **railway:** restore correct startCommand and copy static files for Nixpacks ([53552f4](https://github.com/webdevcom01-cell/agent-studio/commit/53552f4b617198e8f218ded81ce8380bd5faada0))
* **railway:** revert startCommand to node server.js — Nixpacks copies standalone to root ([ea3c489](https://github.com/webdevcom01-cell/agent-studio/commit/ea3c489e5d6645fe25011473fff40faddc4b2362))
* remove conflicting railway.json, railway.toml is source of truth ([6df3053](https://github.com/webdevcom01-cell/agent-studio/commit/6df30533050130912ae2447a839a9e392ae0cac5))
* remove invalid --skip-generate prisma flag, use standalone server ([222eec0](https://github.com/webdevcom01-cell/agent-studio/commit/222eec0d43149f650da4f8405c8e3a08c136dff3))
* remove node:crypto fallback and static logger import to fix webpack build ([e4dfd83](https://github.com/webdevcom01-cell/agent-studio/commit/e4dfd8364a20fe7dc1a5131500db372ae12adc81))
* remove prisma db push from start command, not available in standalone runner ([daa8277](https://github.com/webdevcom01-cell/agent-studio/commit/daa8277c6a8c70fbf7bc536b74b20a7008b0305f))
* replace isolated-vm with Node.js vm module to fix Railway build ([ad3113a](https://github.com/webdevcom01-cell/agent-studio/commit/ad3113a6bead89bf73d0554c4ecd656732d034e6))
* resolve all E2E test failures (99/99 passing) ([a80acda](https://github.com/webdevcom01-cell/agent-studio/commit/a80acdaf50bd8ab35346a41c41f78185796c4f60))
* **security:** harden Python and JS executor sandboxing (Session 7) ([f71c834](https://github.com/webdevcom01-cell/agent-studio/commit/f71c834df21bd8f4b5ecf7e9c76d946cd7b361cd))
* simplify startCommand to node server.js ([5eb7c1b](https://github.com/webdevcom01-cell/agent-studio/commit/5eb7c1b93c5bc3a40e9ca3c23d7182df51510ccd))
* **tech-debt:** remove all remaining any casts after pnpm db:generate ([29c6379](https://github.com/webdevcom01-cell/agent-studio/commit/29c6379aef28c038d82de5890b3338f90ff0d644))
* **tech-debt:** replace any types with proper types in discover/route and agent-tools ([23301a0](https://github.com/webdevcom01-cell/agent-studio/commit/23301a04439b9850f46fe8bfd2aedd4fe5e8ce7c))
* **test:** mock auth-guard in chat-validation test ([2dd867c](https://github.com/webdevcom01-cell/agent-studio/commit/2dd867c40d165af58bb836d5a08612bd80e182ad))
* **test:** update property-panel test for Phase 2-5 changes ([be9fef9](https://github.com/webdevcom01-cell/agent-studio/commit/be9fef9cf07628a7ffec782e0a479d9f2eef0ef4))
* upgrade CI pnpm version to v10 to match local pnpm v10.28.2 ([657e628](https://github.com/webdevcom01-cell/agent-studio/commit/657e628ebbeae455d4dd11ea9799e77017c018f4))
* use --no-frozen-lockfile in Dockerfile to sync with package.json ([be4da9b](https://github.com/webdevcom01-cell/agent-studio/commit/be4da9bc409ae5a47c3f62e753a0f8b6c000feca))
* use local prisma v6 instead of npx to avoid version mismatch ([3999177](https://github.com/webdevcom01-cell/agent-studio/commit/3999177f092a3fd59278f542cc065f9a3266f670))

## [2.9.0] - 2026-03-27 — Deal Flow Agent + M&A Agents in Studio

> 1 new subproject (Python FastAPI) · 5 new agents in Agent Studio · agent cleanup · DB schema sync

### Added
- **Deal Flow Agent** (`deal-flow-agent/`) — standalone Python FastAPI backend that wraps 5 specialized M&A due diligence agents into a REST API with Swagger UI
  - `backend/agents/screening_agent.py` — initial deal screening (strategic fit, market position, red flags)
  - `backend/agents/financial_agent.py` — financial analysis (DCF, EBITDA multiples, revenue trends, valuation)
  - `backend/agents/risk_agent.py` — risk assessment (operational, market, regulatory, ESG)
  - `backend/agents/competitive_agent.py` — competitive intelligence (moat, Porter's Five Forces, positioning)
  - `backend/agents/legal_agent.py` — legal due diligence (contracts, IP, compliance, litigation exposure)
  - `backend/routers/deals.py` — CRUD endpoints: `POST /deals`, `GET /deals`, `GET /deals/{id}`, `DELETE /deals/{id}`
  - `backend/routers/agents.py` — execution endpoints: `POST /agents/run/{deal_id}` (all 5 parallel), `POST /agents/run/{deal_id}/{name}` (single), `GET /agents/results/{deal_id}`
  - `backend/routers/memos.py` — investment memo: `POST /memos/generate/{deal_id}`, `GET /memos/{deal_id}`, `GET /memos/{deal_id}/markdown`
  - `backend/main.py` — FastAPI app with lifespan, CORS, `/health` endpoint, DB check, uptime reporting
  - Weighted scoring: Screening 15%, Financial 30%, Risk 25%, Competitive 20%, Legal 10%
  - Recommendation thresholds: ≥72 → BUY, ≥55 → HOLD, <55 → PASS
  - `Dockerfile` + `docker-compose.yml` for containerized deployment
- **5 M&A agents in Agent Studio** — created directly via Prisma, immediately available for chat in Studio UI
  - 🔍 M&A Screening Agent
  - 💰 M&A Financial Agent
  - ⚠️ M&A Risk Agent
  - 🏆 M&A Competitive Agent
  - ⚖️ M&A Legal Agent

### Fixed
- **`contextOrdering` column missing** — ran `prisma db push` to sync Supabase DB with Prisma schema (RAG pipeline additions were never pushed); resolves `prisma.agent.create()` failure on new agents

### Maintenance
- **Agent cleanup** — deleted 14 stale test/E2E/demo agents; 10 agents remain in production

---


## [2.8.0] - 2026-03-26 — CLI Generator v2: Retry Hardening, Live Preview, Auto-Fix & Quick-Start

> 10 files · ~700 lines · 5 new modules · 0 breaking changes

### Added
- **Retry jitter** (`ai-phases.ts`) — ±25% random jitter added to exponential backoff between retry rounds, preventing thundering-herd when multiple phases hit rate limits simultaneously
- **Auto-heal stuck running phases** (`advance/route.ts`) — if advance is called on a generation whose current phase is stuck in `"running"` (leftover from a crashed invocation), the phase is automatically reset to `"pending"` and re-executed in the same request
- **`modelUsed` + `retryCount` on `PhaseResult`** — every phase now persists which model succeeded and how many retries were needed; fields added to `PhaseResult` interface in `types.ts`
- **Frontend auto-resume** (`page.tsx`) — new `useEffect` detects stuck generations when they are selected and triggers `handleResume` automatically; guarded by `autoResumedRef` (fires at most once per generation per page session)
- **Live file preview** (`file-viewer.tsx`) — `FileViewer` now accepts `isRunning?: boolean` prop; when true, SWR polls `/files` every 2 s so files appear as they are generated rather than only after pipeline completion
- **`OnFileGenerated` callback** (`types.ts`, `ai-phases.ts`) — `aiImplement` and `aiTest` accept an optional async callback fired after each parallel file resolves; `advance/route.ts` passes a callback that writes each file to `generatedFiles` in the DB incrementally (enables live preview)
- **Python validator** (`py-validator.ts`) — new static analysis module: checks FastMCP import, `@mcp.tool` decorators, `mcp.run()`, `mcp` in requirements.txt, and presence of required files; logs warnings, never blocks completion
- **Auto-fix engine** (`auto-fix.ts`) — new deterministic post-processing module: corrects `mcp.Server()→FastMCP`, `from mcp import Server→FastMCP import`, `server.tool()→server.registerTool()`, and missing `.js` ESM extensions; runs automatically after implement phase in `advance/route.ts`
- **Quick-start scripts** (`quickstart.ts`) — generates `install.sh` (runtime version checks, venv/npm setup, Claude Desktop config snippet) and a multi-stage `Dockerfile` for both Python and TypeScript targets; appended to `generatedFiles` on completion; rendered in `FileViewer` as a dedicated Quick Start section with copy button
- **`GET /api/cli-generator/[generationId]/test-mcp`** — static validation + config endpoint: runs py-validator or ts-validator on generated files, returns issues, Claude Desktop config JSON, and MCP server registration status
- **`MCPTestPanel` component** (`mcp-test-panel.tsx`) — shown after generation completes; renders validation badge, per-issue list (errors red, warnings amber), and ready-to-paste Claude Desktop config JSON with copy button

### Changed
- `PhaseResult` interface gains optional `modelUsed?: string` and `retryCount?: number` (backwards-compatible — existing DB rows without these fields deserialize cleanly)
- `FileViewer` is now shown during running state (live preview) in addition to completed state
- `advance/route.ts` runs Python validation + auto-fix after implement phase before subsequent phases consume the files

---

## [2.7.0] - 2026-03-26 — Eval Enhancements: CSV Export, Scheduled Runs & A/B Comparison

> 12 files · ~900 lines · 9 new unit tests · 0 breaking changes

### Added
- **CSV export** — per-run export (`GET /api/agents/[agentId]/evals/[suiteId]/run/[runId]/export`) and suite-level bulk export (`GET /api/agents/[agentId]/evals/[suiteId]/export?limit=50`); one row per assertion (N assertions × M test cases), proper RFC-4180 quoting, semicolon-joined tags
- **Scheduled eval runs** — `scheduleEnabled` + `scheduleCron` fields on `EvalSuite`; pure-JS 5-field cron matcher (`cronMatchesDate`) with no external deps; 4-minute double-run prevention; `POST /api/evals/scheduled` endpoint (CRON_SECRET protected) called by Railway Cron Service
- **Head-to-head A/B comparison** — `POST /api/agents/[agentId]/evals/[suiteId]/compare` runs two flow versions or two models back-to-back, computes `ComparisonDelta` (scoreDiff, latencyDiffMs, aWins, bWins, ties, winner), stores mutual `comparisonRunId` links
- **`EvalCompareView` component** — side-by-side summary bar (winner badge, score ring, delta ▲/▼) + per-case table with output A | score A | winner indicator | score B | output B
- **`TriggeredByBadge` component** in `EvalResultsView` — color-coded pill: zinc=manual, violet=deploy, amber=schedule, blue=compare
- **Export buttons** in `EvalResultsView` — "Export Run" and "Export All Runs" buttons trigger CSV downloads via `window.open()`
- **Schedule dialog** in Evals page — cron preset grid (daily 3am, every 6h, weekdays 9am, every Monday 8am, custom), enable/disable toggle, PATCH to suite API
- **Compare dialog** in Evals page — version vs model toggle, dropdown selectors for A and B, inline `EvalCompareView` results
- **`comparisonRunId`, `flowVersionId`, `modelOverride`** fields added to `EvalRun` Prisma model
- **`lastScheduledAt`**, `scheduleEnabled`, `scheduleCron` fields added to `EvalSuite` Prisma model
- **`evalFlowVersionId` + `evalModelOverride`** params in `/api/agents/[agentId]/chat` — replaces flow content with version snapshot or injects model override into all `ai_response` nodes
- **9 unit tests** for the CSV export route: auth, 404 cases, Content-Type/Disposition headers, row count, comma/quote escaping, semicolon tags, empty assertions, unicode

### Changed
- `EvalResultsView` now accepts `agentId` and `suiteId` props for export URL construction
- `RunEvalOptions.triggeredBy` extended with `"compare"` and `"schedule"` values
- `CreateEvalSuiteSchema` extended with `scheduleEnabled` and `scheduleCron` (validated cron regex)
- Suite sidebar shows ⏰ clock icon for suites with schedule enabled
- Suite dropdown menu has "Schedule runs" / "Edit schedule" item

---

## [2.6.0] - 2026-03-26 — Webhooks UI Upgrade

> 3 files · ~370 lines · 13 new unit tests · 0 breaking changes

### Added
- **Paginated executions API** — `GET /api/agents/[agentId]/webhooks/[webhookId]/executions` with cursor-based pagination (`cursor`, `limit` 1–50, `status` filter); `rawPayload` excluded from list response to save bandwidth (only used by replay endpoint)
- **13 unit tests** for the new executions endpoint: cursor logic, status filtering, 404/500 error handling, and rawPayload exclusion from Prisma select
- **Status filter pills** in Executions tab — All / Completed / Failed / Running; color-coded (green/red/blue); changing filter resets cursor and reloads from page 1
- **"N of M" counter** in Executions tab header — shows `20 of 143` so users always know total history depth
- **Load more button** — cursor-based append: shows remaining count, disabled while loading, replaces hard 20-item limit
- **Auto-refresh polling** — Executions tab refreshes every 10s while active (polling preferred over SSE for this use case: append-only log, no branching events)
- **TestPanel → Executions integration** — after a successful test send, the panel automatically switches to Executions tab and refreshes 2.5s later (backend processing time)
- **Webhook list search** — instant client-side filter input with clear button above the left panel list
- **Analytics summary bar** — success rate % next to trigger count, color-coded: ≥95% green, ≥80% amber, <80% red

### Changed
- Executions tab label now shows real filtered total: `Executions (143)` instead of the inline `_count` from the detail query
- RefreshCw icon in Executions tab header now animates (spin) while loading
- Empty state in Executions tab is filter-aware: "No failed executions" vs "No executions yet"

---

## [2.5.1] - 2026-03-26 — Docker GHCR Publishing

### Added
- Docker images published to `ghcr.io/webdevcom01-cell/agent-studio` on every push to `main` — tags: `latest` + `sha-<short>`
- Multi-platform builds: `linux/amd64` + `linux/arm64` (Apple Silicon support)
- PR build validation — Dockerfile is built but not pushed on pull requests, catching regressions before merge
- Supply chain attestation via `provenance: true` in `docker/build-push-action`
- GHCR image badge in README linking to `ghcr.io` package page
- `docker pull ghcr.io/webdevcom01-cell/agent-studio:latest` Option A in Quick Start

### Changed
- `docker.yml` workflow renamed to "Docker Build & Push"; timeout increased to 30 min for multi-platform builds

### Fixed
- Docker Build badge was misleading — image is now actually published and pullable

---

## [2.5.0] - 2026-03-26 — Template Expansion & Developer Experience

> 216 templates · 19 categories · 1700+ tests · `pnpm precheck` for pre-push CI

### Added
- **83 new agent templates** (133 → 216 total) across 8 new industry categories: `coding`, `data`, `finance`, `hr`, `paid-media`, `research`, `sales`, `writing`
- All existing categories expanded to a minimum of 8 templates (Dobro standard) — `marketing`, `product`, `project-management`, `spatial-computing`, `support` all brought up from 1–4 templates
- **`scripts/pre-push-check.sh`** — 4-phase local CI simulation: TypeScript check → targeted Vitest → Lucide icon mock check → placeholder string consistency
- **`pnpm precheck`** and **`pnpm precheck:file <path>`** scripts added to `package.json`

### Changed
- **README** — complete 2026-standards rewrite: CI + Docker Build + MCP Ready + A2A v0.3 badges; "What is Agent Studio?" problem/solution section; Supported AI Providers table (7 providers, 18 models); comparison table vs Flowise, n8n, LangFlow, Dify; updated Mermaid diagram (37 handlers, 87 routes); added Inbound Webhooks to feature list and comparison table
- **CLAUDE.md** — synced project context with all changes since v2.0.0: template counts (133 → 216), category counts (12 → 19), pre-push workflow section, `pnpm precheck` commands, `scripts/pre-push-check.sh` in folder structure

---

## [2.4.0] - 2026-03-25 — Visual Flow Debugger

> Real-time breakpoints · step-by-step execution · variable watch · trace history

### Added
- **Debug Panel** — collapsible sidebar in flow builder with node inspector, active variable state, and edge traversal view (Phase 1+2)
- **Execution Timeline** — chronological trace of all node executions per run with duration, input/output snapshot per step (Phase 4)
- **Trace Persistence** — `FlowTrace` Prisma model; `GET/POST /api/agents/[agentId]/traces`, `GET /api/agents/[agentId]/traces/[traceId]` routes; replay any historical execution (Phase 5)
- **Breakpoints & Step-by-Step** — set breakpoints on any node; pause, inspect, and resume execution mid-flow; `debug-controller.ts` runtime integration (Phase 6)
- **Variable Watch Panel** — live variable state during execution; in-flight edit support for variables before next node runs (Phase 7)
- **`/api/agents/[agentId]/debug`** — debug session management API
- **8 new builder components**: `debug-panel`, `debug-timeline`, `trace-history`, `debug-variable-watch`, `debug-toolbar`, `debug-node-overlay`, `use-debug-session` hook
- **`src/lib/runtime/debug-controller.ts`** — intercepts engine execution loop for breakpoint/step control
- **`src/lib/observability/tracer.ts`** — OpenTelemetry tracer wired into all AI response handlers

### Fixed
- ESLint errors in debug components blocking CI
- Missing component and API files from virtiofs-constrained commit

---

## [2.3.0] - 2026-03-24 — Open Source Launch & CLI

> Self-hostable via Docker · one-click Railway/Render deploy · `npx agent-studio-cli`

### Added
- **Docker support** — `Dockerfile` (Next.js standalone build), `docker-compose.yml` (app + PostgreSQL/pgvector + Redis), `docker-compose.override.yml` for local dev overrides
- **GitHub Actions CI/CD** — `ci.yml` (lint + typecheck + vitest + Playwright E2E), `docker.yml` (Docker build on every push to main), `docs.yml` (Docusaurus deploy to GitHub Pages)
- **`@agent-studio/cli` npm package** (`packages/cli/`) — v0.1.0, published to npm; commands: `agent-studio init` (scaffold new agent project), `agent-studio dev` (local dev server), `agent-studio build` (production build)
- **Docusaurus docs site** (`website/`) — deployed to GitHub Pages via `docs.yml`; includes platform overview, node reference, knowledge base guide, CLI generator, and agent evals documentation
- **One-click deploy buttons** in README — Railway template + Render deploy
- **Community files** — `CONTRIBUTING.md` (dev setup, PR guidelines, code style), `CODE_OF_CONDUCT.md`

---

## [2.2.0] - 2026-03-23 — Enterprise RAG Upgrade & Webhooks Replay

> 5 chunking strategies · per-KB config · RAGAS evaluation · webhook replay

### Added
- **Enterprise RAG pipeline** — 24 new features across 4 sprints:
  - 5 chunking strategies: `recursive`, `markdown`, `code` (auto-detect Python/TS/JS), `sentence`, `fixed`; tiktoken `cl100k_base` token counting; header injection per chunk
  - Per-KB configuration UI + API (`GET/PATCH /api/agents/[agentId]/knowledge/config`) — chunking strategy, embedding model, retrieval mode, reranking model, search thresholds
  - Multi-model embeddings: `text-embedding-3-small` (1536 dim) + `text-embedding-3-large` (3072 dim); Redis embedding cache (600s TTL); semaphore (max 3 concurrent calls)
  - Query transformation: HyDE (hypothetical document embedding), multi-query expansion (3 phrasings)
  - Metadata filtering: 10 operators (`eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `in`, `nin`, `contains`, `exists`), AND/OR groups, dot-notation paths
  - Context ordering: `relevance`, `lost-in-middle` (U-shaped, Liu et al. 2023), `chronological`, `diversity` (MMR-like)
  - Cohere Rerank v3.5 support alongside existing LLM-rubric reranker
  - Content deduplication via SHA-256 hash (saves embedding API cost)
  - Ingest progress tracking: 6 stages (parsing → chunking → dedup → embedding → storing → complete)
  - Document parsers: Excel/CSV (`xlsx`), PPTX (JSZip XML extraction) added alongside existing PDF/DOCX/HTML
  - RAGAS evaluation: 4 metrics (`faithfulness`, `contextPrecision`, `contextRecall`, `answerRelevancy`) via `POST /api/agents/[agentId]/knowledge/evaluate`
  - KB analytics: source/chunk stats, token distribution, top retrieved chunks — `GET /api/agents/[agentId]/knowledge/analytics`
  - Maintenance: dead chunk detection, cleanup, scheduled re-ingestion — `GET/POST /api/agents/[agentId]/knowledge/maintenance`
  - Embedding drift detection with model mismatch recommendation
- **Webhook execution replay** — re-trigger any past webhook execution with its stored payload via `POST /api/agents/[agentId]/webhooks/[webhookId]/replay`

---

## [2.1.0] - 2026-03-21 — Security & Infrastructure Hardening

> AES-256-GCM encryption · Redis rate limiting · multi-replica · circuit breakers

### Added
- **AES-256-GCM encryption at rest** — webhook secrets and OAuth tokens encrypted in DB; transparent decrypt on read
- **Redis-based sliding window rate limiter** — replaces in-memory fallback for cross-replica accuracy; Lua EVAL atomic increment
- **A2A circuit breaker hardening** — depth limit (max 3), visited-agent cycle detection, 33 new tests
- **Schedule failure notifications** — webhook callback on cron job failure with retry count and error detail
- **Instinct evolution** — AI clustering of instincts via `generateObject`, auto-promotion to Skill at ≥0.85 confidence
- **Obsidian vault integration** — GitHub API-backed read/write for persistent knowledge storage
- **Multi-replica deployment** — `numReplicas: 2` in `railway.toml`; rolling update strategy
- **Redis cluster** — cross-replica cache, session sharing, MCP pool coordination; `REDIS_URL` env var
- **CDN Cache-Control headers** — static assets get `public, max-age=31536000, immutable`
- **Database read replica** — analytics and `/discover` queries routed to read-only replica
- **FlowVersion cleanup job** — removes DRAFT versions older than 30 days to prevent DB bloat
- **OpenTelemetry tracing** — wired into all AI response handlers with `gen_ai.*` semantic conventions

### Fixed
- MCP Host header rewrite middleware for Railway TLS (replaced monkey-patch approach)
- NextAuth cookie pinning and fallback detection for cross-replica session stability
- ECC production activation with `ECC_ENABLED` health monitoring guard

---

## [2.0.0] - 2026-03-19 — ECC Integration

### Added
- **Phase 0 — Prisma Schema Foundation**: AgentExecution, Skill, AgentSkillPermission, Instinct, AuditLog models with enums (ExecutionStatus, AccessLevel)
- **Phase 1 — Developer Agents**: 25 ECC agent templates imported as new "Developer Agents" category. Model routing: Opus (planner, architect), Sonnet (code-reviewer, tdd-guide), Haiku (doc-updater, test-writer)
- **Phase 2 — Skills Ingestion**: 60 skill modules parsed from SKILL.md, stored in Skill model, vectorized into KB (255 chunks). Skills Browser UI at `/skills` with faceted search
- **Phase 3 — Meta-Orchestrator**: Autonomous agent routing with 4 flow templates (TDD Pipeline, Full Dev Workflow, Security Audit, Code Review Pipeline)
- **Phase 4 — ECC Skills MCP Server**: Python FastMCP server as separate service. Tools: get_skill, search_skills, list_skills. Streamable HTTP on `/mcp` path
- **Phase 5 — Continuous Learning**: Instinct engine with confidence scoring (0.0-1.0), Learn node for pattern extraction, `/api/skills/evolve` endpoint, auto-promotion at 0.85 confidence
- **Phase 6 — Observability**: OpenTelemetry-compatible tracing and metrics with gen_ai.* semantic conventions
- **Phase 7 — Security Hardening**: Audit logging (AuditLog model), RBAC enforcement (AgentSkillPermission), prompt injection defense
- **Phase 8 — Performance Optimization**: k6 load tests, caching strategy (skill metadata 10min, KB search 2min), SLA targets (P95 <5s flow, P99 <2s KB search)
- **Phase 9 — Production Deploy**: Feature flags (ECC_ENABLED opt-in), rollback procedures, Obsidian onboarding documentation
- Virtual Agent/KB/Source chain for skill vectorization (FK constraint resolution)

### Fixed
- ECC_ENABLED defaults to `false` (opt-in) for safe Railway deploy
- FastMCP kwargs compatibility (removed unsupported description, stateless_http, json_response)
- Starlette lifespan and lightweight `/health` endpoint for MCP server
- Virtual source FK constraint for KBChunk during skill vectorization

---

## [1.5.0] - 2026-03-10 — Inbound Webhooks

### Added
- Standard Webhooks spec implementation (HMAC-SHA256 signatures, timestamp verification)
- Public trigger endpoint: `POST /api/agents/[agentId]/trigger/[webhookId]`
- `webhook_trigger` node type as flow entry-point
- Auto-sync webhooks on flow deploy (`syncWebhooksFromFlow`)
- Provider presets: GitHub, Stripe, Slack, Generic with pre-configured mappings
- Event filtering with header-first resolution (x-github-event, x-slack-event, etc.)
- Idempotency via WebhookExecution model (unique x-webhook-id)
- Webhook management UI at `/webhooks/[agentId]` with two-panel layout and 3 tabs
- Secret rotation endpoint
- Body mapping: JSONPath, dot notation, bracket notation
- Slack URL verification handler
- Rate limiting: 60 req/min per webhookId
- Playwright E2E test suite for webhooks
- 77 unit tests (verify, execute, handler, sync)

---

## [1.4.0] - 2026-03-05 — CLI Generator TypeScript Support

### Added
- TypeScript/Node.js MCP SDK target for CLI Generator (dual-target with Python FastMCP)
- TypeScript bridge using `child_process.spawnSync` with typed `BridgeResult` interface
- Vitest test generation for TypeScript target
- 8 generated files: index.ts, bridge.ts, server.ts, bridge.test.ts, server.test.ts, package.json, tsconfig.json, README.md
- `TSPublishOutputSchema` for TypeScript publish phase
- `extractTypeScriptSignatures` for server.registerTool() detection
- Target selection UI with Py/TS badge display

---

## [1.3.0] - 2026-02-25 — Schedule Triggers

### Added
- `schedule_trigger` node type (cron/interval/manual modes)
- Prisma models for cron scheduling
- API routes with cron validator and live preview UI
- Cron execution engine
- Observability and security for schedule management
- Schedule UI with node badges, enable/disable toggle, execution history
- Auto-sync schedules on deploy with starter flow templates

---

## [1.2.0] - 2026-02-15 — Agent Evals Framework

### Added
- 3-layer evaluation: deterministic, semantic similarity, LLM-as-Judge
- 12 assertion types: exact_match, contains, icontains, not_contains, regex, starts_with, json_valid, latency, semantic_similarity, llm_rubric, kb_faithfulness, relevance
- Eval runner with sequential execution and progress tracking
- Deploy hook (fire-and-forget, runs suites with `runOnDeploy` flag)
- Eval suite editor UI with trend charts (recharts)
- AI eval suite generator and standards browser
- 100+ unit tests across assertions, semantic, LLM-judge, runner, deploy-hook

### Fixed
- KB context population in eval runner for kb_faithfulness assertions
- PostgreSQL cast in expandChunksWithContext

---

## [1.1.0] - 2026-02-01 — Platform Enhancements

### Added
- Agent marketplace and discovery at `/discover` with faceted search
- 112 agent templates across 11 categories
- Agent-as-tool orchestration (AI dynamically calls sibling agents)
- A2A protocol (Google A2A v0.3) with agent cards and task communication
- MCP integration with Streamable HTTP + SSE, connection pooling, tool filtering
- Web browsing capabilities (web_fetch + browser_action nodes)
- Embeddable chat widget (`public/embed.js`)
- Flow versioning and deploy pipeline (DRAFT/PUBLISHED/ARCHIVED)
- Human approval workflow (human_approval node)
- Analytics dashboard with response time charts
- Agent memory (read/write nodes with semantic search)
- Parallel execution and loop nodes

---

## [1.0.0] - 2026-01-15 — Initial Release

### Added
- Visual flow builder with 32 node types (@xyflow/react v12)
- Knowledge Base with RAG pipeline (chunk, embed, pgvector hybrid search)
- Streaming chat interface (NDJSON protocol with heartbeat)
- CLI Generator (6-phase AI pipeline, Python FastMCP target)
- Multi-provider AI: DeepSeek, OpenAI, Anthropic, Google Gemini, Groq, Mistral, Moonshot/Kimi
- 18 models across 7 providers, tiered (fast/balanced/powerful)
- OAuth authentication (GitHub + Google via NextAuth v5)
- Security: CSRF protection, rate limiting, SSRF protection, input validation, body size limits
- Agent export/import (versioned JSON format)
- 1000+ unit tests, 7 E2E spec files
- Railway deployment configuration
