# ECC Deploy Runbook

## Pre-Deploy Checklist

- [ ] All tests pass: `pnpm test` (1500+ tests)
- [ ] TypeScript clean: `pnpm typecheck`
- [ ] Prisma schema matches DB: `npx prisma db push --dry-run`
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
curl https://<domain>.up.railway.app/api/health
```

### 3. Run smoke tests
```bash
./scripts/smoke-test.sh https://<domain>.up.railway.app
```

### 4. Deploy ECC Skills MCP (separate service)
1. Railway Dashboard → agent-studio project → "+" → "GitHub Repo"
2. Set root directory to `services/ecc-skills-mcp`
3. Set env vars:
   - `DATABASE_URL` → Reference PostgreSQL (read-only)
   - `PORT` → `8000`
4. Disable Public Networking
5. Verify: `curl http://ecc-skills-mcp.railway.internal:8000/health`

### 5. Link MCP to Next.js
Set on agent-studio service:
```
ECC_MCP_URL=http://ecc-skills-mcp.railway.internal:8000
```

### 6. Ingest skills (one-time)
```bash
curl -X POST \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"skills": [...], "vectorize": true}' \
  https://<domain>.up.railway.app/api/ecc/ingest-skills
```

### 7. Configure Cron Service
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
Railway Dashboard → ecc-skills-mcp → Deployments → "Redeploy"
RTO: < 2 min

### Emergency Killswitch
Set `ECC_ENABLED=false` on agent-studio service.
All ECC features disabled without redeploy. Takes effect on next request.

## Feature Flags

| Flag | Default | Effect |
|------|---------|--------|
| `ECC_ENABLED` | `true` | Global ECC killswitch |
| `Agent.eccEnabled` | `false` | Per-agent ECC features |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | empty | Enables OTLP metrics push |

## Scaling Runbook (2+ replicas)

When scaling beyond 1 replica, replace in-memory components:
1. **Rate limiter** → Redis sliding window
2. **MCP connection pool** → Redis-backed pool
3. **MemoryCache** → Redis with same TTLs
4. **Metric buffer** → Direct OTLP push (no buffer)

Minimum Redis instance: 256MB, same Railway project, private networking.
