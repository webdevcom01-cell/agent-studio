# Pre-Push Validation

Run the full pre-push check pipeline — same as CI. All 4 checks must pass before pushing.

## Usage
`/precheck` — full check
`/precheck src/lib/knowledge/search.ts` — check specific file only

## Instructions

### Full precheck
Run: `pnpm precheck`

This executes in sequence:
1. TypeScript check (`pnpm typecheck`)
2. Targeted Vitest run
3. Lucide icon mock validation
4. Placeholder string consistency check

### File-specific check
Run: `pnpm precheck:file <path>`

Example: `pnpm precheck:file src/lib/runtime/handlers/ai-response-handler.ts`

### On failure — fix in this order

**TypeScript errors** → Run `/fix-types` command

**Test failures** →
- Read the failing test carefully
- Read the implementation it's testing
- Fix the implementation (not the test) unless the test expectation is genuinely wrong
- Re-run: `pnpm test -- --testNamePattern="failing test name"`

**Lucide mock check** →
- The project uses a vitest mock for lucide-react
- If you added a new lucide icon import, add it to the mock in `vitest.setup.ts`

**Placeholder string check** →
- Find any TODO, FIXME, or placeholder strings left in committed code
- Remove or resolve them

### Final gate
Run: `pnpm precheck`
All 4 items must show `PASS` before any git push.

Output format expected:
```
[1/4] TypeScript check... PASS
[2/4] Vitest targeted... PASS
[3/4] Lucide mock check... PASS
[4/4] String consistency... PASS
✅ All checks passed — safe to push
```
