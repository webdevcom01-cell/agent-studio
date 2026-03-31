# New API Route Scaffold

Scaffold a new Next.js App Router API route for agent-studio.

## Usage
`/new-route <route-path> <methods>`

Example: `/new-route agents/[agentId]/stats GET,POST`

## Instructions

### Step 1 — Read existing patterns
Before writing any code, read:
- `src/app/api/agents/[agentId]/mcp/route.ts` — standard protected CRUD route
- `src/lib/api/auth-guard.ts` — requireAuth, requireAgentOwner, isAuthError
- `src/lib/logger.ts` — structured logging

### Step 2 — Determine auth type
- Route touches a specific agent → use `requireAgentOwner(agentId)`
- Route requires login but no specific agent → use `requireAuth()`
- Route is public (embed, webhook trigger, health) → no auth, add to middleware allowlist

### Step 3 — Create the route file
Path: `src/app/api/<route-path>/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { requireAgentOwner } from '@/lib/api/auth-guard';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { z } from 'zod';

// Input validation schema (for POST/PATCH)
const InputSchema = z.object({
  // define expected fields
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const { agentId } = await params;
  const authResult = await requireAgentOwner(agentId);
  if (isAuthError(authResult)) return authResult;

  try {
    const data = await prisma.someModel.findMany({
      where: { agentId },
    });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    logger.error('GET /<route> failed', { agentId, error });
    return NextResponse.json(
      { success: false, error: 'Failed to fetch data' },
      { status: 500 }
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const { agentId } = await params;
  const authResult = await requireAgentOwner(agentId);
  if (isAuthError(authResult)) return authResult;

  try {
    const body = await req.json();
    const parsed = InputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.message },
        { status: 422 }
      );
    }

    const result = await prisma.someModel.create({
      data: { agentId, ...parsed.data },
    });
    return NextResponse.json({ success: true, data: result }, { status: 201 });
  } catch (error) {
    logger.error('POST /<route> failed', { agentId, error });
    return NextResponse.json(
      { success: false, error: 'Failed to create record' },
      { status: 500 }
    );
  }
}
```

### Step 4 — Rules checklist (verify each before finishing)
- [ ] All handlers use `requireAgentOwner()` or `requireAuth()` (never raw `auth()`)
- [ ] Input validated with Zod before any DB call
- [ ] Every catch block uses `logger.error()` with context — never `console.log`
- [ ] Every catch returns generic error message — no Prisma/internal details
- [ ] Response format is always `{ success: true, data }` or `{ success: false, error }`
- [ ] Params are `await`-ed: `const { agentId } = await params`
- [ ] Only valid exports: GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS + dynamic/revalidate/runtime

### Step 5 — If route is public, update middleware
Open `src/middleware.ts` and add the route pattern to the public paths list.

### Step 6 — Add to CLAUDE.md API table
Open `CLAUDE.md`, find the API Routes table in section 5, and add a row for the new route.

### Step 7 — Verify
Run: `pnpm typecheck`

Report: file created, auth type used, Zod schema defined, CLAUDE.md updated.
