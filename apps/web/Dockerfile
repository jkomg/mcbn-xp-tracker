FROM python:3.12-slim

WORKDIR /app

# Install dependencies
COPY apps/web/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY apps/web/ ./
COPY packages/ ./packages/

# Cloud Run sets PORT env var (default 8080)
ENV PORT=8080

# Run with gunicorn (production WSGI server)
CMD exec gunicorn --bind :$PORT --workers 2 --threads 4 --timeout 120 "app:create_app()"
