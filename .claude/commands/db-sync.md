# Database Sync

Sync Prisma schema changes to the database and regenerate the client.

## Usage
`/db-sync` — push schema + regenerate client
`/db-sync migrate` — create migration files instead of direct push

## Instructions

### Standard workflow (dev/Railway — no migration files)
```bash
pnpm db:push      # Sync schema directly to DB (no migration file created)
pnpm db:generate  # Regenerate Prisma client from schema
```

Use this when:
- Adding a new field with a default value
- Adding a new model
- Adding an index
- Working on Railway production (uses db:push via nixpacks)

### Migration workflow (when migration files are needed)
```bash
pnpm db:migrate   # Creates migration file + applies to DB
pnpm db:generate  # Regenerate client
```

Use this when:
- Renaming a field (data migration needed)
- Changing a field type
- Removing a field that has data

### After any schema change, verify:
1. `src/generated/prisma/` was updated (new model types visible)
2. `pnpm typecheck` passes — no type errors from schema change
3. Import from `@/generated/prisma` works correctly in affected files

### CRITICAL rules
- NEVER edit `prisma/migrations/` — auto-generated only
- NEVER edit `src/generated/` — auto-generated only
- NEVER import from `@prisma/client` — always from `@/generated/prisma`
- If adding a vector field: it uses `Unsupported("vector(1536)")` type in schema
- pgvector extension must be enabled in Supabase before using vector fields

### After adding a new model, update CLAUDE.md
Open `CLAUDE.md` section 4 (PRISMA MODELS & RELATIONS) and add the new model with its relations.
