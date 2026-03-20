# Kubernetes Migration Plan

Migration guide from Railway to Kubernetes for enterprise-scale deployment.

## Current Railway Architecture

| Service | Tech | Replicas | Public |
|---------|------|----------|--------|
| agent-studio | Next.js 15.5 | 2 | Yes |
| positive-inspiration | Python FastMCP | 1 | No |
| postgresql | pgvector/pg16 | 1 | No |
| redis | Redis 7 | 1 | No |
| cron-service | Railway Cron | 1 | No |

## When to Migrate

Migrate when any of these thresholds are hit:
- Need more than 3 replicas per service
- Need autoscaling (HPA) based on CPU/memory/custom metrics
- Need multi-region deployment
- Need fine-grained network policies
- Railway costs exceed $200/month (K8s on GKE/EKS is cheaper at scale)
- Need PCI/SOC2 compliance with custom network isolation

## Migration Phases

### Phase 1: Container Preparation (1 week)

1. Create production Dockerfiles (already Nixpacks-based, convert to multi-stage)
2. Set up container registry (GitHub Container Registry or ECR)
3. Build and push images via GitHub Actions
4. Verify images run locally with `docker compose`

### Phase 2: K8s Cluster Setup (1 week)

1. Provision cluster (GKE Autopilot recommended for cost efficiency)
2. Install ingress controller (nginx-ingress or Traefik)
3. Install cert-manager for TLS
4. Configure external-dns for DNS management
5. Install metrics-server for HPA

### Phase 3: Database Migration (1 week)

1. Set up CloudSQL (GCP) or RDS (AWS) with pgvector extension
2. Enable read replica
3. Use `pg_dump` / `pg_restore` for data migration
4. Switch DNS to new database
5. Verify data integrity

### Phase 4: Service Deployment (1 week)

1. Deploy Redis via Bitnami Helm chart
2. Deploy agent-studio via Kustomize manifests (see `k8s/`)
3. Deploy positive-inspiration (ECC Skills MCP)
4. Configure CronJob for scheduled flows and evolve
5. Set up Ingress with TLS

### Phase 5: Cutover (1 day)

1. DNS cutover from Railway to K8s Ingress IP
2. Monitor for 24h
3. Decommission Railway services
4. Update CI/CD to deploy to K8s

## K8s Manifest Structure

```
k8s/
  base/
    kustomization.yaml        # Base resources
    namespace.yaml             # agent-studio namespace
    deployment.yaml            # Next.js app (2 replicas, HPA)
    service.yaml               # ClusterIP service
    ingress.yaml               # Public ingress with TLS
    mcp-deployment.yaml        # ECC Skills MCP server
    mcp-service.yaml           # Internal ClusterIP for MCP
    cronjob-scheduled.yaml     # Scheduled flows (every 5 min)
    cronjob-evolve.yaml        # Instinct evolution (daily 3AM)
    configmap.yaml             # Non-secret env vars
    sealed-secret.yaml         # Encrypted secrets (SealedSecrets)
  overlays/
    staging/
      kustomization.yaml       # 1 replica, staging DB
    production/
      kustomization.yaml       # 2+ replicas, production DB, HPA
```

## CI/CD Pipeline

```yaml
# .github/workflows/deploy-k8s.yml
name: Deploy to K8s
on:
  push:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: docker/build-push-action@v5
        with:
          push: true
          tags: ghcr.io/org/agent-studio:${{ github.sha }}

  deploy:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: azure/k8s-set-context@v4
        with:
          kubeconfig: ${{ secrets.KUBECONFIG }}
      - run: |
          cd k8s/overlays/production
          kustomize edit set image agent-studio=ghcr.io/org/agent-studio:${{ github.sha }}
          kustomize build . | kubectl apply -f -
          kubectl rollout status deployment/agent-studio -n agent-studio --timeout=300s
```

## Cost Comparison

| Item | Railway (current) | GKE Autopilot | AWS EKS |
|------|-------------------|---------------|---------|
| Compute (2 replicas) | ~$40/mo | ~$50/mo | ~$75/mo |
| PostgreSQL | ~$20/mo | ~$30/mo (CloudSQL) | ~$35/mo (RDS) |
| Redis | ~$10/mo | ~$15/mo (Memorystore) | ~$15/mo (ElastiCache) |
| Ingress/LB | Included | ~$18/mo | ~$18/mo |
| DNS/TLS | Included | ~$1/mo | ~$1/mo |
| Container Registry | N/A | Free (500MB) | Free (500MB) |
| **Total** | **~$70/mo** | **~$114/mo** | **~$144/mo** |
| **At 5+ replicas** | **~$150/mo** | **~$130/mo** | **~$170/mo** |
| **At 10+ replicas** | **~$300/mo** | **~$200/mo** | **~$280/mo** |

K8s becomes cost-effective at 5+ replicas due to better resource packing and autoscaling. Below that, Railway is simpler and cheaper.

## Rollback Strategy

1. Keep Railway deployment running in standby during migration
2. DNS failover: switch CNAME back to Railway in < 5 minutes
3. Database: Railway PostgreSQL remains read-only backup for 30 days
4. After 30-day stability period, decommission Railway

## Prerequisites Checklist

- [ ] Dockerfiles for agent-studio and positive-inspiration
- [ ] Container registry access (GHCR or ECR)
- [ ] K8s cluster provisioned
- [ ] CloudSQL/RDS with pgvector enabled
- [ ] DNS records prepared (low TTL before cutover)
- [ ] Monitoring (Grafana Cloud OTLP already configured)
- [ ] SealedSecrets or external-secrets operator installed
- [ ] Load test passing on K8s (scripts/load-test.js)
