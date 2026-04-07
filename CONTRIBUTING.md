# Contributing to Agent Studio

Thank you for your interest in contributing. This guide covers the process for submitting changes.

---

## Prerequisites

- Node.js 20+
- pnpm 9+
- PostgreSQL with the pgvector extension enabled
- A DeepSeek API key (required for chat)
- An OpenAI API key (required for embeddings)

---

## Development Setup

```bash
# 1. Fork and clone the repository
git clone https://github.com/<your-username>/agent-studio.git
cd agent-studio

# 2. Install dependencies
pnpm install

# 3. Configure environment
cp .env.example .env.local
# Fill in required values: DATABASE_URL, DIRECT_URL, DEEPSEEK_API_KEY,
# OPENAI_API_KEY, AUTH_SECRET, and at least one OAuth provider

# 4. Enable pgvector (run in your PostgreSQL client)
# CREATE EXTENSION IF NOT EXISTS vector;

# 5. Push schema and generate Prisma client
pnpm db:push
pnpm db:generate

# 6. Start the dev server
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) to verify everything is working.

---

## Branch Naming

Create branches from `main` using one of these prefixes:

| Prefix | Purpose |
|--------|---------|
| `feature/` | New functionality |
| `fix/` | Bug fixes |
| `docs/` | Documentation changes |

Examples: `feature/webhook-retry`, `fix/chat-streaming-timeout`, `docs/api-reference`.

---

## Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>: <short description>
```

| Type | When to use |
|------|-------------|
| `feat` | New feature |
| `fix` | Bug fix |
| `docs` | Documentation only |
| `test` | Adding or updating tests |
| `chore` | Build, CI, dependency updates |
| `refactor` | Code change that neither fixes a bug nor adds a feature |
| `perf` | Performance improvement |

Examples:
- `feat: add webhook retry with exponential backoff`
- `fix: resolve streaming timeout on long MCP tool chains`
- `docs: update RAG pipeline configuration guide`

---

## Pre-Push Checks

Before every commit + push, run the full pre-push gate:

```bash
pnpm precheck
```

This runs TypeScript type-check → Vitest unit tests → lucide icon mock check → placeholder string consistency. All four checks must show **PASS** before pushing. To run the same checks against a single file:

```bash
pnpm precheck:file src/lib/webhooks/execute.ts
```

---

## Pull Request Process

1. **Fork** the repository and create a branch from `main`.
2. **Make your changes** in small, focused commits.
3. **Run the pre-push gate** before pushing:
   ```bash
   pnpm precheck   # TypeScript + tests + lint + checks — all must pass
   ```
4. **Push** your branch and open a Pull Request against `main`.
5. **Fill in the PR template** with a description, change type, and checklist.
6. **Address review feedback** — maintainers may request changes before merging.

Keep PRs focused on a single concern. If your change touches multiple areas, split it into separate PRs.

---

## Running the BullMQ Worker

The BullMQ worker processes background jobs (chat pipeline, eval runs, webhook retries). To run it locally alongside the dev server:

```bash
# Terminal 1 — dev server
pnpm dev

# Terminal 2 — job worker (requires REDIS_URL in .env.local)
pnpm worker
```

Without Redis, the worker exits immediately. The web app degrades gracefully — jobs that require a worker (e.g. scheduled flows, webhook retries) simply won't execute until the worker is running.

---

## Adding a New Flow Node Type

The project has 61 node types (see `NodeType` in `src/types/index.ts`). To add a new one, follow this checklist in order:

1. Add the type to the `NodeType` union in `src/types/index.ts`
2. Add the type string to `NODE_TYPES` array in `src/lib/validators/flow-content.ts`
3. Create the handler in `src/lib/runtime/handlers/<name>-handler.ts`
4. Register the handler in `src/lib/runtime/handlers/index.ts`
5. Create the display component in `src/components/builder/nodes/<name>-node.tsx`
6. Register the component in the `NODE_TYPES` map in `src/components/builder/flow-builder.tsx`
7. Add the type to the node picker in `src/components/builder/node-picker.tsx`
8. Add the property editor in `src/components/builder/property-panel.tsx`
9. If the node sets an output variable, add it to `OUTPUT_VAR_TYPES` in `property-panel.tsx`
10. Write unit tests in `src/lib/runtime/handlers/__tests__/<name>-handler.test.ts`
11. Update the node count in `src/components/builder/__tests__/node-picker.test.tsx`

Every handler must return `ExecutionResult` and never throw — wrap everything in try/catch and return a graceful fallback message on failure.

---

## Code Standards

### TypeScript
- Strict mode is always on.
- No `any` type. Use proper types, generics, or `unknown` with type guards.
- Explicit return types on exported functions.
- Use interfaces for object shapes, not type aliases.

### Styling
- Tailwind CSS v4 only. No inline styles, no CSS modules.
- Use the spacing scale. No magic pixel values.

### Validation
- Validate all API inputs with Zod schemas.
- Return consistent response format: `{ success: true, data }` or `{ success: false, error }`.

### General
- No `console.log` in committed code. Use the structured logger (`src/lib/logger.ts`) on the server.
- No hardcoded secrets, API keys, or internal URLs.
- Keep functions under 50 lines. Keep files under 800 lines.
- Delete unused code. Do not comment it out.

---

## Testing

- Run `pnpm test` before every PR. All existing tests must pass.
- New features require new tests. Bug fixes should include a regression test.
- Unit tests go in `__tests__/` directories next to the source, with `.test.ts` extension.
- E2E tests go in `e2e/tests/` with `.spec.ts` extension.
- Test behavior, not implementation details.

---

## License

By contributing, you agree that your contributions will be licensed under the [Apache License 2.0](LICENSE).
