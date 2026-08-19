"""The character-creation rollout gate must be flippable from Settings.

The whole point of putting the gate in app_settings rather than an env var is
that launching does not need a redeploy — so the control has to actually render
and actually save.
"""

from tests.test_settings_bot_commands import _app, _set_session

from app.app_settings import get_app_setting
from app.db import AppSetting, db


def _stored(app, key):
    with app.app_context():
        record = db.session.get(AppSetting, key)
        return record.value if record else None


def test_rollout_control_renders_with_every_mode():
    app = _app()
    client = app.test_client()
    _set_session(client, '12345')
    html = client.get('/settings/?section=web-flags-tuning').get_data(as_text=True)

    assert 'CHARACTER_CREATION_MODE' in html
    assert 'Rollout Mode' in html
    for mode in ('off', 'staff', 'everyone'):
        assert f'value="{mode}"' in html
    assert 'CHARACTER_CREATION_PILOT_DISCORD_IDS' in html


def test_mode_can_be_changed_from_settings():
    app = _app()
    client = app.test_client()
    _set_session(client, '12345')

    res = client.post('/settings/update', data={
        'key': 'CHARACTER_CREATION_MODE',
        'action': 'set',
        'value': 'staff',
        'section': 'web-flags-tuning',
    })
    assert res.status_code in (302, 200)
    assert _stored(app, 'CHARACTER_CREATION_MODE') == 'staff'

    with app.app_context():
        assert get_app_setting('CHARACTER_CREATION_MODE') == 'staff'


def test_pilot_ids_can_be_set_from_settings():
    app = _app()
    client = app.test_client()
    _set_session(client, '12345')

    client.post('/settings/update', data={
        'key': 'CHARACTER_CREATION_PILOT_DISCORD_IDS',
        'action': 'set',
        'value': '111,222',
        'section': 'web-flags-tuning',
    })
    assert _stored(app, 'CHARACTER_CREATION_PILOT_DISCORD_IDS') == '111,222'


def test_mode_is_stored_as_a_string_not_coerced_to_bool():
    """It sits among boolean flags; coercion would turn 'staff' into True."""
    app = _app()
    client = app.test_client()
    _set_session(client, '12345')

    client.post('/settings/update', data={
        'key': 'CHARACTER_CREATION_MODE',
        'action': 'set',
        'value': 'everyone',
        'section': 'web-flags-tuning',
    })
    assert _stored(app, 'CHARACTER_CREATION_MODE') == 'everyone'
