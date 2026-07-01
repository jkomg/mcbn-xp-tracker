"""Regression test: SheetsClient must bound its HTTP client's timeout.

Without this, a slow/degraded Google Sheets API response hangs the whole
gunicorn worker for minutes at startup instead of failing fast into the
retry loop, which can leave Cloud Run routing live traffic to a container
that's stuck inside create_app() and unable to serve any request.
"""

from unittest.mock import MagicMock, patch

from app.sheets import SheetsClient


def _make_client(**kwargs):
    with patch('app.sheets.gspread.authorize') as mock_authorize, \
         patch('app.sheets.Credentials'):
        mock_gc = MagicMock()
        mock_authorize.return_value = mock_gc
        SheetsClient(credentials_file='x', spreadsheet_id='y', credentials_json='{}', **kwargs)
    return mock_gc


def test_sheets_client_sets_default_http_timeout():
    mock_gc = _make_client()
    assert mock_gc.http_client.timeout == 15.0


def test_sheets_client_respects_configured_timeout():
    mock_gc = _make_client(http_timeout_seconds=5.0)
    assert mock_gc.http_client.timeout == 5.0
