"""Regression test: SheetsClient must bound its HTTP client's timeout.

Without this, a slow/degraded Google Sheets API response hangs the whole
gunicorn worker for minutes at startup instead of failing fast into the
retry loop, which can leave Cloud Run routing live traffic to a container
that's stuck inside create_app() and unable to serve any request.
"""

from unittest.mock import MagicMock, patch

import requests

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


def test_open_with_retry_retries_on_request_timeout_not_just_api_error():
    """The http_client timeout above raises requests.exceptions.Timeout, not
    gspread's APIError — the retry loop must catch that too, or a single slow
    request aborts startup entirely instead of retrying like a 503 would."""
    with patch('app.sheets.gspread.authorize') as mock_authorize, \
         patch('app.sheets.Credentials'), \
         patch('app.sheets.time.sleep'):
        mock_gc = MagicMock()
        mock_gc.open_by_key.side_effect = [
            requests.exceptions.Timeout('read timed out'),
            requests.exceptions.ConnectionError('connection reset'),
            'the-spreadsheet',
        ]
        mock_authorize.return_value = mock_gc
        client = SheetsClient(credentials_file='x', spreadsheet_id='y', credentials_json='{}')
    assert client.spreadsheet == 'the-spreadsheet'
    assert mock_gc.open_by_key.call_count == 3


def test_open_with_retry_gives_up_after_max_retries_on_persistent_timeout():
    with patch('app.sheets.gspread.authorize') as mock_authorize, \
         patch('app.sheets.Credentials'), \
         patch('app.sheets.time.sleep'):
        mock_gc = MagicMock()
        mock_gc.open_by_key.side_effect = requests.exceptions.Timeout('read timed out')
        mock_authorize.return_value = mock_gc
        try:
            SheetsClient(
                credentials_file='x', spreadsheet_id='y', credentials_json='{}',
                startup_max_retries=2,
            )
            raised = False
        except requests.exceptions.Timeout:
            raised = True
    assert raised
    assert mock_gc.open_by_key.call_count == 3  # initial attempt + 2 retries
