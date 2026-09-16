import time

import pytest
from flask import Flask

import app as app_module
from app.blueprints.api import bp as api_bp
import app.blueprints.api as api_module
from app.db import DbCharacter, DbPlayPeriod, db
from app.db_service import DBService


@pytest.fixture()
def app_ctx():
    app = Flask(__name__)
    app.config['TESTING'] = True
    app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///:memory:'
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    app.config['WEB_APP_API_TOKEN'] = 'legacy-token'
    app.config['WEB_APP_API_READ_TOKEN'] = 'read-token'
    app.config['WEB_APP_API_WRITE_TOKEN'] = 'write-token'
    app.config['BOT_API_REPLAY_PROTECTION_ENABLED'] = True
    app.config['BOT_API_REPLAY_WINDOW_SECONDS'] = 300
    app.config['BOT_API_NONCE_TTL_SECONDS'] = 600
    app.config['BOT_API_NONCE_CACHE_SIZE'] = 1000
    app.config['ALLOWED_DISCORD_IDS'] = {'999999999999999999'}
    db.init_app(app)
    app.register_blueprint(api_bp, url_prefix='/api')
    with app.app_context():
        db.create_all()
        app_module.db_service = DBService()
        api_module.db_service = app_module.db_service
        yield app


def _write_headers(token='write-token', nonce='n1'):
    return {
        'Authorization': f'Bearer {token}',
        'X-Request-Timestamp': str(int(time.time())),
        'X-Request-Nonce': nonce,
    }


def _seed_character_period():
    # Real calendar nights, not invented ones. Blank release is now gated on the
    # game calendar, so a night the calendar has never heard of (the old 101/102)
    # is held rather than released. Night 68 opens 2026-08-25 and its blanks come
    # due on Night 69 (2026-09-08) — both safely in the past, so these stay
    # deterministic as time passes.
    db.session.add(DbCharacter(character_name='Aludra', player_discord='111111111111111111', active=True, status='active'))
    db.session.add(DbPlayPeriod(period_label='Night 68 - 8/25 - 9/6', night_number=68, submissions_open=True, active=True))
    db.session.commit()


def test_blank_and_release_cycle(app_ctx):
    svc = DBService()
    _seed_character_period()

    svc.set_character_background('Aludra', 'Allies', 3, 'test')
    result = svc.blank_character_background('Aludra', 'Allies', 2, 68, 'test')
    assert result['dots_blanked_total'] == 2
    assert result['release_night_number'] == 69

    rows = svc.get_character_backgrounds('Aludra')
    assert rows[0]['dots_available'] == 1

    released_none = svc.release_due_background_blanks(68)
    assert released_none == []

    released = svc.release_due_background_blanks(69)
    assert len(released) == 1
    assert released[0]['background_name'] == 'Allies'
    assert released[0]['dots_released'] == 2

    rows_after = svc.get_character_backgrounds('Aludra')
    assert rows_after[0]['dots_blanked'] == 0
    assert rows_after[0]['dots_available'] == 3


def test_blank_consecutive_nights_keeps_each_lot_on_its_own_night(app_ctx):
    svc = DBService()
    _seed_character_period()
    svc.set_character_background('Aludra', 'Allies', 3, 'test')

    # Night 68 blank: due on 69 (first night after the 9/6-9/8 downtime)
    first = svc.blank_character_background('Aludra', 'Allies', 1, 68, 'test')
    assert first['release_night_number'] == 69

    # Night 69 blank without running the release worker first. Blanking never
    # releases anything any more, so the first lot is still out; the new lot
    # is due after the next downtime (Night 73).
    second = svc.blank_character_background('Aludra', 'Allies', 1, 69, 'test')
    assert second['release_night_number'] == 73
    assert second['next_release_night_number'] == 69
    assert second['dots_blanked_total'] == 2
    assert second['dots_available'] == 1

    # The worker then returns only the Night 69 lot.
    released = svc.release_due_background_blanks(69)
    assert [r['dots_released'] for r in released] == [1]
    row = svc.get_character_backgrounds('Aludra')[0]
    assert row['dots_blanked'] == 1
    assert row['release_night_number'] == 73


def test_blank_background_api_enforces_owner(app_ctx):
    svc = DBService()
    _seed_character_period()
    svc.set_character_background('Aludra', 'Resources', 2, 'test')

    with app_ctx.test_client() as client:
        # non-owner requester
        res = client.post(
            '/api/backgrounds/blank',
            headers=_write_headers(nonce='owner-1'),
            json={
                'requesterDiscordId': '222222222222222222',
                'requesterDiscordName': 'player2',
                'characterName': 'Aludra',
                'backgroundName': 'Resources',
                'dots': 1,
            },
        )
        assert res.status_code == 403

        # owner requester
        ok = client.post(
            '/api/backgrounds/blank',
            headers=_write_headers(nonce='owner-2'),
            json={
                'requesterDiscordId': '111111111111111111',
                'requesterDiscordName': 'player1',
                'characterName': 'Aludra',
                'backgroundName': 'Resources',
                'dots': 1,
            },
        )
        assert ok.status_code == 200
        data = ok.get_json()
        assert data['ok'] is True
        assert data['result']['dots_blanked_now'] == 1


def test_release_due_backgrounds_api_returns_released(app_ctx):
    svc = DBService()
    _seed_character_period()
    svc.set_character_background('Aludra', 'Contacts', 2, 'test')
    svc.blank_character_background('Aludra', 'Contacts', 1, 68, 'test')

    with app_ctx.test_client() as client:
        res = client.post('/api/backgrounds/release-due', headers=_write_headers(nonce='release-1'))
        assert res.status_code == 200
        payload = res.get_json()
        # current night is still 68 so nothing due yet
        assert payload['released'] == []

    # simulate next night opening
    with app_ctx.app_context():
        period = DbPlayPeriod.query.filter_by(period_label='Night 68 - 8/25 - 9/6').first()
        assert period is not None
        period.submissions_open = False
        db.session.add(DbPlayPeriod(period_label='Night 69 - 9/8 - 9/20', night_number=69, submissions_open=True, active=True))
        db.session.commit()

    with app_ctx.test_client() as client:
        res = client.post('/api/backgrounds/release-due', headers=_write_headers(nonce='release-2'))
        assert res.status_code == 200
        payload = res.get_json()
        assert len(payload['released']) == 1
        assert payload['released'][0]['background_name'] == 'Contacts'
        assert payload['released'][0]['dots_released'] == 1


# ---------------------------------------------------------------------------
# Issue #431: release is gated on the night having begun, not on its period
# being open for submissions
# ---------------------------------------------------------------------------

def _hold_release(monkeypatch, answer):
    """Force night_has_started's answer for the release gate.

    The not-yet-started case needs a night in the future, and every real
    calendar night eventually stops being one, so the gate's answer is injected
    rather than pinned to a date that expires. `night_has_started` itself is
    tested against real calendar data in test_game_calendar_night_start.py.
    """
    # app/__init__.py binds a DBService *instance* as app.db_service, shadowing
    # the module of the same name, so import_module is needed to reach it.
    import importlib
    db_service_module = importlib.import_module('app.db_service')
    monkeypatch.setattr(db_service_module, 'night_has_started',
                        lambda night_number, today=None: answer)


def test_opening_the_period_early_does_not_return_the_dots(app_ctx, monkeypatch):
    """The 2026-09-04 report: Night 69's period was open, Night 69 had not
    started, and 3 dots came back four days early."""
    svc = DBService()
    _seed_character_period()
    svc.set_character_background('Aludra', 'Mawla', 3, 'test')
    svc.blank_character_background('Aludra', 'Mawla', 3, 68, 'test')

    _hold_release(monkeypatch, False)
    released = svc.release_due_background_blanks(69)

    assert released == []
    assert svc.get_character_backgrounds('Aludra')[0]['dots_blanked'] == 3


def test_the_dots_return_once_the_night_actually_starts(app_ctx, monkeypatch):
    svc = DBService()
    _seed_character_period()
    svc.set_character_background('Aludra', 'Mawla', 3, 'test')
    svc.blank_character_background('Aludra', 'Mawla', 3, 68, 'test')

    _hold_release(monkeypatch, False)
    assert svc.release_due_background_blanks(69) == []

    _hold_release(monkeypatch, True)
    released = svc.release_due_background_blanks(69)

    assert len(released) == 1
    assert released[0]['dots_released'] == 3
    assert svc.get_character_backgrounds('Aludra')[0]['dots_available'] == 3


def test_a_night_the_calendar_does_not_know_is_held_not_released(app_ctx, monkeypatch):
    """Holding is recoverable — staff can see it and the calendar can be
    extended. Releasing on an unknown date is not."""
    svc = DBService()
    _seed_character_period()
    svc.set_character_background('Aludra', 'Mawla', 2, 'test')
    svc.blank_character_background('Aludra', 'Mawla', 2, 68, 'test')

    _hold_release(monkeypatch, None)
    released = svc.release_due_background_blanks(69)

    assert released == []
    assert svc.get_character_backgrounds('Aludra')[0]['dots_blanked'] == 2


def test_the_period_condition_still_applies(app_ctx, monkeypatch):
    """Both conditions are kept, so the gate can only ever delay a release. A
    blank not yet due by night number stays blanked even if the calendar would
    allow it."""
    svc = DBService()
    _seed_character_period()
    svc.set_character_background('Aludra', 'Mawla', 2, 'test')
    svc.blank_character_background('Aludra', 'Mawla', 2, 68, 'test')

    _hold_release(monkeypatch, True)
    assert svc.release_due_background_blanks(68) == []
    assert svc.get_character_backgrounds('Aludra')[0]['dots_blanked'] == 2


def test_stacking_never_pushes_a_held_blanks_release_out(app_ctx, monkeypatch):
    """A held blank's release must not move later because the player blanked
    something else -- the Codex P1 on #434. With a lot per blank, the new dot
    gets its own night and the held one keeps its own.
    """
    svc = DBService()
    _seed_character_period()
    svc.set_character_background('Aludra', 'Mawla', 3, 'test')

    first = svc.blank_character_background('Aludra', 'Mawla', 1, 68, 'test')
    assert first['release_night_number'] == 69

    # Night 69's period is open but the night has not started, so the first dot
    # is held. Blanking again must not reschedule it to 73.
    _hold_release(monkeypatch, False)
    second = svc.blank_character_background('Aludra', 'Mawla', 1, 69, 'test')

    assert second['dots_blanked_total'] == 2
    assert second['next_release_night_number'] == 69, 'the held dot keeps its night'
    assert second['release_night_number'] == 73, 'the new dot is not brought forward to it'
    lots = svc.get_character_backgrounds('Aludra')[0]['blanks']
    assert [(lot['dots'], lot['release_night_number']) for lot in lots] == [(1, 69), (1, 73)]


def test_taking_a_new_blank_does_not_release_a_held_one_early(app_ctx, monkeypatch):
    """The second release path. blank_character_background auto-releases an
    older due blank before stacking a new one, and used the same flag-based
    comparison — so blanking again during an early-opened period returned the
    earlier dots early too."""
    svc = DBService()
    _seed_character_period()
    svc.set_character_background('Aludra', 'Mawla', 3, 'test')
    svc.blank_character_background('Aludra', 'Mawla', 1, 68, 'test')

    _hold_release(monkeypatch, False)
    second = svc.blank_character_background('Aludra', 'Mawla', 1, 69, 'test')

    # The held dot is still blanked, so this stacks on top of it rather than
    # replacing it.
    assert second['dots_blanked_total'] == 2
    assert second['dots_available'] == 1
