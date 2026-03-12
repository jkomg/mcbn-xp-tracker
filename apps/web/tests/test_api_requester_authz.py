from flask import Flask

from app.blueprints import api as api_module
from app.blueprints.api import bp as api_bp
from app.models import Character, PlayPeriod, XPClaim, SpendRequest


def _app(fake_sheets):
    app = Flask(__name__)
    app.config['TESTING'] = True
    app.config['WEB_APP_API_TOKEN'] = 'legacy-token'
    app.config['WEB_APP_API_READ_TOKEN'] = ''
    app.config['WEB_APP_API_WRITE_TOKEN'] = ''
    app.config['BOT_API_REPLAY_PROTECTION_ENABLED'] = False
    app.config['ALLOWED_DISCORD_IDS'] = ['999999999999999999']
    app.config['AUTO_CREATE_PERIODS_ENABLED'] = True
    app.config['AUTO_CREATE_PERIODS_OPEN_LEAD_DAYS'] = 1
    app.config['AUTO_CREATE_PERIODS_DEFAULT_LENGTH_DAYS'] = 14
    app.config['AUTO_CREATE_PERIODS_DEFAULT_GAP_DAYS'] = 0
    app.register_blueprint(api_bp, url_prefix='/api')

    api_module.db_service = fake_sheets
    api_module.limiter = None
    return app


class FakeSheets:
    def __init__(self):
        self.claims = []
        self.spends = []
        self.audit = []
        self.auto_create_calls = []

    def get_active_characters(self):
        return [
            Character(character_name='Alice', player_discord='111111111111111111', active=True),
            Character(character_name='Bob', player_discord='222222222222222222', active=True),
            Character(character_name='Retired', player_discord='111111111111111111', active=False),
        ]

    def get_characters_by_discord_id(self, discord_id: str):
        return [c for c in self.get_active_characters() if c.player_discord == str(discord_id)]

    def get_all_periods(self):
        return [PlayPeriod(period_label='Night 77', night_number=77, submissions_open=True, active=True)]

    def get_character(self, name: str):
        for c in self.get_active_characters():
            if c.character_name == name:
                return c
        return None

    def get_xp_totals(self, _name: str):
        return {'earned_xp': 4, 'total_xp': 22, 'total_spends': 3, 'ledger_spent': 1, 'available_xp': 18}

    def submit_xp_claim(self, character_name: str, play_period: str, categories: dict):
        self.claims.append((character_name, play_period, categories))

    def submit_spend_request(self, **kwargs):
        self.spends.append(kwargs)
        return 6

    def log_action(self, **kwargs):
        self.audit.append(kwargs)

    def get_all_claims(self):
        return [
            XPClaim(
                row_index=10,
                character_name='Alice',
                play_period='Night 77',
                status='Approved',
                xp_claimed=3,
                approved_xp=2,
                reviewed_by='Storyteller',
                review_date='20260303 10:00:00',
                st_notes='Nice RP.',
            ),
            XPClaim(
                row_index=11,
                character_name='Bob',
                play_period='Night 77',
                status='Pending',
                xp_claimed=2,
                approved_xp=0,
                reviewed_by='',
                review_date='',
                st_notes='',
            ),
        ]

    def get_all_spends(self):
        return [
            SpendRequest(
                row_index=22,
                character_name='Alice',
                spend_category='Merit/Background',
                trait_name='Status',
                current_dots=2,
                new_dots=3,
                xp_cost=3,
                verified_cost=3,
                status='Approved',
                reviewed_by='Storyteller',
                review_date='20260303 11:00:00',
                st_notes='Approved in full.',
            ),
            SpendRequest(
                row_index=23,
                character_name='Alice',
                spend_category='Skill',
                trait_name='Firearms',
                current_dots=3,
                new_dots=4,
                xp_cost=12,
                verified_cost=0,
                status='Denied',
                reviewed_by='Storyteller',
                review_date='20260303 12:00:00',
                st_notes='Need more RP support.',
            ),
        ]

    def auto_create_next_period_if_due(
        self,
        *,
        open_lead_days: int = 1,
        default_length_days: int = 14,
        default_gap_days: int = 0,
        now=None,
    ):
        self.auto_create_calls.append(
            {
                'open_lead_days': open_lead_days,
                'default_length_days': default_length_days,
                'default_gap_days': default_gap_days,
            }
        )
        return {
            'created': True,
            'reason': 'created',
            'period': PlayPeriod(
                period_label='Night 78 - 3/8 - 3/22',
                night_number=78,
                start_date='20260308',
                end_date='20260322',
                session_number=78,
                submissions_open=True,
                active=True,
            ),
        }


class FakeReminderSheets(FakeSheets):
    def get_all_claims(self):
        return [
            XPClaim(
                row_index=10,
                character_name='Alice',
                play_period='Night 77',
                status='Approved',
                xp_claimed=3,
                approved_xp=3,
                reviewed_by='Storyteller',
                review_date='20260303 10:00:00',
                st_notes='',
            ),
        ]


def _auth(token='legacy-token'):
    return {'Authorization': f'Bearer {token}'}


def test_claim_context_requires_requester_and_filters_to_owner():
    app = _app(FakeSheets())
    with app.test_client() as client:
        missing = client.get('/api/meta/claim-context', headers=_auth())
        assert missing.status_code == 400

        own = client.get(
            '/api/meta/claim-context?requesterDiscordId=111111111111111111',
            headers=_auth(),
        )
        assert own.status_code == 200
        body = own.get_json()
        assert body['activeCharacters'] == ['Alice']
        assert body['openPeriods'] == ['Night 77']


def test_staff_test_mode_can_emulate_player_scope():
    app = _app(FakeSheets())
    with app.test_client() as client:
        res = client.get(
            '/api/meta/claim-context?requesterDiscordId=999999999999999999&testMode=true&testAsDiscordId=222222222222222222',
            headers=_auth(),
        )
        assert res.status_code == 200
        body = res.get_json()
        assert body['activeCharacters'] == ['Bob']


def test_non_staff_cannot_use_test_mode():
    app = _app(FakeSheets())
    with app.test_client() as client:
        res = client.get(
            '/api/meta/claim-context?requesterDiscordId=111111111111111111&testMode=true',
            headers=_auth(),
        )
        assert res.status_code == 403


def test_summary_requires_character_ownership_for_non_staff():
    app = _app(FakeSheets())
    with app.test_client() as client:
        allowed = client.get(
            '/api/characters/Alice/summary?requesterDiscordId=111111111111111111',
            headers=_auth(),
        )
        assert allowed.status_code == 200

        blocked = client.get(
            '/api/characters/Bob/summary?requesterDiscordId=111111111111111111',
            headers=_auth(),
        )
        assert blocked.status_code == 404


def test_claim_and_spend_include_requester_and_enforce_ownership():
    fake = FakeSheets()
    app = _app(fake)
    with app.test_client() as client:
        blocked_claim = client.post(
            '/api/claims',
            headers=_auth(),
            json={
                'characterName': 'Bob',
                'playPeriod': 'Night 77',
                'requesterDiscordId': '111111111111111111',
                'requesterDiscordName': 'alice-user',
                'categories': {'posted_once': 'https://discord.com/channels/1/2/3'},
            },
        )
        assert blocked_claim.status_code == 404

        ok_claim = client.post(
            '/api/claims',
            headers=_auth(),
            json={
                'characterName': 'Alice',
                'playPeriod': 'Night 77',
                'requesterDiscordId': '111111111111111111',
                'requesterDiscordName': 'alice-user',
                'categories': {'posted_once': 'https://discord.com/channels/1/2/3'},
            },
        )
        assert ok_claim.status_code == 201

        ok_spend = client.post(
            '/api/spends',
            headers=_auth(),
            json={
                'characterName': 'Alice',
                'spendCategory': 'Merit/Background',
                'traitName': 'Status',
                'currentDots': 0,
                'newDots': 2,
                'justification': 'Bot flow',
                'isInClan': False,
                'requesterDiscordId': '111111111111111111',
                'requesterDiscordName': 'alice-user',
            },
        )
        assert ok_spend.status_code == 201
        assert fake.audit
        assert fake.audit[-1]['staff_user'] == 'bot-api:111111111111111111'


def test_review_events_returns_only_reviewed_claims_and_spends():
    app = _app(FakeSheets())
    with app.test_client() as client:
        res = client.get('/api/review-events?sinceEpoch=0&limit=10', headers=_auth())
        assert res.status_code == 200
        body = res.get_json()
        assert 'events' in body
        events = body['events']
        assert len(events) == 3
        assert {e['kind'] for e in events} == {'claim', 'spend'}
        assert all(e['status'] in {'approved', 'denied'} for e in events)

        denied_spend = next(e for e in events if e['kind'] == 'spend' and e['status'] == 'denied')
        assert denied_spend['traitName'] == 'Firearms'
        assert denied_spend['staffNotes'] == 'Need more RP support.'


def test_claim_reminder_targets_returns_unsubmitted_active_characters():
    app = _app(FakeReminderSheets())
    with app.test_client() as client:
        res = client.get('/api/meta/claim-reminder-targets', headers=_auth())
        assert res.status_code == 200
        body = res.get_json()
        assert body['currentNight'] == 'Night 77'
        assert body['targets'] == [
            {'discordId': '222222222222222222', 'characterName': 'Bob'},
        ]


def test_auto_create_period_route_uses_configured_parameters():
    fake = FakeSheets()
    app = _app(fake)
    with app.test_client() as client:
        res = client.post('/api/periods/auto-create', headers=_auth())
        assert res.status_code == 201
        body = res.get_json()
        assert body['created'] is True
        assert body['periodLabel'] == 'Night 78 - 3/8 - 3/22'
        assert fake.auto_create_calls
        assert fake.auto_create_calls[-1]['open_lead_days'] == 1
