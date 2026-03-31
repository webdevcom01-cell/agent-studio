# Fix ESLint Errors

Find and fix all ESLint errors in the codebase.

## Usage
`/fix-lint` — fix all
`/fix-lint src/lib/runtime/` — fix specific directory

## Instructions

### Step 1 — Get full error list
Run: `pnpm lint 2>&1`

Count errors. Note which rules are failing.

### Step 2 — Auto-fixable errors first
Run: `pnpm lint --fix 2>&1`

This resolves: import ordering, trailing commas, spacing, quotes, semicolons.
Re-run lint to see remaining non-auto-fixable errors.

### Step 3 — Fix remaining errors by category

**`no-console`** → Replace `console.log/warn/error` with:
- Server code: `logger.info/warn/error()` from `@/lib/logger`
- Client code: Remove entirely or use a conditional `if (process.env.NODE_ENV === 'development')`

**`@typescript-eslint/no-unused-vars`** → Remove unused imports and variables. Prefix intentionally unused params with `_` (e.g. `_req`).

**`@typescript-eslint/no-explicit-any`** → Same as fix-types — replace with real type.

**`react-hooks/exhaustive-deps`** → Add missing dependencies to useEffect/useCallback/useMemo dependency arrays. If adding the dep would cause an infinite loop, use `useRef` to store the stable reference.

**`import/no-cycle`** → Circular imports. Refactor to break the cycle — usually means extracting shared types to a separate file.

**`@next/next/no-img-element`** → Replace `<img>` with Next.js `<Image>` from `next/image`.

### Step 4 — Verify
Run: `pnpm lint`
Must show: no errors, only warnings allowed.

### Rules
- NEVER use `// eslint-disable` comments to suppress errors — fix the actual problem
- NEVER use `// eslint-disable-next-line` unless it's a third-party code issue with documented reason
- Warnings are acceptable; errors are not
