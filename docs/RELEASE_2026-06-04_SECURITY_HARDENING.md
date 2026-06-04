# Release 2026-06-04 — GCP Security Hardening + Deploy Gate

## Summary

Full security audit of GCP IAM and Cloud Run configuration, least-privilege
service account setup, Artifact Registry cleanup policy, dev/prod Discord
isolation, and enforced manual-approval gate on all production deploys.

---

## GCP IAM Hardening (applied live)

### New service account: `mcbn-web-runner`

Created a dedicated SA for both Cloud Run services with only the permissions
they actually need:

| SA | Before | After |
|----|--------|-------|
| `810584141156-compute` (default compute) | `roles/editor` (project-wide) | no project roles |
| `mcbn-service@...` | `roles/owner` | no project roles (key in Secret Manager — needs no GCP roles) |
| `mcbn-web-runner@...` (new) | — | `roles/secretmanager.secretAccessor` only |

Both `mcbn-xp-tracker` (prod) and `mcbn-xp-tracker-dev` Cloud Run services
now run as `mcbn-web-runner`.

**Risk removed:** `roles/editor` on the default compute SA meant any RCE in
the web app had full GCP project access. That path is now closed.

### Why `mcbn-service` lost its roles

`mcbn-service` was used only to export Google Sheets data via a service account
key stored in Secret Manager. It has no need for any GCP project-level role —
the key is mounted as a secret at runtime and authenticates directly to the
Sheets API. Project roles were removed.

---

## Dev/Prod Discord OAuth Isolation

The dev Cloud Run service (`mcbn-xp-tracker-dev`) was mounting the prod Discord
OAuth credentials (`mcbn-discord-client-id`, `mcbn-discord-client-secret`).

- Dev service now uses `mcbn-dev-discord-client-id` and
  `mcbn-dev-discord-client-secret` (separate Discord application)
- Prod service is unchanged
- Workflow `deploy-web-dev.yml` updated to reference dev secrets

---

## Artifact Registry Cleanup Policy

424 stale images (≈12.5 GB) had accumulated with no retention policy.

Cleanup policy applied to `mcbn-repo`: keep the 10 most recent versions per
image name. Stale images are eligible for deletion.

---

## Deploy Pipeline: Enforced Dev-First Gate

### Before

`deploy-web.yml` triggered automatically via `workflow_run` on every CI pass
on `main` — prod deployed on every merge with no gate.

### After

| Workflow | Trigger | Target |
|----------|---------|--------|
| `deploy-web-dev.yml` | Auto on CI pass (main) | Dev |
| `deploy-web.yml` | Manual `workflow_dispatch` only | Prod |

Prod deploys now require:
1. Explicit manual trigger via GitHub Actions UI
2. Approval from a reviewer in the **`production`** GitHub Environment

This ensures dev always gets the code first, and prod never moves without
an intentional human decision.

### Removed

`deploy.yml` (added mid-PR) was deleted — it was redundant with the existing
workflows and had a bug: `docker build apps/web/` used the wrong build context,
excluding `packages/` and `apps/character-app/` which the Dockerfile references.
The existing `deploy-web.yml` already builds correctly from repo root with
`docker build -f apps/web/Dockerfile .`.

---

## Files Changed

- `.github/workflows/deploy-web.yml` — removed `workflow_run` trigger, added `environment: production`
- `.github/workflows/deploy-web-dev.yml` — switched to dev Discord secret names
- `.github/workflows/deploy.yml` — deleted
