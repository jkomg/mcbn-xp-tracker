"""Tests for character-creator schema version awareness (app/cc_schema.py)."""

from app.cc_schema import (
    CURRENT_SCHEMA_VERSION,
    MINIMUM_SUPPORTED_VERSION,
    draft_schema_version,
    is_outdated,
    schema_changes_since,
)


def test_reads_the_version_off_a_draft():
    assert draft_schema_version({'version': 8}) == 8


def test_unknown_version_is_none_not_zero():
    """None means 'unknown', which callers must not confuse with version 0."""
    assert draft_schema_version({}) is None
    assert draft_schema_version(None) is None
    assert draft_schema_version({'version': 'eight'}) is None
    assert draft_schema_version('not a dict') is None


def test_current_version_draft_is_not_outdated():
    assert is_outdated({'version': CURRENT_SCHEMA_VERSION}) is False


def test_older_and_unversioned_drafts_are_outdated():
    assert is_outdated({'version': CURRENT_SCHEMA_VERSION - 1}) is True
    assert is_outdated({}) is True


def test_a_newer_draft_is_not_flagged_outdated():
    """If a deploy lags the creator, a newer draft is not 'old' — flagging it
    would tell staff the opposite of what is true."""
    assert is_outdated({'version': CURRENT_SCHEMA_VERSION + 1}) is False


def test_changes_since_lists_only_what_the_draft_has_missed():
    changes = schema_changes_since({'version': 7})
    assert any(c.startswith('v8:') for c in changes)
    assert not any(c.startswith('v7:') for c in changes)


def test_current_draft_has_no_outstanding_changes():
    assert schema_changes_since({'version': CURRENT_SCHEMA_VERSION}) == []


def test_unversioned_draft_lists_every_recorded_change():
    changes = schema_changes_since({})
    assert any(c.startswith('v7:') for c in changes)
    assert any(c.startswith('v8:') for c in changes)


def test_version_constants_are_sane():
    assert MINIMUM_SUPPORTED_VERSION < CURRENT_SCHEMA_VERSION
