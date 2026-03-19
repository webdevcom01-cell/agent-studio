# ECC Deploy Runbook

## Pre-Deploy Checklist

- [ ] All tests pass: `pnpm test` (1500+ tests)
- [ ] TypeScript clean: `pnpm typecheck`
- [ ] Prisma schema matches DB: `pnpm db:push --dry-run`
- [ ] ECC_ENABLED env var set on Railway
- [ ] CRON_SECRET set on Railway

## Deploy Sequence

### 1. Push to main
```bash
git push origin main
```
Railway auto-deploys from main.

### 2. Verify health
```bash
curl https://agent-studio-production-c43e.up.railway.app/api/health
```

### 3. Run smoke tests
```bash
./scripts/smoke-test.sh https://agent-studio-production-c43e.up.railway.app
```

### 4. Deploy ECC Skills MCP (separate service)

Railway service name: `positive-inspiration`

1. Railway Dashboard → agent-studio project → `positive-inspiration` service
2. Root directory: `services/ecc-skills-mcp`
3. Env vars:
   - `DATABASE_URL` → Reference PostgreSQL (read-only)
   - `PORT` → `8000`
4. Public Networking disabled (internal only)
5. Verify health:
   ```bash
   # From within Railway internal network (e.g., via agent-studio service logs)
   curl http://positive-inspiration.railway.internal:8000/health
   ```

MCP endpoint: `http://positive-inspiration.railway.internal:8000/mcp`

### 5. Link MCP to Next.js
Set on agent-studio service:
```
ECC_MCP_URL=http://positive-inspiration.railway.internal:8000
```

### 6. Sync Prisma schema
```bash
pnpm db:push
```

### 7. Ingest skills
```bash
curl -X POST \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d @/tmp/ecc-skills-payload.json \
  https://agent-studio-production-c43e.up.railway.app/api/ecc/ingest-skills
```

Payload format: `{ "skills": [{ "slug": "name", "content": "SKILL.md content" }], "vectorize": true }`

### 8. Configure Cron Service
Add to Railway Cron Service:
```bash
# Every 5 min — scheduled flows (existing)
*/5 * * * * curl -s -X POST -H "Authorization: Bearer $CRON_SECRET" http://agent-studio.railway.internal:$PORT/api/cron/trigger-scheduled-flows

# Daily 3 AM — evolve instincts to skills
0 3 * * * curl -s -X POST -H "Authorization: Bearer $CRON_SECRET" -H "Content-Type: application/json" -d '{}' http://agent-studio.railway.internal:$PORT/api/skills/evolve
```

## Rollback

### Application
Railway Dashboard → Deployments → select previous → "Redeploy"
RTO: < 2 min

### Database
Railway PostgreSQL has daily point-in-time recovery backups.
RTO: < 5 min

### MCP Server
Railway Dashboard → `positive-inspiration` → Deployments → "Redeploy"
RTO: < 2 min

### Emergency Killswitch
Set `ECC_ENABLED=false` on agent-studio service.
All ECC features disabled without redeploy. Takes effect on next request.

## Feature Flags

| Flag | Default | Effect |
|------|---------|--------|
| `ECC_ENABLED` | `false` | Global ECC killswitch (opt-in) |
| `Agent.eccEnabled` | `false` | Per-agent ECC features |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | empty | Enables OTLP metrics push |

## Scaling Runbook (2+ replicas)

When scaling beyond 1 replica, replace in-memory components:
1. **Rate limiter** → Redis sliding window
2. **MCP connection pool** → Redis-backed pool
3. **MemoryCache** → Redis with same TTLs
4. **Metric buffer** → Direct OTLP push (no buffer)

Minimum Redis instance: 256MB, same Railway project, private networking.
