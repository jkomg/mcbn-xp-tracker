"""Tests for the Discord dashboard-link helper.

send_alert() (immediate per-occurrence posting) was removed — alerting is
now escalation-only (see test_discord_escalation.py). This file only
covers what's left: dashboard_link(), still used to build the deep link
included in escalation alerts.
"""

from app import discord_alert


def test_dashboard_link_builds_filtered_url_from_redirect_uri():
    link = discord_alert.dashboard_link(
        'https://mcbn.jkomg.us/auth/callback', source='bot', level='warn', event='wiki_sync_stale',
    )
    assert link == 'https://mcbn.jkomg.us/audit/errors?source=bot&level=warn&event=wiki_sync_stale'


def test_dashboard_link_empty_when_redirect_uri_unset():
    assert discord_alert.dashboard_link('', source='web', level='error', event='x') == ''
