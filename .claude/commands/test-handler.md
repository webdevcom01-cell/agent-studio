# Test a Specific Handler

Run and analyze tests for a specific node handler.

## Usage
`/test-handler <handler-name>`

Example: `/test-handler ai-response` or `/test-handler kb-search`

## Instructions

### Step 1 — Find test file
Check if test exists: `src/lib/runtime/handlers/__tests__/<handler-name>-handler.test.ts`

If it doesn't exist, say: "No test file found. Run `/new-handler` to scaffold one, or I can write the tests now."

### Step 2 — Run the tests
```bash
pnpm test -- --testNamePattern="<handler-name>" 2>&1
```

Or run the specific file:
```bash
pnpm test src/lib/runtime/handlers/__tests__/<handler-name>-handler.test.ts 2>&1
```

### Step 3 — Analyze results

**All passing** → Report: `✅ All tests pass — N tests, N assertions`

**Failures** →
- Quote the exact failing test name and assertion
- Read the handler implementation
- Read the test expectation
- Determine: is the test wrong or is the implementation wrong?
- Fix the implementation first — only change tests if the expectation is genuinely incorrect

**Missing coverage** → Identify and report:
- Untested error paths (what happens if a dep throws?)
- Untested edge cases (empty input, null values, missing config)
- Untested variable updates (does `updatedVariables` get populated correctly?)

### Step 4 — Coverage check
After fixing, re-run and confirm:
```bash
pnpm test -- --coverage src/lib/runtime/handlers/__tests__/<handler-name>-handler.test.ts
```

Target: >80% line coverage for handler files.

### Step 5 — Report
```
## Test Results — <handler-name> handler

Tests: N passing, N failing
Coverage: N%

### Failures
- [test name]: [expected vs actual]
- Fix applied: [description]

### Missing coverage
- Error path: [description]
- Edge case: [description]
```
