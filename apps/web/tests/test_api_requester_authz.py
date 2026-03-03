from flask import Flask

from app.blueprints import api as api_module
from app.blueprints.api import bp as api_bp
from app.models import Character, PlayPeriod


def _app(fake_sheets):
    app = Flask(__name__)
    app.config['TESTING'] = True
    app.config['WEB_APP_API_TOKEN'] = 'legacy-token'
    app.config['WEB_APP_API_READ_TOKEN'] = ''
    app.config['WEB_APP_API_WRITE_TOKEN'] = ''
    app.config['BOT_API_REPLAY_PROTECTION_ENABLED'] = False
    app.config['ALLOWED_DISCORD_IDS'] = ['999999999999999999']
    app.register_blueprint(api_bp, url_prefix='/api')

    api_module.sheets_client = fake_sheets
    api_module.limiter = None
    return app


class FakeSheets:
    def __init__(self):
        self.claims = []
        self.spends = []
        self.audit = []

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
