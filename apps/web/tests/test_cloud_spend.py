"""fetch_monthly_gcp_costs builds a BigQuery Standard SQL query and posts it
to the jobs.query REST API. Regression coverage for a real production bug:
TIMESTAMP_SUB does not support the MONTH date part on a TIMESTAMP-typed
column in BigQuery Standard SQL, so the original query always failed at
query-compile time -- the Cloud Spend dashboard was broken independent of
(and in addition to) CLOUD_SPEND_BILLING_TABLE/PROJECT_ID being unset."""

from unittest.mock import MagicMock, patch

from app.cloud_spend import CloudSpendUnavailable, fetch_monthly_gcp_costs


def _config(**overrides):
    base = {
        'CLOUD_SPEND_BILLING_TABLE': 'proj.dataset.table',
        'CLOUD_SPEND_BILLING_PROJECT_ID': 'proj',
        'GOOGLE_CREDENTIALS_JSON': '',
        'GOOGLE_CREDENTIALS_FILE': '',
    }
    base.update(overrides)
    return base


def _mock_credentials():
    creds = MagicMock()
    creds.token = 'fake-token'
    creds.refresh = MagicMock()
    return creds


def test_query_uses_date_sub_not_timestamp_sub_with_month():
    """TIMESTAMP_SUB(..., INTERVAL n MONTH) is invalid BigQuery syntax for a
    TIMESTAMP column -- MONTH/YEAR intervals are only valid for DATE/DATETIME.
    Locks in the DATE_SUB(CURRENT_DATE(), INTERVAL n MONTH) fix."""
    captured = {}

    def fake_post(url, headers=None, json=None, timeout=None):
        captured['query'] = json['query']
        resp = MagicMock()
        resp.status_code = 200
        resp.json.return_value = {'jobComplete': True, 'rows': []}
        return resp

    with patch('app.cloud_spend._credentials', return_value=_mock_credentials()), \
         patch('app.cloud_spend.requests.post', side_effect=fake_post):
        fetch_monthly_gcp_costs(_config(), months=12)

    assert 'TIMESTAMP_SUB' not in captured['query']
    assert 'DATE_SUB(CURRENT_DATE(), INTERVAL 12 MONTH)' in captured['query']
    assert 'DATE(usage_start_time) >=' in captured['query']


def test_fetch_monthly_gcp_costs_parses_rows():
    def fake_post(url, headers=None, json=None, timeout=None):
        resp = MagicMock()
        resp.status_code = 200
        resp.json.return_value = {
            'jobComplete': True,
            'rows': [
                {'f': [{'v': '2026-06'}, {'v': '8.396036'}]},
                {'f': [{'v': '2026-07'}, {'v': '12.95611'}]},
            ],
        }
        return resp

    with patch('app.cloud_spend._credentials', return_value=_mock_credentials()), \
         patch('app.cloud_spend.requests.post', side_effect=fake_post):
        result = fetch_monthly_gcp_costs(_config(), months=12)

    assert result == [
        {'month': '2026-06', 'cost': 8.396036},
        {'month': '2026-07', 'cost': 12.95611},
    ]


def test_fetch_monthly_gcp_costs_raises_when_table_unset():
    with patch('app.cloud_spend._credentials', return_value=_mock_credentials()):
        try:
            fetch_monthly_gcp_costs(_config(CLOUD_SPEND_BILLING_TABLE=''), months=12)
            assert False, 'expected CloudSpendUnavailable'
        except CloudSpendUnavailable:
            pass


def test_fetch_monthly_gcp_costs_raises_when_project_unset():
    with patch('app.cloud_spend._credentials', return_value=_mock_credentials()):
        try:
            fetch_monthly_gcp_costs(_config(CLOUD_SPEND_BILLING_PROJECT_ID=''), months=12)
            assert False, 'expected CloudSpendUnavailable'
        except CloudSpendUnavailable:
            pass


def test_fetch_monthly_gcp_costs_raises_on_query_not_complete():
    def fake_post(url, headers=None, json=None, timeout=None):
        resp = MagicMock()
        resp.status_code = 200
        resp.json.return_value = {'jobComplete': False}
        return resp

    with patch('app.cloud_spend._credentials', return_value=_mock_credentials()), \
         patch('app.cloud_spend.requests.post', side_effect=fake_post):
        try:
            fetch_monthly_gcp_costs(_config(), months=12)
            assert False, 'expected CloudSpendUnavailable'
        except CloudSpendUnavailable:
            pass
