# New Node Handler Scaffold

Scaffold a complete new flow node handler for agent-studio.

## Usage
`/new-handler <node-type-name>`

Example: `/new-handler ai-classify` or `/new-handler web-scraper`

## Instructions

You are creating a new node handler for the agent-studio flow execution engine. Follow these steps IN ORDER:

### Step 1 — Validate inputs
- The node type name must be kebab-case (e.g. `web-scraper`, not `webScraper`)
- Derive the NodeType string: `web-scraper` → `web_scraper`
- Derive the handler class name: `web-scraper` → `WebScraperHandler`

### Step 2 — Read existing patterns
Before writing any code, read these files to understand the exact patterns:
- `src/lib/runtime/handlers/message-handler.ts` — simplest handler (reference pattern)
- `src/lib/runtime/types.ts` — RuntimeContext, ExecutionResult, NodeHandler types
- `src/lib/runtime/handlers/index.ts` — how handlers are registered

### Step 3 — Create the handler file
Create `src/lib/runtime/handlers/<node-type>-handler.ts` with:

```typescript
import type { NodeHandler, RuntimeContext, ExecutionResult } from '../types';
import { logger } from '@/lib/logger';

export const <camelCase>Handler: NodeHandler = async (
  node: RuntimeContext['nodes'][number],
  context: RuntimeContext
): Promise<ExecutionResult> => {
  try {
    const data = node.data as {
      // define the node's expected properties here
      // match what property-panel.tsx will set
    };

    // implementation here

    return {
      messages: [{ role: 'assistant', content: 'Result here' }],
      nextNodeId: node.data.nextNodeId as string | undefined,
      updatedVariables: {},
    };
  } catch (error) {
    logger.error('<node-type> handler error', { nodeId: node.id, error });
    return {
      messages: [{ role: 'assistant', content: 'An error occurred in <node-type> node.' }],
      nextNodeId: undefined,
    };
  }
};
```

**Rules for handler:**
- NEVER throw — always return graceful fallback in catch
- Use `logger.error` never `console.log`
- Return `ExecutionResult` with at minimum `messages` and `nextNodeId`
- `updatedVariables` only when the handler writes to flow variables

### Step 4 — Register in handler index
Open `src/lib/runtime/handlers/index.ts` and add:
1. Import: `import { <camelCase>Handler } from './<node-type>-handler';`
2. Register: `'<node_type>': <camelCase>Handler,`

### Step 5 — Add NodeType to types
Open `src/types/index.ts` and add `'<node_type>'` to the `NodeType` union.

### Step 6 — Create display component
Create `src/components/builder/nodes/<node-type>-node.tsx`:
- Extend `BaseNode` from `./base-node`
- Show the node's key config value as a label
- Follow the exact pattern in `src/components/builder/nodes/message-node.tsx`

### Step 7 — Add to node picker
Open `src/components/builder/node-picker.tsx` and add to the appropriate category group.

### Step 8 — Add property editor
Open `src/components/builder/property-panel.tsx` and add a case for `node_type` with inputs for all configurable properties.

### Step 9 — Write unit test
Create `src/lib/runtime/handlers/__tests__/<node-type>-handler.test.ts`:
- Test happy path
- Test empty/missing data
- Test error case (mock the dependency to throw)
- Follow pattern from `src/lib/runtime/handlers/__tests__/message-handler.test.ts`

### Step 10 — Verify
Run: `pnpm typecheck && pnpm test -- <node-type>`

Report: files created, registration confirmed, typecheck result, test result.
