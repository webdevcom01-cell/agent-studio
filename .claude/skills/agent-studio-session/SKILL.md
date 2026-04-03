---
name: agent-studio-session
description: >
  Session management protocol for the agent-studio project. Use this skill
  at the START of every session and whenever picking a new task to implement.
  Also use it before any file write/edit operation and when git errors occur.
  Triggers on: "start session", "let's work on", "pick a task", "which task",
  "continue working", "nastavimo", "nastavi", "šta radimo", "počnimo",
  as well as any time a new Cowork conversation begins on this project.
---

# Agent Studio Session Protocol

This project is `agent-studio` — a large Next.js 15 + Prisma codebase. Sessions
frequently continue work from previous conversations. Following this protocol
prevents wasted tokens, file operation errors, and git lock failures.

---

## 1. Session Startup (do this first, every time)

**Step 1 — Read project state**

Before writing a single line of code, read these two files:

```
Read: /sessions/dazzling-brave-edison/mnt/agent-studio/CLAUDE.md   (project overview)
Read: /sessions/dazzling-brave-edison/mnt/agent-studio/TASKS.md    (pending work)
```

CLAUDE.md is large (~800 lines). Skim it — you need the tech stack, folder structure,
and conventions. TASKS.md is the authoritative task list — read it fully.

**Step 2 — Identify the task**

Ask the user which TASKS.md item to work on, or confirm the one they named.
Never start implementation without explicit task confirmation.
TASKS.md uses this format:
```
[ ] pending   [~] in progress   [x] done   [!] blocked
```

Show the user the task description and ask: "This one?" before proceeding.

**Step 3 — Scope check**

Before starting, ask yourself:
- Does this task require new Prisma models? → Need `pnpm db:push` after
- Does this add a new node handler? → 7 steps required (see CLAUDE.md §8)
- Does this touch the runtime engine? → Read `src/lib/runtime/engine.ts` first
- Does this touch streaming? → Read both `engine-streaming.ts` and `stream-protocol.ts`

---

## 2. File Operation Pre-flight (mandatory checks)

### Before every `Write` call:
```bash
ls /path/to/directory/    # confirm parent exists
ls /path/to/file 2>&1     # check if file already exists
```
If the file exists → use `Edit`, not `Write`.
If the file doesn't exist → `Write` is safe.

**Why this matters**: `Write` on an existing file requires reading it first
(tool enforcement). Skipping this check causes a tool error that wastes tokens.

### Before every `Edit` call:
- You must have called `Read` on that file in this conversation.
- If you haven't read it yet → `Read` it first, then `Edit`.
- Never guess at existing content. Read it, then make precise edits.

### For large new files (>100 lines):
Ask the user first: "This will be ~N lines — should I write it all now or
build it incrementally?" One sentence is enough. Don't spend tokens writing
content the user may not want at that detail level.

---

## 3. Git Lock Recovery (virtiofs-specific)

On virtiofs mounts, git sometimes leaves lock files that it cannot delete itself.
When you see: `fatal: Unable to create '.git/index.lock': File exists` or similar:

```
# Step 1: overwrite the lock with a space (makes it non-empty and movable)
Desktop_Commander.write_file(
  path="/sessions/dazzling-brave-edison/mnt/agent-studio/.git/index.lock",
  content=" "
)

# Step 2: rename it away (pick next bak suffix — check existing ones first)
ls /sessions/dazzling-brave-edison/mnt/agent-studio/.git/*.bak* 2>/dev/null
Desktop_Commander.move_file(
  source=".git/index.lock",
  destination=".git/index.lock.bakN"   # N = next unused number
)
```

Same procedure for `HEAD.lock`, `MERGE_HEAD.lock`, etc.
Do NOT use `rm` — it fails on virtiofs. Always use write + move.

After recovery, verify: `git status` should work cleanly.

---

## 4. Token Discipline

**Before spawning subagents (Explore/general-purpose agents):**
- Can you answer this with 1-2 targeted `Read` + `Grep` calls? → Do that instead.
- Only spawn agents for genuinely open-ended searches or multi-file audits.
- Never spawn two agents to do the same thing in parallel unless you need both perspectives.

**Before writing long documents (>50 lines):**
- Ask the user: "How much detail do you want here?"
- One sentence question. Wait for answer.

**When research is done:**
- State findings in 3-5 bullet points maximum before asking what to implement.
- Don't write implementation proposals unless asked.

**Code changes:**
- Make targeted edits. Don't rewrite files that only need 5-line changes.
- After each logical chunk of work, run `pnpm precheck` (or `pnpm precheck:file <path>`).
  All 4 checks (TS + vitest + lucide mocks + strings) must pass before committing.

---

## 5. Task Lifecycle

When you start a task, update its marker in TASKS.md:
```
[ ] → [~]   (when starting)
[~] → [x]   (when done and precheck passes)
[~] → [!]   (if blocked — add a note explaining why)
```

Use `Edit` to update the single character. Don't rewrite the whole file.

When a task is complete:
1. Mark `[x]` in TASKS.md
2. Run `pnpm precheck` — fix all failures
3. `git add` specific files (not `-A`)
4. `git commit` with descriptive message
5. `git push`
6. If git locks occur → apply the recovery procedure above

---

## 6. Project Quick Reference

| Need | Location |
|------|----------|
| Add node type | CLAUDE.md §8 "Adding a New Node Type" (7 steps) |
| Add API route | CLAUDE.md §8 "Adding a New API Route" |
| Model routing | `src/lib/ai.ts` + `src/lib/models.ts` |
| Runtime handlers | `src/lib/runtime/handlers/` |
| Prisma models | `prisma/schema.prisma` (never edit generated/) |
| Import pattern | Always `@/lib/...` not relative `../../../` |
| Styling | Tailwind v4 only — no inline styles, no CSS modules |
| Toast | `import { toast } from 'sonner'` |
| Logger | `import { logger } from '@/lib/logger'` — never console.log |

**Key constraints:**
- No `any` type. No `@ts-ignore`. No `console.log` in committed code.
- Import from `@/generated/prisma`, never from `@prisma/client`
- pnpm only — never npm or yarn
