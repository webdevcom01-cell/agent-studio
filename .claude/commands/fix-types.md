# Fix TypeScript Errors

Find and fix all TypeScript errors in the codebase.

## Usage
`/fix-types` — fix all errors
`/fix-types src/lib/knowledge/` — fix errors in specific directory

## Instructions

### Step 1 — Get full error list
Run: `pnpm typecheck 2>&1`

Capture all errors. Count them. Group by file.

### Step 2 — Prioritize by impact
Fix in this order:
1. `src/lib/` — shared utilities (fixing here fixes many downstream errors)
2. `src/app/api/` — API routes
3. `src/components/` — UI components
4. `src/app/` — pages

### Step 3 — For each error, apply the correct fix

**`any` type** → NEVER use `any`. Find the actual type:
- Check what the value is at runtime
- Look at Prisma schema for DB types
- Use `unknown` + type guard if truly unknown
- Use proper interface/type from the codebase

**`as any` cast** → Replace with proper type or `as unknown as TargetType` only as last resort

**Missing property on type** → Add to interface or use optional chaining

**Argument type mismatch** → Fix caller or add overload, never cast to bypass

**Prisma Json field** → Use `Prisma.JsonValue` or define a typed helper that casts safely

**`params` not awaited** → Change `{ params }` to `{ params }: { params: Promise<...> }` and add `const x = await params`

### Step 4 — Verify after each file
After fixing each file: `pnpm typecheck 2>&1 | grep "error TS" | wc -l`

Error count should decrease. If it increases, you introduced a new error — revert that file.

### Step 5 — Final verification
Run: `pnpm typecheck`
Must show: `Found 0 errors`

### Rules
- NEVER use `: any` — this is a hard project rule
- NEVER use `@ts-ignore` — fix the actual problem
- NEVER use `// @ts-expect-error` unless the third-party type is genuinely wrong and you add a comment explaining why
- If a type error is in `src/generated/` → stop, never edit generated files, report the issue
