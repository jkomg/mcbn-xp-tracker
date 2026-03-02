# Custom Domain Setup (Squarespace + Cloud Run)

This project is deployed to Cloud Run and mapped to a custom domain (`mcbn.jkomg.us`) managed in Squarespace DNS.

## Goal

Map a custom hostname to Cloud Run with Google-managed TLS, then point Squarespace DNS to the records Google provides.

## Cost / Free-Tier Notes

- Cloud Run domain mapping itself does not introduce a separate paid product.
- You still pay only normal Cloud Run usage (requests, CPU, memory, egress).
- For low traffic, this remains compatible with staying near free-tier usage.
- DNS hosting in Squarespace is part of your Squarespace plan.

## Prerequisites

- A deployed Cloud Run service (example: `mcbn-xp-tracker`) in your target region.
- `gcloud` installed and authenticated.
- Access to your GCP project.
- Access to Squarespace DNS settings for your domain.
- Domain ownership verified in Google Search Console for the hostname (or parent domain).

## 1) Configure gcloud context

```bash
gcloud config set project mcbn-xp-tracker
```

If needed, set region defaults:

```bash
gcloud config set run/region us-central1
```

## 2) Create the Cloud Run domain mapping

Replace values as needed:

```bash
gcloud beta run domain-mappings create \
  --service mcbn-xp-tracker \
  --domain mcbn.jkomg.us \
  --region us-central1
```

If this fails due to ownership, complete domain verification first in Search Console and rerun.

## 3) Get required DNS records from Google

```bash
gcloud beta run domain-mappings describe \
  --domain mcbn.jkomg.us \
  --region us-central1
```

You will see one or more DNS resource records in the output. Use those exact values in Squarespace.

Tip: structured output can help:

```bash
gcloud beta run domain-mappings describe \
  --domain mcbn.jkomg.us \
  --region us-central1 \
  --format='yaml(status.resourceRecords)'
```

## 4) Add DNS records in Squarespace

In Squarespace DNS settings for your domain:

- Add each record from `status.resourceRecords` exactly as provided by Google.
- Common pattern:
- Subdomain mapping: CNAME
- Apex/root mapping: A and/or AAAA

Use default TTL unless you need a short migration window.

Important:

- Do not proxy these records through third-party CDN/proxy features.
- Keep record names/hosts exactly as provided (`@`, `www`, or full host labels).

## 5) Wait for DNS + certificate provisioning

- DNS can propagate in minutes but may take longer.
- Google-managed TLS certificate issuance can take additional time after DNS is correct.

Check status:

```bash
gcloud beta run domain-mappings describe \
  --domain mcbn.jkomg.us \
  --region us-central1 \
  --format='yaml(status.conditions,status.resourceRecords)'
```

## 6) Verify end-to-end

```bash
dig +short mcbn.jkomg.us
curl -I https://mcbn.jkomg.us
```

Expected result: HTTPS responds successfully and serves the Cloud Run app.

## Troubleshooting

### Domain ownership error

- Verify the domain/host in Search Console under the same Google account or project context.
- Re-run domain mapping creation.

### DNS record mismatch

- Re-check `status.resourceRecords` and ensure Squarespace entries match exactly.
- Remove stale/duplicate records for the same host/type if conflicting.

### TLS certificate stuck provisioning

- Usually indicates DNS is not fully correct or propagated yet.
- Confirm public DNS resolution returns the expected targets.
- Wait and re-check conditions via `gcloud ... describe`.

### App reachable on run.app but not custom domain

- Confirms service is up; issue is domain mapping/DNS/cert path.
- Focus on mapping status + DNS records + propagation.

## Operational note

After this is configured, normal deploys to the same Cloud Run service continue to serve the custom domain without additional domain changes.
