# Node Handler Rules — agent-studio

Rules for all files in `src/lib/runtime/handlers/`.

## Handler Signature
```typescript
import type { NodeHandler, RuntimeContext, ExecutionResult } from '../types';

export const myHandler: NodeHandler = async (
  node: RuntimeContext['nodes'][number],
  context: RuntimeContext
): Promise<ExecutionResult> => {
```

## Return Type — ExecutionResult
```typescript
return {
  // Required: at least one message describing what happened
  messages: [{ role: 'assistant', content: 'Result description' }],

  // Optional: ID of next node to execute (undefined = stop)
  nextNodeId: node.data.nextNodeId as string | undefined,

  // Optional: variables to update in flow context
  updatedVariables: { myVar: 'value' },

  // Optional: true when waiting for human input (human_approval node)
  waitForInput: false,
};
```

## Error Handling (mandatory)
EVERY handler must have a try/catch. NEVER throw from a handler — always return graceful fallback:
```typescript
} catch (error) {
  logger.error('my-handler error', { nodeId: node.id, error });
  return {
    messages: [{ role: 'assistant', content: 'An error occurred in [node type] node.' }],
    nextNodeId: undefined,
  };
}
```

## Registration
After creating a handler, register it in `src/lib/runtime/handlers/index.ts`:
```typescript
import { myHandler } from './my-handler';
// ...
const handlers: Record<NodeType, NodeHandler> = {
  // ...
  my_node_type: myHandler,
};
```

## Safety Limits
The engine enforces MAX_ITERATIONS=50 and MAX_HISTORY=100.
Handlers must not implement their own loops — use the `loop` node type instead.

## AI Calls from Handlers
Use Vercel AI SDK via `src/lib/ai.ts`:
```typescript
import { getModel } from '@/lib/ai';
import { generateText } from 'ai';

const model = getModel(node.data.model as string || 'deepseek-chat');
const { text } = await generateText({ model, prompt: '...' });
```
Never call providers directly. Never use raw fetch to OpenAI/Anthropic.

## MCP Tools from Handlers
Use `src/lib/mcp/client.ts`:
```typescript
import { getMCPToolsForAgent } from '@/lib/mcp/client';
const tools = await getMCPToolsForAgent(context.agentId);
```

## Testing
Every handler must have a test file at:
`src/lib/runtime/handlers/__tests__/<handler-name>-handler.test.ts`

Required test cases:
1. Happy path with valid node data
2. Missing/empty node data (graceful fallback)
3. Dependency throws → handler returns error message, does NOT throw
