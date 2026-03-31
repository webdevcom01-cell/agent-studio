# TypeScript Rules — agent-studio

## Hard Rules (zero exceptions)
- NO `any` type — ever. Not in types, not in casts, not in function params.
- NO `@ts-ignore` — fix the actual problem.
- NO `console.log` left in committed code — use `logger` from `@/lib/logger`.
- NO `require()` — use ESM `import` only.
- NO `@prisma/client` imports — always import from `@/generated/prisma`.
- NO editing `src/generated/` — Prisma auto-generates this directory.
- NO editing `prisma/migrations/` — use `pnpm db:migrate`.

## Imports
```typescript
// ✅ Use path aliases
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import type { Agent } from '@/generated/prisma';

// ❌ Never relative from deep paths
import { prisma } from '../../../lib/prisma';
```

## Types for Prisma JSON fields
Prisma returns `Json` fields as `Prisma.JsonValue`. Always narrow before use:
```typescript
import type { Prisma } from '@/generated/prisma';

// ✅ Type-safe JSON access
const content = flow.content as FlowContent; // define FlowContent interface
const variables = conversation.variables as Record<string, unknown>;

// ❌ Wrong
const content = flow.content as any;
```

## Async/Await
Always `await` Prisma calls. Never `.then()` in route handlers.
```typescript
// ✅
const agent = await prisma.agent.findUnique({ where: { id } });

// ❌
prisma.agent.findUnique({ where: { id } }).then(agent => ...);
```

## Null handling
```typescript
// ✅ Check before use
const agent = await prisma.agent.findUnique({ where: { id } });
if (!agent) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });

// ❌ Non-null assertion without check
const agent = await prisma.agent.findUnique({ where: { id } })!;
```

## Component Props
```typescript
// ✅ Always type props explicitly
interface MyComponentProps {
  agentId: string;
  onSuccess?: () => void;
}
export function MyComponent({ agentId, onSuccess }: MyComponentProps) {

// ❌ Implicit props
export function MyComponent(props) {
```

## Vercel AI SDK
Never call AI providers directly. Always use `src/lib/ai.ts`:
```typescript
// ✅
import { getModel } from '@/lib/ai';
const model = getModel('claude-sonnet-4-6');
const result = await generateText({ model, prompt });

// ❌ Never
import Anthropic from '@anthropic-ai/sdk';
const client = new Anthropic();
```
