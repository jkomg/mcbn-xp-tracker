"""Low-volume, owner-only cloud cost signals for the Settings page.

The billing export is queried as a monthly aggregate and cached in-process.
This deliberately avoids introducing a BigQuery client dependency or making
hourly/daily queries from a request handler.
"""

from __future__ import annotations

import json
import re
import time
from collections import Counter
from datetime import datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation

import google.auth
import requests
from google.auth.transport.requests import Request
from google.oauth2 import service_account

from app.db import AppLogEntry, db

_BQ_SCOPE = 'https://www.googleapis.com/auth/bigquery'
_TABLE_RE = re.compile(r'^[A-Za-z0-9_.-]+$')
_CACHE: dict[str, tuple[float, dict]] = {}


class CloudSpendUnavailable(RuntimeError):
    """Raised when billing export data is not configured or cannot be read."""


def _credentials(config):
    raw = config.get('GOOGLE_CREDENTIALS_JSON', '')
    filename = config.get('GOOGLE_CREDENTIALS_FILE', '')
    if raw:
        return service_account.Credentials.from_service_account_info(
            json.loads(raw), scopes=[_BQ_SCOPE]
        )
    if filename:
        try:
            return service_account.Credentials.from_service_account_file(
                filename, scopes=[_BQ_SCOPE]
            )
        except (FileNotFoundError, ValueError):
            pass
    credentials, _ = google.auth.default(scopes=[_BQ_SCOPE])
    return credentials


def fetch_monthly_gcp_costs(config, months: int = 12) -> list[dict]:
    """Return monthly net GCP cost from a configured Billing Export table."""
    table = str(config.get('CLOUD_SPEND_BILLING_TABLE', '')).strip().strip('`')
    if not table or not _TABLE_RE.fullmatch(table) or table.count('.') != 2:
        raise CloudSpendUnavailable(
            'Set CLOUD_SPEND_BILLING_TABLE to project.dataset.table.'
        )

    project = str(config.get('CLOUD_SPEND_BILLING_PROJECT_ID', '')).strip()
    if not project or not _TABLE_RE.fullmatch(project):
        raise CloudSpendUnavailable('Billing project is not configured.')

    query = f"""
        SELECT FORMAT_DATE('%Y-%m', DATE(usage_start_time)) AS month,
               SUM(cost) + SUM((SELECT COALESCE(SUM(c.amount), 0)
                                FROM UNNEST(credits) AS c)) AS net_cost
        FROM `{table}`
        WHERE DATE(usage_start_time) >= DATE_SUB(CURRENT_DATE(), INTERVAL {int(months)} MONTH)
        GROUP BY month
        ORDER BY month
    """
    credentials = _credentials(config)
    credentials.refresh(Request())
    response = requests.post(
        f'https://bigquery.googleapis.com/bigquery/v2/projects/{project}/queries',
        headers={'Authorization': f'Bearer {credentials.token}'},
        json={
            'query': query,
            'useLegacySql': False,
            'timeoutMs': int(config.get('CLOUD_SPEND_QUERY_TIMEOUT_MS', 20000)),
            'maximumBytesBilled': int(config.get('CLOUD_SPEND_MAX_BYTES_BILLED', 1_000_000_000)),
        },
        timeout=float(config.get('CLOUD_SPEND_HTTP_TIMEOUT_SECONDS', 25)),
    )
    if response.status_code >= 400:
        raise CloudSpendUnavailable(f'Billing query failed ({response.status_code}).')
    payload = response.json()
    if not payload.get('jobComplete', False):
        raise CloudSpendUnavailable('Billing query did not complete within the request budget.')

    values = []
    for row in payload.get('rows', []):
        fields = row.get('f', [])
        if len(fields) < 2:
            continue
        try:
            amount = Decimal(fields[1].get('v') or '0')
        except InvalidOperation:
            continue
        values.append({'month': fields[0].get('v', ''), 'cost': float(amount)})
    return values


def _cached_costs(config) -> tuple[list[dict], str | None]:
    table = str(config.get('CLOUD_SPEND_BILLING_TABLE', '')).strip()
    cache_key = table or 'unconfigured'
    now = time.monotonic()
    cached = _CACHE.get(cache_key)
    ttl = int(config.get('CLOUD_SPEND_CACHE_TTL_SECONDS', 21600))
    if cached and now - cached[0] < ttl:
        return cached[1]['costs'], cached[1].get('error')
    try:
        costs = fetch_monthly_gcp_costs(config)
        result = {'costs': costs, 'error': None}
    except Exception as exc:  # The admin page must fail soft if billing is unavailable.
        result = {'costs': [], 'error': str(exc)}
    _CACHE[cache_key] = (now, result)
    return result['costs'], result['error']


def build_snapshot(config, heartbeat_ts: str | None = None, months: int = 12) -> dict:
    """Build monthly cost/error comparison data for the owner-only pane."""
    costs, billing_error = _cached_costs(config)
    cutoff = datetime.now(timezone.utc) - timedelta(days=months * 32)
    errors = Counter()
    # Column-only query with the cutoff pushed into SQL -- app_log_entries
    # is an append-only error/warning log written on every unhandled
    # exception, so it only grows; the previous version fetched every
    # error row ever logged as a full ORM instance and filtered by date in
    # Python only after the fact. created_at is stored tz-naive (UTC), so
    # compare against a naive cutoff.
    rows = db.session.query(AppLogEntry.created_at).filter(
        AppLogEntry.level == 'error',
        AppLogEntry.created_at >= cutoff.replace(tzinfo=None),
    )
    for (created,) in rows:
        if created.tzinfo is None:
            created = created.replace(tzinfo=timezone.utc)
        errors[created.strftime('%Y-%m')] += 1

    now = datetime.now(timezone.utc).replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    month_keys = []
    for offset in range(months - 1, -1, -1):
        month = now.month - offset
        year = now.year + (month - 1) // 12
        month = (month - 1) % 12 + 1
        month_keys.append(f'{year:04d}-{month:02d}')
    cost_by_month = {item['month']: item['cost'] for item in costs}
    series = [
        {'month': key, 'cost': cost_by_month.get(key), 'errors': errors.get(key, 0)}
        for key in month_keys
    ]
    return {
        'series': series,
        'billing_configured': not billing_error and bool(
            str(config.get('CLOUD_SPEND_BILLING_TABLE', '')).strip()
        ),
        'billing_error': billing_error,
        'turso_configured': False,
        'heartbeat_ts': heartbeat_ts,
        'fetched_at': datetime.now(timezone.utc).isoformat(timespec='seconds'),
    }
