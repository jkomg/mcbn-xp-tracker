# Release: 2026-03-11 — Containerization and Stability Fixes

This release consolidates recent local-runtime and review-flow improvements.

## Included

- Dockerized local bot runtime and operational runbook.
- Dockerized local web dev runtime on `127.0.0.1:5001`.
- Root-level compose profiles:
  - `compose.web.yml` (web-only)
  - `compose.full.yml` (web + bot)
- One-command local profile bootstrap:
  - `./scripts/bootstrap-local.sh web-only`
  - `./scripts/bootstrap-local.sh web+bot`
- Review workflow fixes:
  - claim pending-state rendering hardened for case/whitespace variance
  - spend justification URLs rendered as clickable links in staff review
  - roster edit no longer crashes when `Creation / Audit XP` is blank
- Bot notification copy fix:
  - approved claim notifications no longer ask for sheet upload
  - approved spend notifications still request sheet upload

## Operational Notes

- Local web/bot can now be run entirely in Docker for parity and auditability.
- Existing host-based workflows remain available; Docker profiles are additive.
- Production deploy path remains Cloud Run via `apps/web/deploy.sh`.

## Follow-Up Focus

- Turnkey install profiles and orchestration finalized in docs and CI.
- Continued convergence toward operator-friendly “web-only” and “web+bot” flows.
