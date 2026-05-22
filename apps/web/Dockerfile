# ── Stage 1: Build React character-creator SPA ───────────────────────────────
FROM node:20-slim AS spa-builder
WORKDIR /workspace/apps/character-app
COPY apps/character-app/package*.json ./
RUN npm ci
COPY apps/character-app/ ./
# Output goes to ../web/app/static/character-app (relative to this dir)
RUN npm run build

# ── Stage 2: Python web app ───────────────────────────────────────────────────
FROM python:3.12-slim

WORKDIR /app

# Install dependencies
COPY apps/web/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY apps/web/ ./
COPY packages/ ./packages/

# Copy built SPA from Stage 1
COPY --from=spa-builder /workspace/apps/web/app/static/character-app/ ./app/static/character-app/

# Cloud Run sets PORT env var (default 8080)
ENV PORT=8080

# entrypoint: run migrations then start gunicorn
RUN chmod +x entrypoint.sh
CMD ["./entrypoint.sh"]
