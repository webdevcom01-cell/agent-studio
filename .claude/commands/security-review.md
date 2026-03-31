# Security Review

Perform a focused security review of specific files or the entire API layer.

## Usage
`/security-review` — full API security audit
`/security-review src/app/api/agents/[agentId]/chat/` — specific route

## Instructions

### Step 1 — Auth guard coverage
For every file in `src/app/api/`:
- Does each handler call `requireAgentOwner()` or `requireAuth()`?
- Is `isAuthError(result)` checked before accessing `result.userId`?
- Any route that should be public must be listed in `src/middleware.ts` public paths

```typescript
// ✅ Correct pattern
const authResult = await requireAgentOwner(agentId);
if (isAuthError(authResult)) return authResult;
const { userId } = authResult;

// ❌ Wrong — raw auth() bypass
const session = await auth();
```

### Step 2 — Input validation
For every POST/PATCH/PUT handler:
- Is request body parsed with Zod before use?
- Are path params (`agentId`, etc.) validated for format?
- Is file upload MIME type validated server-side (not just extension)?
- Is request body size limited? (see `src/lib/api/body-limit.ts`)

### Step 3 — Output safety
- Do catch blocks return generic errors? (No Prisma error details, no stack traces)
- Does `src/lib/api/sanitize-error.ts` get used?
- Are there any routes that echo back user input directly?

### Step 4 — SSRF protection
For any route that fetches external URLs:
- Is `validateExternalUrlWithDNS()` from `src/lib/utils/url-validation.ts` called?
- Is the private IP blocklist applied?
- Are `file://`, `data://`, `ftp://` schemes rejected?

### Step 5 — Rate limiting
- Is the chat route rate-limited? (20 req/min per agentId:IP via Redis or in-memory)
- Are webhook endpoints rate-limited? (60 req/min per webhookId)
- Any route that could be abused — is it rate-limited?

### Step 6 — Secret exposure
Scan for:
- Hardcoded API keys, tokens, or passwords
- Env vars leaked in client-side code (`'use client'` files)
- Secrets in console.log statements

### Step 7 — Report format
```
## Security Review — <target>
Date: [ISO8601]

### ❌ CRITICAL
- [file:line] — [issue] — [fix]

### ⚠️ HIGH
- [file:line] — [issue] — [fix]

### ✅ CLEAN dimensions
- Auth guards: all routes covered
- Input validation: Zod applied everywhere
...
```
