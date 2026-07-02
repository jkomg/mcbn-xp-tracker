"""Tests for _upgrade_with_race_retry (Codex P1 on #318).

DDL-level idempotency alone doesn't stop two concurrent workers racing
Alembic's own alembic_version bookkeeping UPDATE — the loser raises
CommandError even though the schema ended up correct. This retries once,
tolerating exactly that race while still surfacing genuine failures.
"""

from unittest.mock import MagicMock

import pytest

from app import _upgrade_with_race_retry


def test_succeeds_immediately_when_no_race():
    upgrade_fn = MagicMock()
    _upgrade_with_race_retry(upgrade_fn)
    upgrade_fn.assert_called_once()


def test_retries_once_after_a_failure_and_succeeds():
    upgrade_fn = MagicMock(side_effect=[RuntimeError('expected to match one row... 0 found'), None])
    _upgrade_with_race_retry(upgrade_fn)
    assert upgrade_fn.call_count == 2


def test_genuine_failure_still_raises_after_retry():
    upgrade_fn = MagicMock(side_effect=RuntimeError('column does not exist'))
    with pytest.raises(RuntimeError):
        _upgrade_with_race_retry(upgrade_fn)
    assert upgrade_fn.call_count == 2
