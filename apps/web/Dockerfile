FROM python:3.12-slim

WORKDIR /app

# Install dependencies
# INSTALL_LIBSQL=false skips libsql-experimental (no pre-built ARM64 wheel).
# Local dev uses SQLite so it's not needed there; Cloud Run (AMD64) keeps it.
ARG INSTALL_LIBSQL=true
COPY apps/web/requirements.txt .
RUN if [ "$INSTALL_LIBSQL" = "false" ]; then \
      grep -v '^libsql' requirements.txt > /tmp/req.txt && \
      pip install --no-cache-dir -r /tmp/req.txt; \
    else \
      pip install --no-cache-dir -r requirements.txt; \
    fi

# Copy application code
COPY apps/web/ ./
COPY packages/ ./packages/

# Cloud Run sets PORT env var (default 8080)
ENV PORT=8080

# Run with gunicorn (production WSGI server)
CMD exec gunicorn --bind :$PORT --workers 2 --threads 4 --timeout 120 "app:create_app()"
