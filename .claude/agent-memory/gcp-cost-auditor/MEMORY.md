# GCP Cost Auditor — Agent Memory
**Project**: mcbn-xp-tracker
**Last updated**: 2026-06-24 (first audit)

---

## Cloud Run Configuration Baseline

### Production (`mcbn-xp-tracker`)
Source of truth: `.github/workflows/deploy-web.yml` (NOT `apps/web/deploy.sh` — the script has a bug: it sets 256Mi while CI sets 512Mi)

| Parameter | Value |
|-----------|-------|
| Memory | 512Mi |
| CPU | 1 vCPU |
| CPU throttling | Yes (--cpu-throttling) |
| Min instances | 0 (scale-to-zero) |
| Max instances | 2 |
| Concurrency | 80 |
| Timeout | 120s |
| Region | us-central1 |
| Gunicorn | 2 workers, 4 threads |
| Session affinity | None |

### Dev (`mcbn-xp-tracker-dev`)
Source of truth: `.github/workflows/deploy-web-dev.yml`

| Parameter | Value |
|-----------|-------|
| Memory | 256Mi |
| CPU | 1 vCPU, --cpu-throttling |
| Min instances | 0 |
| Max instances | 1 |
| Concurrency | 80 |
| Timeout | 120s |

---

## Artifact Registry Retention Policy

- **Status**: ACTIVE (applied 2026-06-04)
- **Policy**: Keep 10 most recent versions per image name
- **Repository**: `us-central1-docker.pkg.dev/mcbn-xp-tracker/mcbn-repo`
- **Before policy**: 424 images, ~12.5 GB accumulated
- **After policy**: estimated ~10–15 images, ~4–5 GB
- **Storage cost**: ~$0.40–$0.50/month
- **Action for next audit**: Verify policy still active in GCP Console (Artifact Registry > mcbn-repo > Edit Repository > Cleanup Policies)

---

## Docker Image

- **Base**: `python:3.12-slim` (Stage 2; Stage 1 is `node:20-slim` for React SPA)
- **Multi-stage build**: Yes (2 stages — SPA builder + Python app)
- **Layer caching in CI**: NO — plain `docker build` with no `--cache-from`. Rebuilds from scratch every deploy.
- **Estimated image size**: ~350–450 MB (python:3.12-slim + gunicorn + SQLAlchemy + gspread + google-cloud-storage + react SPA build output)
- **Dockerfile location**: `apps/web/Dockerfile`
- **Build context**: repo root (required — Dockerfile references `apps/character-app/` and `packages/`)

---

## Known Expensive Code Patterns

### 1. deploy.sh memory mismatch (OPEN — not yet fixed)
- `apps/web/deploy.sh` line 85 sets `--memory 256Mi`
- `deploy-web.yml` (CI, source of truth) sets `--memory 512Mi`
- Risk: manual redeploy via script would downgrade prod to 256Mi and risk OOM
- Fix: change line 85 of `deploy.sh` to `--memory 512Mi`
- Status: IDENTIFIED, NOT FIXED as of 2026-06-24

### 2. lazy='joined' on DbSpendRequest.coterie (OPEN — not yet fixed)
- Location: `apps/web/app/db.py` line 114
- `coterie = db.relationship('Coterie', foreign_keys=[coterie_id], lazy='joined')`
- Effect: every spend query JOINs coteries table even when coterie data is not needed
- Impact: negligible at current scale, but unnecessary overhead
- Fix: change to `lazy='select'`; add explicit joinedload in coterie-specific callers
- Status: IDENTIFIED, NOT FIXED as of 2026-06-24

### 3. N-sequential Turso HTTP calls on coterie view page (ACCEPTABLE)
- Location: `apps/web/app/blueprints/coteries.py` `view()` route
- 8 sequential DB queries per page render = 8 HTTP POSTs to Turso
- Latency: ~160–240ms in DB wait time at 20–30ms/call
- Not an N+1, but sequential HTTP overhead is real
- Status: ACCEPTED as-is at current scale. Re-evaluate if coterie page views > 200/day

### 4. Dev service deploys on every CI run (all branches) (ACCEPTED)
- `deploy-web-dev.yml` triggers on all branches via `workflow_run: workflows: ["CI"]`
- Intentional design for PR testing on dev
- Minor registry storage churn (~$0.50/month)
- Status: ACCEPTED as intentional design

---

## Optimizations Already Applied (Do Not Re-Recommend)

These were applied before the first audit or confirmed as already correct:

1. **Scale-to-zero**: `min-instances=0` on both prod and dev — already correct, do not suggest keeping a warm instance
2. **CPU throttling**: `--cpu-throttling` active — already correct
3. **Bot runs locally**: Discord bot is NOT on Cloud Run — no suggestion to move it to Cloud Run
4. **Turso as primary DB**: Cloud SQL was never used — do not suggest evaluating Cloud SQL
5. **Secret Manager startup injection**: All secrets are env vars at container start via `--update-secrets` — no per-request Secret Manager calls exist
6. **Fire-and-forget Sheets sync**: `SheetsSyncWorker` uses `ThreadPoolExecutor` with `_executor.submit()` — already non-blocking
7. **In-memory rate limiter**: `storage_uri="memory://"` in `flask-limiter` — correct for scale-to-zero, do not suggest Redis/Memorystore
8. **Path-filtered CI**: `dorny/paths-filter@v4` in `ci.yml` — already efficient
9. **Artifact Registry cleanup policy**: Applied 2026-06-04 — already saving ~$1.25/month vs pre-policy state
10. **Bot polling at 120s**: Fixed in CODEBASE_AUDIT_2026-06-22 (was 60s) — already correct

---

## June 2026 Spend Baseline

| Service | Monthly Cost |
|---------|-------------|
| Cloud Run prod | $1.00–$3.00 |
| Cloud Run dev | $0.25–$1.00 |
| Artifact Registry | $0.40–$0.50 |
| Secret Manager | $0.00 (free tier) |
| GCS (mcbn-wiki-images) | $0.00 (free tier) |
| **Total GCP** | **$2.30–$6.50** |

External (not GCP):
- Turso: free/starter tier, ~$0–$5/month
- GitHub Actions: free tier or included in plan

**Next audit**: July 2026. Watch for:
- Coterie system adoption increasing DB query volume
- Any new GCS writes if wiki image count grows
- Artifact Registry storage if cleanup policy is not pruning correctly
- Any Secret Manager per-request calls if new code paths are added

---

## Key File Locations

| Purpose | Path |
|---------|------|
| Prod deploy config (source of truth) | `.github/workflows/deploy-web.yml` |
| Dev deploy config | `.github/workflows/deploy-web-dev.yml` |
| Manual deploy script (has 256Mi bug) | `apps/web/deploy.sh` |
| Dockerfile | `apps/web/Dockerfile` |
| App factory (limiter, sheets init) | `apps/web/app/__init__.py` |
| DB models (lazy load config) | `apps/web/app/db.py` |
| Sheets sync worker | `apps/web/app/sheets_sync.py` |
| Turso HTTP adapter | `apps/web/app/turso_http.py` |
| GCS image mirroring | `apps/web/app/gcs.py` |
| Coterie routes (N-sequential queries) | `apps/web/app/blueprints/coteries.py` |
| Requirements | `apps/web/requirements.txt` |
