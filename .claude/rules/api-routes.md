# API Route Rules — agent-studio

Apply these rules to EVERY file in `src/app/api/`.

## Response Format (mandatory)
ALL routes must return one of exactly two shapes:
```typescript
// Success
NextResponse.json({ success: true, data: T })
NextResponse.json({ success: true, data: T }, { status: 201 }) // for creates

// Error
NextResponse.json({ success: false, error: 'Human readable message' }, { status: 4xx|5xx })
```
Never return raw data without the `{ success, data }` wrapper.

## Auth Guards (mandatory)
```typescript
// Agent-scoped route
import { requireAgentOwner, isAuthError } from '@/lib/api/auth-guard';
const authResult = await requireAgentOwner(agentId);
if (isAuthError(authResult)) return authResult; // returns 401/403/404 automatically
const { userId } = authResult;

// User-only route (no specific agent)
import { requireAuth, isAuthError } from '@/lib/api/auth-guard';
const authResult = await requireAuth();
if (isAuthError(authResult)) return authResult;
const { userId } = authResult;
```
NEVER call `auth()` directly. NEVER check `session?.user` manually.

## Route File Exports
ONLY these exports are valid in route.ts files:
`GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, `OPTIONS`, `dynamic`, `revalidate`, `runtime`, `fetchCache`, `preferredRegion`

NEVER export constants, types, or helper functions from route.ts files — put them in `src/lib/`.

## Params (Next.js 15)
```typescript
// ✅ Correct — params is a Promise in Next.js 15
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const { agentId } = await params;
```

## Input Validation
```typescript
// Always validate body with Zod before use
const body = await req.json();
const parsed = MySchema.safeParse(body);
if (!parsed.success) {
  return NextResponse.json({ success: false, error: parsed.error.message }, { status: 422 });
}
```

## Error Handling
```typescript
// ✅ Correct — generic error, structured log
} catch (error) {
  logger.error('Brief description of operation', { agentId, error });
  return NextResponse.json({ success: false, error: 'Operation failed' }, { status: 500 });
}
// ❌ Wrong — exposes internals
} catch (error) {
  return NextResponse.json({ error: error.message });
}
```

## Logging
```typescript
import { logger } from '@/lib/logger';
logger.info('...', { context });   // routine events
logger.warn('...', { context });   // unexpected but handled
logger.error('...', { error });    // failures
// NEVER: console.log, console.warn, console.error
```
