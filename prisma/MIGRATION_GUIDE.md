# Prisma Migration Guide — agent-studio

## Current State

The project has two migrations:

1. **`0_init`** — Original baseline (20 tables, 8 enums)
2. **`20260327_schema_sync`** — Delta migration covering everything added via `db:push` after `0_init` (16 new tables, 9 new enums, ~30 new columns on existing tables)

Both migrations use `IF NOT EXISTS` / `IF NOT EXISTS` guards so they are safe to run on databases that already have these objects.

## Production Baselining (One-Time Setup)

Since production was synced via `db:push`, both migrations need to be marked as already applied:

```bash
# Mark both migrations as applied WITHOUT running them
npx prisma migrate resolve --applied 0_init
npx prisma migrate resolve --applied 20260327_schema_sync
```

After this, `prisma migrate deploy` will only run NEW migrations going forward.

## Development Workflow

```bash
# 1. Make changes to prisma/schema.prisma

# 2. Create a new migration (generates SQL + applies it to dev DB)
pnpm db:migrate

# 3. Review the generated SQL in prisma/migrations/<timestamp>_<name>/migration.sql

# 4. Generate Prisma client
pnpm db:generate

# 5. Commit the migration file alongside your code changes
```

## Production Deployment

```bash
# Runs all pending migrations in order (non-interactive, safe for CI/CD)
npx prisma migrate deploy
```

This is already handled in the Railway build command. Add to `railway.toml` build:

```
npx prisma migrate deploy && pnpm run build
```

## Rules

- **Never use `db:push` in production** — it can drop columns/tables without warning
- **Never edit existing migration files** — they are immutable once committed
- **Always review generated SQL** before committing
- **Test migrations locally** before pushing to production
- **One migration per feature branch** — squash if needed before merge
