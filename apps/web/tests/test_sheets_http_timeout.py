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
        # Opening is deferred, so the retry loop runs on first access, not in
        # __init__ -- keep the access inside the patch or the sleeps are real.
        assert client.spreadsheet == 'the-spreadsheet'
    assert mock_gc.open_by_key.call_count == 3


def test_open_with_retry_gives_up_after_max_retries_on_persistent_timeout():
    with patch('app.sheets.gspread.authorize') as mock_authorize, \
         patch('app.sheets.Credentials'), \
         patch('app.sheets.time.sleep'):
        mock_gc = MagicMock()
        mock_gc.open_by_key.side_effect = requests.exceptions.Timeout('read timed out')
        mock_authorize.return_value = mock_gc
        client = SheetsClient(
            credentials_file='x', spreadsheet_id='y', credentials_json='{}',
            startup_max_retries=2,
        )
        try:
            client.spreadsheet
            raised = False
        except requests.exceptions.Timeout:
            raised = True
    assert raised
    assert mock_gc.open_by_key.call_count == 3  # initial attempt + 2 retries


def test_constructing_the_client_opens_nothing():
    """Construction must not touch the network.

    create_app() builds this client on the startup path, so any network call in
    __init__ runs before the app can answer a health check.
    """
    with patch('app.sheets.gspread.authorize') as mock_authorize, \
         patch('app.sheets.Credentials'):
        mock_gc = MagicMock()
        mock_authorize.return_value = mock_gc
        SheetsClient(credentials_file='x', spreadsheet_id='y', credentials_json='{}')
    mock_gc.open_by_key.assert_not_called()


def test_construction_survives_sheets_being_completely_unavailable():
    """The regression this file exists for, in its final form.

    On 2026-09-01 a network degradation in us-central1-b made this open slow,
    and because it ran in __init__ the retry loop (up to ~136s: 5 retries, 15s
    timeout, backoff from 1.5s) consumed Cloud Run's 150s startup-probe budget.
    Instances never became ready, so prod served nothing for an hour -- brought
    down by a backup mirror the app never reads for primary data.

    Constructing the client must therefore succeed even when Sheets is entirely
    unreachable. The failure is deferred to whoever actually wants a spreadsheet.
    """
    with patch('app.sheets.gspread.authorize') as mock_authorize, \
         patch('app.sheets.Credentials'), \
         patch('app.sheets.time.sleep'):
        mock_gc = MagicMock()
        mock_gc.open_by_key.side_effect = requests.exceptions.ConnectionError('unreachable')
        mock_authorize.return_value = mock_gc

        client = SheetsClient(credentials_file='x', spreadsheet_id='y', credentials_json='{}')
        mock_gc.open_by_key.assert_not_called()

        try:
            client.spreadsheet
            raised = False
        except requests.exceptions.ConnectionError:
            raised = True
    assert raised


def test_spreadsheet_is_opened_once_and_reused():
    with patch('app.sheets.gspread.authorize') as mock_authorize, \
         patch('app.sheets.Credentials'):
        mock_gc = MagicMock()
        mock_gc.open_by_key.return_value = 'the-spreadsheet'
        mock_authorize.return_value = mock_gc

        client = SheetsClient(credentials_file='x', spreadsheet_id='y', credentials_json='{}')
        assert client.spreadsheet == 'the-spreadsheet'
        assert client.spreadsheet == 'the-spreadsheet'
    assert mock_gc.open_by_key.call_count == 1
