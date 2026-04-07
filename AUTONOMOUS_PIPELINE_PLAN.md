# Autonomous SDLC Pipeline — Implementation Plan

**Cilj:** specs → kod → test → staging → production bez ručne intervencije
**Osnova:** Desktop Commander MCP (file write + shell) + Vercel MCP (deploy)
**Novi node tipovi:** `file_writer` · `process_runner` · `git_node` · `deploy_trigger`

---

## Arhitektura flow-a

```
[project_context]
      ↓
[ai_response outputSchema=CodeGenOutput] → codeOutput
      ↓
[sandbox_verify inputVariable=codeOutput]
    passed ↓              failed ↓
[file_writer]      [set_variable retry_count += 1]
      ↓                   ↓
[process_runner    [condition: retry_count >= 3]
  cmd="pnpm build"]   yes ↓        no ↓
    passed ↓      [message FAILED] [ai_response retry+errors]
[process_runner                          ↑ (loop back to sandbox_verify)
  cmd="pnpm test"]
    passed ↓       failed ↓
[git_node]   [set_variable test_retry += 1]
      ↓             ↓
[deploy_trigger [condition: test_retry >= 3]
  target=staging]  yes ↓       no ↓
    passed ↓  [message FAILED] [ai_response fix+test_errors]
[process_runner cmd="smoke tests"]
    passed ↓
[human_approval]   ← jedina tačka gde čovek interveniše
      ↓ approved
[deploy_trigger target=production]
      ↓
[message "✅ Deployed to production"]
```

---

## Faza 1 — Novi Zod schemai

**Fajl:** `src/lib/sdlc/schemas.ts` (dodati na kraj)

```typescript
// ─── Process Run Output ───────────────────────────────────────────────────────
export const ProcessRunOutputSchema = z.object({
  success: z.boolean(),
  command: z.string(),
  stdout: z.string().default(""),
  stderr: z.string().default(""),
  exitCode: z.number().default(0),
  durationMs: z.number().default(0),
});
export type ProcessRunOutput = z.infer<typeof ProcessRunOutputSchema>;

// ─── File Write Output ────────────────────────────────────────────────────────
export const FileWriteOutputSchema = z.object({
  filesWritten: z.array(z.string()),
  errors: z.array(z.string()).default([]),
  targetDir: z.string(),
  success: z.boolean(),
});
export type FileWriteOutput = z.infer<typeof FileWriteOutputSchema>;

// ─── Git Output ───────────────────────────────────────────────────────────────
export const GitOutputSchema = z.object({
  branch: z.string(),
  commitHash: z.string().optional(),
  pushed: z.boolean().default(false),
  success: z.boolean(),
  message: z.string(),
});
export type GitOutput = z.infer<typeof GitOutputSchema>;

// ─── Deploy Output ────────────────────────────────────────────────────────────
export const DeployOutputSchema = z.object({
  deploymentId: z.string(),
  url: z.string(),
  status: z.enum(["READY", "ERROR", "BUILDING", "CANCELED"]),
  target: z.enum(["staging", "production"]),
  durationMs: z.number().default(0),
  logs: z.string().default(""),
});
export type DeployOutput = z.infer<typeof DeployOutputSchema>;
```

Dodati u `SCHEMA_REGISTRY`:
```typescript
ProcessRunOutput: ProcessRunOutputSchema,
FileWriteOutput: FileWriteOutputSchema,
GitOutput: GitOutputSchema,
DeployOutput: DeployOutputSchema,
```

---

## Faza 2 — Registracija node tipova

### 2a. `src/types/index.ts` — dodati u NodeType union

```typescript
| "file_writer"
| "process_runner"
| "git_node"
| "deploy_trigger"
```

### 2b. `src/lib/validators/flow-content.ts` — dodati u NODE_TYPES array

```typescript
"file_writer",
"process_runner",
"git_node",
"deploy_trigger",
```

---

## Faza 3 — Handler implementacije

### 3a. `src/lib/runtime/handlers/file-writer-handler.ts` (NOVI FAJL)

**Logika:**
- Uzima `inputVariable` (default: `codeOutput`) — očekuje `CodeGenOutput` objekat
- Za svaki fajl u `data.files[]`: kreira direktorijum + upisuje sadržaj **direktno sa Node.js `fs`** (isti pattern kao sandbox_verify koji koristi `writeFileSync`)
- `targetDir` (node.data.targetDir) — apsolutna putanja projekta na disku
- Vraća `FileWriteOutput` u `outputVariable` (default: `fileWriteResult`)
- `nextNodeId: node.data.nextNodeId`
- ⚠️ **Nema Desktop Commander zavisnosti** — fs direktno, radi i bez MCP konfiguracije

**Implementacija:**
```typescript
import { mkdirSync, writeFileSync } from "fs";
import { join, dirname } from "path";

for (const file of files) {
  const fullPath = join(targetDir, file.path);
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, file.content, "utf-8");
  filesWritten.push(fullPath);
}
```

**Grešku** → vraća `{ success: false, filesWritten: [], errors: [...] }`, `nextNodeId: node.data.onErrorNodeId ?? null`

### 3b. `src/lib/runtime/handlers/process-runner-handler.ts` (NOVI FAJL)

**Logika:**
- `node.data.command` — shell komanda (npr. `pnpm build`, `pnpm test`)
- `node.data.workingDir` — direktorijum u kome se pokreće (setovati kao `cwd` u execFile)
- `node.data.timeoutMs` (default: 300_000 = 5min — duže od `runVerificationCommands` jer build može trajati)
- ⚠️ **Reuse `runVerificationCommands`** iz `src/lib/runtime/verification-commands.ts` — već postoji, koristi `execFile` sa whitelistom (pnpm, npm, vitest, tsc... su dozvoljena)
- **Ali:** `runVerificationCommands` ima hardkodovani 60s timeout — trebamo `node.data.timeoutMs` da override-uje to. Dodati opcioni `timeoutMs` parametar u `runVerificationCommands` signature.
- Parsira `allPassed` → `success`
- Vraća `ProcessRunOutput` u `outputVariable` (default: `processResult`)
- **Handle-based routing:** `nextNodeId: success ? "passed" : "failed"` (isti pattern kao sandbox_verify)
- Dodati u `SELF_ROUTING_NODES` u `engine.ts`

**Izmena u `verification-commands.ts`** (manja):
```typescript
// Dodati timeoutMs parametar (default: 60_000)
export async function runVerificationCommands(
  commands: string[],
  agentId: string,
  timeoutMs = 60_000,   // ← novi parametar
): Promise<...>
// Proslijediti u execFileAsync: { timeout: timeoutMs, ... }
```

### 3c. `src/lib/runtime/handlers/git-node-handler.ts` (NOVI FAJL)

**Logika:**
- `node.data.workingDir` — repo putanja
- `node.data.branch` (default: `feat/autonomous-{{timestamp}}`)
- `node.data.commitMessage` — podržava `{{varijable}}`
- `node.data.operations[]` — niz koraka: `checkout_branch | add | commit | push`
- ⚠️ **`git` NIJE u `ALLOWED_COMMAND_PREFIXES` whitelistu** — ne može koristiti `runVerificationCommands`
- Koristiti **sopstveni `execFile`** direktno u handleru (git zahteva token auth, odvojena logika)
- Vraća `GitOutput` u `outputVariable` (default: `gitResult`)
- `nextNodeId: node.data.nextNodeId`

**Implementacija:**
```typescript
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const execFileAsync = promisify(execFile);

const gitEnv = {
  ...process.env,
  GIT_TERMINAL_PROMPT: "0",   // sprečava interactive prompt
  ...(process.env.GIT_TOKEN
    ? { GIT_ASKPASS: "echo", GIT_TOKEN: process.env.GIT_TOKEN }
    : {}),
};

// Redosled operacija:
await execFileAsync("git", ["checkout", "-B", branch], { cwd: workingDir, env: gitEnv });
await execFileAsync("git", ["add", "-A"], { cwd: workingDir, env: gitEnv });
await execFileAsync("git", ["commit", "-m", commitMessage], { cwd: workingDir, env: gitEnv });
await execFileAsync("git", ["push", "origin", branch], { cwd: workingDir, env: gitEnv });
```

### 3d. `src/lib/runtime/handlers/deploy-trigger-handler.ts` (NOVI FAJL)

**Logika:**
- `node.data.target` — `"staging"` ili `"production"`
- `node.data.projectId` — Vercel project ID (iz env ili node config)
- `node.data.branch` — git branch za deploy (čita iz `gitResult.branch` varijable)
- `node.data.pollIntervalMs` (default: 5000)
- `node.data.timeoutMs` (default: 300_000 = 5min)
- ⚠️ **Vercel REST API direktno** — ne zavisi od per-agent MCP konfiguracije
- Vraća `DeployOutput` u `outputVariable` (default: `deployResult`)
- **Handle-based routing:** `nextNodeId: status === "READY" ? "passed" : "failed"`
- Dodati u `SELF_ROUTING_NODES` u `engine.ts`

**Implementacija (Vercel REST API):**
```typescript
const VERCEL_TOKEN = process.env.VERCEL_TOKEN;

// 1. Pokreni deployment
const deployRes = await fetch("https://api.vercel.com/v13/deployments", {
  method: "POST",
  headers: { Authorization: `Bearer ${VERCEL_TOKEN}`, "Content-Type": "application/json" },
  body: JSON.stringify({
    name: projectId,
    gitSource: { type: "github", ref: branch },
    target: target === "production" ? "production" : undefined,
  }),
});
const { id: deploymentId, url } = await deployRes.json();

// 2. Polling dok nije READY ili ERROR
while (elapsed < timeoutMs) {
  const statusRes = await fetch(`https://api.vercel.com/v13/deployments/${deploymentId}`, {
    headers: { Authorization: `Bearer ${VERCEL_TOKEN}` },
  });
  const { readyState } = await statusRes.json();
  if (readyState === "READY" || readyState === "ERROR") break;
  await sleep(pollIntervalMs);
}
```

---

## Faza 4 — Registracija u engine

### 4a. `src/lib/runtime/handlers/index.ts`

```typescript
import { fileWriterHandler } from "./file-writer-handler";
import { processRunnerHandler } from "./process-runner-handler";
import { gitNodeHandler } from "./git-node-handler";
import { deployTriggerHandler } from "./deploy-trigger-handler";

// U handlers Record:
file_writer: fileWriterHandler,
process_runner: processRunnerHandler,
git_node: gitNodeHandler,
deploy_trigger: deployTriggerHandler,
```

### 4b. `src/lib/runtime/engine.ts` — SELF_ROUTING_NODES

```typescript
// Dodati uz sandbox_verify:
"process_runner",
"deploy_trigger",
```

---

## Faza 5 — UI komponente (Builder)

Za svaki novi node tip, 4 fajla:

### 5a. Node display komponente (novi fajlovi)

`src/components/builder/nodes/file-writer-node.tsx`
`src/components/builder/nodes/process-runner-node.tsx`
`src/components/builder/nodes/git-node-node.tsx`
`src/components/builder/nodes/deploy-trigger-node.tsx`

**Pattern** — kopirati `sandbox-verify-node.tsx` kao osnovu, promeniti ikonu i label.

### 5b. `src/components/builder/flow-builder.tsx` — NODE_TYPES map

```typescript
file_writer: FileWriterNode,
process_runner: ProcessRunnerNode,
git_node: GitNodeNode,
deploy_trigger: DeployTriggerNode,
```

### 5c. `src/components/builder/node-picker.tsx` — dodati u "Execution" kategoriju

```typescript
{ type: "file_writer",     label: "File Writer",     icon: FileCode2,    desc: "Write CodeGenOutput files to disk" },
{ type: "process_runner",  label: "Process Runner",  icon: Terminal,     desc: "Run shell command (build/test)" },
{ type: "git_node",        label: "Git",             icon: GitBranch,    desc: "Commit and push to repository" },
{ type: "deploy_trigger",  label: "Deploy",          icon: Rocket,       desc: "Deploy to Vercel staging/production" },
```

### 5d. `src/components/builder/property-panel.tsx`

Dodati property editore za svaki node tip. Dodati u `OUTPUT_VAR_TYPES`:
```typescript
"file_writer", "process_runner", "git_node", "deploy_trigger"
```

---

## Faza 6 — Testovi

Kreirati za svaki handler:

```
src/lib/runtime/handlers/__tests__/file-writer-handler.test.ts
src/lib/runtime/handlers/__tests__/process-runner-handler.test.ts
src/lib/runtime/handlers/__tests__/git-node-handler.test.ts
src/lib/runtime/handlers/__tests__/deploy-trigger-handler.test.ts
```

**Obavezni test case-ovi po handleru:**
1. Happy path — validan input, uspešno izvršavanje
2. Missing/empty node data — graceful fallback, ne baca grešku
3. Desktop Commander / Vercel MCP baca grešku → handler vraća error message, NE throws

**Ažurirati node count:**
`src/components/builder/__tests__/node-picker.test.tsx` — linija 168:
```typescript
// Promeniti:
expect(NODE_DEFINITIONS.length).toBe(61);
// U:
expect(NODE_DEFINITIONS.length).toBe(65);
```

---

## Faza 7 — Flow template u bazi

Python skripta `scripts/create-autonomous-pipeline-flow.py`:

```python
# Kreira novi agent u Railway DB sa imenom "Autonomous Pipeline"
# Flow nodes: project_context → ai_response(CodeGenOutput) → sandbox_verify
#           → file_writer → process_runner(build) → process_runner(test)
#           → git_node → deploy_trigger(staging) → human_approval
#           → deploy_trigger(production) → message
# Edges: handle-based routing za sandbox_verify, process_runner, deploy_trigger
# outputSchema konfigurisan na ai_response nodu
```

---

## Redosled implementacije (preporučen)

```
[ ] Faza 1  — Zod schemai u sdlc/schemas.ts (15 min)
[ ] Faza 2  — types.ts + flow-content.ts registracija (5 min)
[ ] Faza 4b — SELF_ROUTING_NODES u engine.ts (2 min)
[ ] PATCH   — verification-commands.ts: dodati timeoutMs parametar (5 min)
[ ] Faza 3a — file-writer-handler.ts — Node.js fs direktno (30 min)
[ ] Faza 3b — process-runner-handler.ts — reuse runVerificationCommands (30 min)
[ ] Faza 3c — git-node-handler.ts — vlastiti execFile (30 min)
[ ] Faza 3d — deploy-trigger-handler.ts — Vercel REST API (45 min)
[ ] Faza 4a — Registracija u handlers/index.ts (5 min)
[ ] Faza 5  — UI komponente (4 node tipova) (60 min)
[ ] Faza 6  — Testovi + node-picker count 61→65 (60 min)
[ ] Faza 7  — Flow template skripta sa retry mehanizmom (30 min)
[ ] pnpm precheck — TypeScript + vitest + lucide mocks
```

**Ukupna procena:** ~5.5 sati fokusiranog rada

---

## Zavisnosti i rizici

| Rizik | Mitigacija |
|-------|-----------|
| Desktop Commander MCP nije dostupan u Railway (production) | Handlers detektuju MCP nedostupnost i vraćaju graceful error — ne blokiraju flow |
| Vercel deploy timeout | `timeoutMs` konfigurabilno po nodu, default 5min |
| Git push bez kredencijala | Čitati `GIT_TOKEN` iz env varijabli, dokumentovati u README |
| Beskonačna petlja (test uvek faili) | `retry_count` varijabla + `condition` node koji staje posle 3 pokušaja |
| Fajlovi upisani ali build faili | `file_writer` čuva listu upisanih fajlova — git_node ih može revertovati |

---

## Env varijable koje treba dodati

```env
# .env.local
AUTONOMOUS_PIPELINE_TARGET_DIR=/apsolutna/putanja/do/projekta
GIT_TOKEN=ghp_...
VERCEL_TOKEN=...           # već postoji ako Vercel MCP radi
VERCEL_PROJECT_ID=...      # iz Vercel dashboard-a
```
