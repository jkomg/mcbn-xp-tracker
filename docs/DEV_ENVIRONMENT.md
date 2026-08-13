# Dev Environment Setup

The dev Cloud Run service (`mcbn-xp-tracker-dev`) redeploys on **every CI-passing push, on
any branch** — not just `main`, and not only when a PR is open. Its isolated Turso DB means
migration errors and startup crashes surface in dev first.

> **Dev is shared.** Because there is no branch filter, pushing a work-in-progress branch
> replaces whatever is currently deployed to `dev.mcbn.jkomg.us` and pings Discord.
> Coordinate before pushing if someone else is testing there.

## One-time setup

### 1. Create the dev Turso database

```bash
turso db create mcbn-dev
turso db show mcbn-dev          # note the URL
turso db tokens create mcbn-dev # note the token
```

### 2. Add GCP secrets

```bash
echo "libsql+https://mcbn-dev-<your-org>.turso.io" | \
  gcloud secrets create mcbn-dev-database-url --data-file=- --project=mcbn-xp-tracker

echo "<token-from-step-1>" | \
  gcloud secrets create mcbn-dev-turso-auth-token --data-file=- --project=mcbn-xp-tracker
```

Grant the Cloud Run service account access to both secrets:

```bash
SA="$(gcloud run services describe mcbn-xp-tracker-dev \
  --region=us-central1 --project=mcbn-xp-tracker \
  --format='value(spec.template.spec.serviceAccountName)')"

for SECRET in mcbn-dev-database-url mcbn-dev-turso-auth-token; do
  gcloud secrets add-iam-policy-binding $SECRET \
    --member="serviceAccount:${SA}" \
    --role="roles/secretmanager.secretAccessor" \
    --project=mcbn-xp-tracker
done
```

### 3. Map the dev subdomain

Add a DNS CNAME record in your DNS provider:

```
dev.mcbn.jkomg.us  CNAME  ghs.googlehosted.com
```

Then create the Cloud Run domain mapping:

```bash
gcloud beta run domain-mappings create \
  --service=mcbn-xp-tracker-dev \
  --domain=dev.mcbn.jkomg.us \
  --region=us-central1 \
  --project=mcbn-xp-tracker
```

### 4. Add dev.mcbn.jkomg.us to Discord OAuth

In the Discord Developer Portal, add `https://dev.mcbn.jkomg.us/auth/callback` as an
allowed redirect URI for the bot's OAuth application.

## How it works

- `deploy-web-dev.yml` triggers after `CI` completes — on **any branch**, deliberately
  unfiltered so a PR can be tested on real infrastructure before it merges
- Builds the same Docker image tagged with the commit SHA
- Deploys to `mcbn-xp-tracker-dev` using `mcbn-dev-database-url` / `mcbn-dev-turso-auth-token`
- Runs a 60s smoke test against `/api/health` — if the app crashes on startup (e.g. missing
  migration file), the smoke test fails and the Discord webhook posts a warning
- Prod deploy (`deploy-web.yml`) is **chained after this one, not parallel**: it triggers on
  `Deploy Web to Cloud Run (Dev)` completing, filtered to `branches: [main]`. So dev acts as
  a gate — prod only deploys after a dev deploy succeeds on `main`, and a feature-branch dev
  deploy can never reach prod.

## Local dev rule

**Never set `DATABASE_URL` to the production or dev Turso URL in your local `.env`.**
Local dev should use SQLite (the default when `DATABASE_URL` is unset).
Only Cloud Run services should connect to Turso.
