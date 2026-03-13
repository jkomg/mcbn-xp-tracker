from flask import Flask

from app.blueprints import roster as roster_module
from app.blueprints.roster import bp as roster_bp
from app.models import Character


class FakeSheets:
    def __init__(self):
        self.char = Character(character_name='Tulip Miller', creation_xp=5)
        self.updates = []
        self.logs = []

    def get_character(self, name: str):
        if name == self.char.character_name:
            return self.char
        return None

    def update_character(self, _name: str, updates: dict):
        self.updates.append(updates)
        for key, value in updates.items():
            setattr(self.char, key, value)

    def log_action(self, **kwargs):
        self.logs.append(kwargs)



def _app(fake_sheets: FakeSheets):
    app = Flask(__name__)
    app.config['TESTING'] = True
    app.secret_key = 'test-secret'
    app.register_blueprint(roster_bp, url_prefix='/roster')
    roster_module.db_service = fake_sheets
    return app



def test_edit_allows_blank_creation_xp_and_resets_to_zero():
    fake = FakeSheets()
    app = _app(fake)

    with app.test_client() as client:
        with client.session_transaction() as sess:
            sess['authenticated'] = True
            sess['staff_user'] = 'Tester'

        res = client.post(
            '/roster/Tulip Miller/edit',
            data={
                'player_discord': '',
                'player_discord_name': '',
                'clan': '',
                'age_category': '',
                'sect': '',
                'enemy': '',
                'notes': '',
                'creation_xp': '',
            },
            follow_redirects=False,
        )

    assert res.status_code == 302
    assert fake.updates == [{'creation_xp': 0}]



def test_edit_rejects_non_numeric_creation_xp_without_crashing():
    fake = FakeSheets()
    app = _app(fake)

    with app.test_client() as client:
        with client.session_transaction() as sess:
            sess['authenticated'] = True
            sess['staff_user'] = 'Tester'

        res = client.post(
            '/roster/Tulip Miller/edit',
            data={
                'player_discord': '',
                'player_discord_name': '',
                'clan': '',
                'age_category': '',
                'sect': '',
                'enemy': '',
                'notes': '',
                'creation_xp': 'abc',
            },
            follow_redirects=False,
        )

    assert res.status_code == 302
    assert res.headers['Location'].endswith('/roster/Tulip%20Miller/edit')
    assert fake.updates == []
