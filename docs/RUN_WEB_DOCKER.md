# Run Web Dev In Docker

Use this when you want the web app local dev server (`127.0.0.1:5001`) to run in Docker instead of a host Python venv.

## Prerequisites

- Docker Desktop (or Docker Engine + Compose)
- `apps/web/.env` configured
- `apps/web/credentials/service-account.json` present

## Start

```bash
cd apps/web
docker compose up -d --build
```

Open: `http://127.0.0.1:5001`

## Logs

```bash
cd apps/web
docker compose logs -f --tail=200 web-dev
```

## Stop

```bash
cd apps/web
docker compose down
```

## Notes

- The container mounts local source code (`apps/web`) and `packages` read-only.
- Flask debug mode is enabled in-container for auto reload.
- The web dev container name is `mcbn-xp-tracker-web`.
