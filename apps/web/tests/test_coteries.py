"""Coterie formation: access control, the creation-dot economy, and the
sign-off state machine.

Every case here traces to a specific defect found in the formation flow:
sheets readable by non-members, an arbitrary character picked for
multi-character players, a flaw-removal guard that checked the wrong member's
balance, sign-off transitions with no state guard, and submission silently
burning unspent dots.
"""

import os

from flask import Blueprint, Flask
from flask_wtf.csrf import CSRFProtect

from app.blueprints import coteries as coteries_module
from app.db import (Coterie, CoterieAdvantage, CoterieInvitation, CoterieMember,
                    DbCharacter, db)

_TEMPLATES_DIR = os.path.join(os.path.dirname(__file__), '..', 'app', 'templates')
_STATIC_DIR = os.path.join(os.path.dirname(__file__), '..', 'app', 'static')

STAFF_ID = '900'


def _stub(name: str, routes: list[tuple[str, str]]) -> Blueprint:
    """Blueprint that only exists so base.html's url_for() calls resolve."""
    bp = Blueprint(name, __name__)
    for rule, endpoint in routes:
        bp.add_url_rule(rule, endpoint, lambda **kw: ('stub', 200))
    return bp


_STUBS = [
    _stub('dashboard', [('/login', 'login'), ('/', 'index'), ('/logout', 'logout'),
                        ('/clear-view-as', 'clear_view_as')]),
    _stub('audit', [('/audit/log', 'log'), ('/audit/errors', 'errors')]),
    _stub('cc_admin', [('/cc/drafts', 'draft_list')]),
    _stub('claims', [('/claims/pending', 'pending')]),
    _stub('spends', [('/spends/pending', 'pending')]),
    _stub('periods', [('/periods/', 'list_periods')]),
    _stub('player', [('/player/', 'my_characters'), ('/player/c/<name>', 'character')]),
    _stub('reports', [('/reports/', 'index')]),
    _stub('roster', [('/roster/', 'list_characters'), ('/roster/blanks', 'blanks')]),
    _stub('settings', [('/settings/', 'index')]),
    _stub('wiki', [('/wiki/', 'index')]),
    _stub('local_status', [('/local/status', 'status_page')]),
]


def _app():
    app = Flask(__name__, template_folder=_TEMPLATES_DIR, static_folder=_STATIC_DIR)
    app.config['TESTING'] = True
    app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///:memory:'
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    app.config['SECRET_KEY'] = 'test'
    app.config['WTF_CSRF_ENABLED'] = False
    app.config['ALLOWED_DISCORD_IDS'] = {STAFF_ID}
    db.init_app(app)
    CSRFProtect().init_app(app)
    app.register_blueprint(coteries_module.bp, url_prefix='/coteries')
    for bp in _STUBS:
        app.register_blueprint(bp)
    with app.app_context():
        db.create_all()
    return app


def _client(app, discord_id=None):
    """A logged-in client. Staff sessions carry both keys, as the OAuth
    callback sets `authenticated` alongside `discord_id` for allowlisted users —
    `require_staff` checks the former and `is_staff()` the latter."""
    client = app.test_client()
    if discord_id is not None:
        with client.session_transaction() as sess:
            sess['discord_id'] = discord_id
            if discord_id == STAFF_ID:
                sess['authenticated'] = True
                sess['staff_user'] = 'Staff Tester'
    return client


def _character(name, discord_id):
    return DbCharacter(character_name=name, player_discord=discord_id,
                       active=True, status='active')


def _forming_coterie(app, members, name='The Midnight Accord'):
    """Create a forming coterie. `members` is a list of (char_name, discord_id)."""
    with app.app_context():
        coterie = Coterie(name=name, slug='midnight-accord', status='pending',
                          creation_state='forming')
        db.session.add(coterie)
        db.session.flush()
        for idx, (char_name, discord_id) in enumerate(members):
            char = _character(char_name, discord_id)
            db.session.add(char)
            db.session.flush()
            db.session.add(CoterieMember(
                coterie_id=coterie.id,
                roster_character_id=char.id,
                free_dots_remaining=2,
                role='leader' if idx == 0 else 'member',
            ))
        db.session.commit()
        return coterie.id


def _pool(app, coterie_id):
    with app.app_context():
        return sum(
            m.free_dots_remaining
            for m in CoterieMember.query.filter_by(coterie_id=coterie_id).all()
        )


def _allocated_dots(app, coterie_id):
    """Total dots the coterie has actually committed to traits and domains."""
    with app.app_context():
        coterie = db.session.get(Coterie, coterie_id)
        traits = sum(
            a.dots for a in coterie.advantages
            if a.notes == '__creation__' and a.advantage_type != 'flaw'
        )
        return traits + coterie.chasse + coterie.lien + coterie.portillon


# ---------------------------------------------------------------------------
# Access control: sheets are private to members and staff
# ---------------------------------------------------------------------------

def test_anonymous_visitor_is_sent_to_login():
    app = _app()
    _forming_coterie(app, [('Fiora', '111')])
    resp = _client(app).get('/coteries/midnight-accord')
    assert resp.status_code == 302
    assert '/login' in resp.headers['Location']


def test_non_member_cannot_read_a_coterie_sheet():
    app = _app()
    _forming_coterie(app, [('Fiora', '111')])
    with app.app_context():
        db.session.add(_character('Outsider', '222'))
        db.session.commit()

    assert _client(app, '222').get('/coteries/midnight-accord').status_code == 404


def test_member_and_staff_can_read_the_sheet():
    app = _app()
    _forming_coterie(app, [('Fiora', '111')])

    assert _client(app, '111').get('/coteries/midnight-accord').status_code == 200
    assert _client(app, STAFF_ID).get('/coteries/midnight-accord').status_code == 200


def test_staff_signoff_notes_are_not_exposed_to_non_members():
    app = _app()
    coterie_id = _forming_coterie(app, [('Fiora', '111')])
    with app.app_context():
        db.session.get(Coterie, coterie_id).creation_notes = 'Drop the Haven, too strong.'
        db.session.add(_character('Outsider', '222'))
        db.session.commit()

    # Members are the intended audience for send-back notes...
    assert b'Drop the Haven' in _client(app, '111').get(
        '/coteries/midnight-accord').data
    # ...and nobody else can reach the page that renders them.
    outsider = _client(app, '222').get('/coteries/midnight-accord')
    assert outsider.status_code == 404
    assert b'Drop the Haven' not in outsider.data


def test_index_lists_only_the_players_own_coteries():
    app = _app()
    _forming_coterie(app, [('Fiora', '111')])
    with app.app_context():
        db.session.add(Coterie(name='Other Crew', slug='other-crew', status='active'))
        db.session.add(_character('Outsider', '222'))
        db.session.commit()

    member_body = _client(app, '111').get('/coteries/').data
    assert b'Midnight Accord' in member_body
    assert b'Other Crew' not in member_body

    staff_body = _client(app, STAFF_ID).get('/coteries/').data
    assert b'Midnight Accord' in staff_body and b'Other Crew' in staff_body


# ---------------------------------------------------------------------------
# Multi-character players act as the character actually in the coterie
# ---------------------------------------------------------------------------

def test_allocation_is_credited_to_the_character_in_this_coterie():
    """The player's other character sorts first alphabetically and is not a
    member; the acting character must still be the one in the coterie."""
    app = _app()
    coterie_id = _forming_coterie(app, [('Zara', '111')])
    with app.app_context():
        db.session.add(_character('Aaron', '111'))  # same player, not a member
        db.session.commit()

    resp = _client(app, '111').post(
        '/coteries/midnight-accord/creation/allocate',
        data={'target_kind': 'background', 'target_name': 'Haven', 'dots': 1},
    )
    assert resp.status_code == 302

    with app.app_context():
        adv = CoterieAdvantage.query.filter_by(coterie_id=coterie_id).one()
        assert adv.added_by == 'Zara'


# ---------------------------------------------------------------------------
# The creation-dot economy
# ---------------------------------------------------------------------------

def test_allocating_draws_down_the_shared_pool():
    app = _app()
    coterie_id = _forming_coterie(app, [('Fiora', '111'), ('Marcus', '222')])

    _client(app, '111').post(
        '/coteries/midnight-accord/creation/allocate',
        data={'target_kind': 'chasse', 'dots': 3},
    )

    # 4 dots in the pool, 3 spent — and one member's 2 dots cannot cover it
    # alone, so the pool must be drawn collectively.
    assert _pool(app, coterie_id) == 1
    with app.app_context():
        assert db.session.get(Coterie, coterie_id).chasse == 3


def test_allocation_beyond_the_pool_is_refused():
    app = _app()
    coterie_id = _forming_coterie(app, [('Fiora', '111')])

    _client(app, '111').post(
        '/coteries/midnight-accord/creation/allocate',
        data={'target_kind': 'background', 'target_name': 'Resources', 'dots': 5},
    )

    assert _pool(app, coterie_id) == 2
    assert _allocated_dots(app, coterie_id) == 0


def test_domain_cannot_exceed_the_creation_cap():
    app = _app()
    coterie_id = _forming_coterie(
        app, [('Fiora', '111'), ('Marcus', '222'), ('Kira', '333')])

    _client(app, '111').post(
        '/coteries/midnight-accord/creation/allocate',
        data={'target_kind': 'lien', 'dots': 4},
    )

    with app.app_context():
        assert db.session.get(Coterie, coterie_id).lien == 0
    assert _pool(app, coterie_id) == 6


def test_taking_a_flaw_grants_bonus_dots():
    app = _app()
    coterie_id = _forming_coterie(app, [('Fiora', '111')])

    _client(app, '111').post(
        '/coteries/midnight-accord/creation/flaw',
        data={'flaw_name': 'Adversary', 'dots': 2},
    )

    assert _pool(app, coterie_id) == 4


def test_flaw_removal_is_refused_when_the_pool_cannot_repay_the_bonus():
    """Fiora takes a 2-dot flaw and the coterie spends the whole 6-dot pool.
    Nothing is left to claw back, so the removal must be refused rather than
    leaving 6 dots of traits on a 4-dot budget."""
    app = _app()
    coterie_id = _forming_coterie(app, [('Fiora', '111'), ('Marcus', '222')])

    fiora = _client(app, '111')
    fiora.post('/coteries/midnight-accord/creation/flaw',
               data={'flaw_name': 'Adversary', 'dots': 2})
    fiora.post('/coteries/midnight-accord/creation/allocate',
               data={'target_kind': 'background', 'target_name': 'Haven', 'dots': 6})
    assert _pool(app, coterie_id) == 0

    with app.app_context():
        flaw_id = CoterieAdvantage.query.filter_by(
            coterie_id=coterie_id, advantage_type='flaw').one().id

    _client(app, '222').post(f'/coteries/midnight-accord/creation/remove/{flaw_id}')

    with app.app_context():
        assert db.session.get(CoterieAdvantage, flaw_id) is not None, \
            'flaw was removed even though its bonus dots were already spent'
    assert _allocated_dots(app, coterie_id) == 6


def test_flaw_owner_can_remove_their_flaw_while_the_pool_can_still_repay_it():
    """The affordability check is on the pool, not on one member's balance.

    Fiora takes a 2-dot flaw then spends her own 4 dots, leaving her personal
    balance at 0 while the coterie still holds 2 dots. Removing the flaw costs
    2 and the coterie can afford it, so checking only Fiora's balance would
    wrongly refuse a legitimate undo.
    """
    app = _app()
    coterie_id = _forming_coterie(app, [('Fiora', '111'), ('Marcus', '222')])

    fiora = _client(app, '111')
    fiora.post('/coteries/midnight-accord/creation/flaw',
               data={'flaw_name': 'Adversary', 'dots': 2})
    fiora.post('/coteries/midnight-accord/creation/allocate',
               data={'target_kind': 'background', 'target_name': 'Haven', 'dots': 4})

    with app.app_context():
        by_name = {
            m.character.character_name: m.free_dots_remaining
            for m in CoterieMember.query.filter_by(coterie_id=coterie_id).all()
        }
        assert by_name['Fiora'] == 0 and by_name['Marcus'] == 2
        flaw_id = CoterieAdvantage.query.filter_by(
            coterie_id=coterie_id, advantage_type='flaw').one().id

    fiora.post(f'/coteries/midnight-accord/creation/remove/{flaw_id}')

    with app.app_context():
        assert db.session.get(CoterieAdvantage, flaw_id) is None, \
            'flaw removal was refused even though the pool could repay the bonus'
    # Budget is back to the 4 base dots, all of them committed to Haven.
    assert _pool(app, coterie_id) == 0
    assert _allocated_dots(app, coterie_id) == 4


def test_removing_an_allocation_returns_dots_to_its_original_owner():
    app = _app()
    coterie_id = _forming_coterie(app, [('Fiora', '111'), ('Marcus', '222')])

    _client(app, '111').post(
        '/coteries/midnight-accord/creation/allocate',
        data={'target_kind': 'background', 'target_name': 'Haven', 'dots': 2})

    with app.app_context():
        adv_id = CoterieAdvantage.query.filter_by(coterie_id=coterie_id).one().id

    # Marcus removes Fiora's allocation; the dots go back to Fiora, not Marcus.
    _client(app, '222').post(f'/coteries/midnight-accord/creation/remove/{adv_id}')

    with app.app_context():
        by_name = {
            m.character.character_name: m.free_dots_remaining
            for m in CoterieMember.query.filter_by(coterie_id=coterie_id).all()
        }
    assert by_name == {'Fiora': 2, 'Marcus': 2}


def test_non_members_cannot_touch_the_creation_pool():
    app = _app()
    coterie_id = _forming_coterie(app, [('Fiora', '111')])
    with app.app_context():
        db.session.add(_character('Outsider', '222'))
        db.session.commit()

    resp = _client(app, '222').post(
        '/coteries/midnight-accord/creation/allocate',
        data={'target_kind': 'chasse', 'dots': 1})

    assert resp.status_code == 403
    assert _pool(app, coterie_id) == 2


# ---------------------------------------------------------------------------
# Sign-off state machine
# ---------------------------------------------------------------------------

def test_submission_is_blocked_while_dots_are_unspent():
    """Allocation is gated on 'forming', so unspent dots would be lost."""
    app = _app()
    coterie_id = _forming_coterie(app, [('Fiora', '111')])
    _client(app, '111').post(
        '/coteries/midnight-accord/creation/allocate',
        data={'target_kind': 'chasse', 'dots': 1})

    _client(app, '111').post('/coteries/midnight-accord/submit-for-review')

    with app.app_context():
        assert db.session.get(Coterie, coterie_id).creation_state == 'forming'


def test_submission_is_blocked_when_nothing_was_allocated():
    app = _app()
    coterie_id = _forming_coterie(app, [('Fiora', '111')])

    _client(app, '111').post('/coteries/midnight-accord/submit-for-review')

    with app.app_context():
        assert db.session.get(Coterie, coterie_id).creation_state == 'forming'


def test_fully_allocated_coterie_can_be_submitted():
    app = _app()
    coterie_id = _forming_coterie(app, [('Fiora', '111')])
    _client(app, '111').post(
        '/coteries/midnight-accord/creation/allocate',
        data={'target_kind': 'chasse', 'dots': 2})

    _client(app, '111').post('/coteries/midnight-accord/submit-for-review')

    with app.app_context():
        assert db.session.get(Coterie, coterie_id).creation_state == 'submitted'


def test_staff_cannot_approve_a_coterie_that_was_never_submitted():
    app = _app()
    coterie_id = _forming_coterie(app, [('Fiora', '111')])

    _client(app, STAFF_ID).post('/coteries/midnight-accord/approve-formation')

    with app.app_context():
        coterie = db.session.get(Coterie, coterie_id)
        assert coterie.creation_state == 'forming'
        assert coterie.status == 'pending'


def test_staff_cannot_send_an_approved_coterie_back_into_formation():
    app = _app()
    coterie_id = _forming_coterie(app, [('Fiora', '111')])
    with app.app_context():
        coterie = db.session.get(Coterie, coterie_id)
        coterie.creation_state = 'active'
        coterie.status = 'active'
        db.session.commit()

    _client(app, STAFF_ID).post('/coteries/midnight-accord/sendback-formation',
                                data={'notes': 'reopen this'})

    with app.app_context():
        assert db.session.get(Coterie, coterie_id).creation_state == 'active'


def test_allocations_are_frozen_once_submitted():
    app = _app()
    coterie_id = _forming_coterie(app, [('Fiora', '111')])
    with app.app_context():
        db.session.get(Coterie, coterie_id).creation_state = 'submitted'
        db.session.commit()

    _client(app, '111').post(
        '/coteries/midnight-accord/creation/allocate',
        data={'target_kind': 'chasse', 'dots': 1})

    with app.app_context():
        assert db.session.get(Coterie, coterie_id).chasse == 0


def test_full_formation_round_trip_to_approval():
    app = _app()
    coterie_id = _forming_coterie(app, [('Fiora', '111'), ('Marcus', '222')])
    fiora, staff = _client(app, '111'), _client(app, STAFF_ID)

    fiora.post('/coteries/midnight-accord/creation/flaw',
               data={'flaw_name': 'Adversary', 'dots': 1})
    fiora.post('/coteries/midnight-accord/creation/allocate',
               data={'target_kind': 'chasse', 'dots': 2})
    fiora.post('/coteries/midnight-accord/creation/allocate',
               data={'target_kind': 'background', 'target_name': 'Haven', 'dots': 3})
    fiora.post('/coteries/midnight-accord/submit-for-review')

    with app.app_context():
        assert db.session.get(Coterie, coterie_id).creation_state == 'submitted'

    # Staff send it back, players revise, then it is approved.
    staff.post('/coteries/midnight-accord/sendback-formation',
               data={'notes': 'Trim the Haven.'})
    with app.app_context():
        coterie = db.session.get(Coterie, coterie_id)
        assert coterie.creation_state == 'forming'
        assert coterie.creation_notes == 'Trim the Haven.'
        haven_id = CoterieAdvantage.query.filter_by(
            coterie_id=coterie_id, name='Haven').one().id

    fiora.post(f'/coteries/midnight-accord/creation/remove/{haven_id}')
    fiora.post('/coteries/midnight-accord/creation/allocate',
               data={'target_kind': 'background', 'target_name': 'Herd', 'dots': 3})
    fiora.post('/coteries/midnight-accord/submit-for-review')
    staff.post('/coteries/midnight-accord/approve-formation')

    with app.app_context():
        coterie = db.session.get(Coterie, coterie_id)
        assert coterie.creation_state == 'active'
        assert coterie.status == 'active'
        assert coterie.creation_notes is None
        assert coterie.chasse == 2
        names = {a.name for a in coterie.advantages}
        assert names == {'Adversary', 'Herd'}

    # Creation traits join the public pool once signed off.
    body = _client(app, '111').get('/coteries/midnight-accord').data
    assert b'Herd' in body


# ---------------------------------------------------------------------------
# Invitations: nobody is added to a coterie without agreeing
# ---------------------------------------------------------------------------

def _invite(app, coterie_id, char_name, invited_by='Fiora'):
    with app.app_context():
        char = DbCharacter.query.filter_by(character_name=char_name).one()
        db.session.add(CoterieInvitation(
            coterie_id=coterie_id, roster_character_id=char.id,
            status='pending', invited_by=invited_by))
        db.session.commit()
        return CoterieInvitation.query.filter_by(
            coterie_id=coterie_id, roster_character_id=char.id).one().id


def test_proposing_invites_rather_than_conscripts():
    app = _app()
    with app.app_context():
        db.session.add(_character('Fiora', '111'))
        db.session.add(_character('Kira', '222'))
        db.session.commit()
        kira_id = DbCharacter.query.filter_by(character_name='Kira').one().id

    _client(app, '111').post('/coteries/propose', data={
        'name': 'Midnight Accord', 'description': '', 'invite_ids': [kira_id]})

    with app.app_context():
        coterie = Coterie.query.filter_by(slug='midnight-accord').one()
        # Only the proposer is a member; Kira holds a pending invitation.
        assert [m.character.character_name for m in coterie.members] == ['Fiora']
        assert sum(m.free_dots_remaining for m in coterie.members) == 2
        invite = CoterieInvitation.query.filter_by(coterie_id=coterie.id).one()
        assert invite.roster_character_id == kira_id
        assert invite.status == 'pending'
        assert invite.invited_by == 'Fiora'


def test_invitee_can_read_the_sheet_but_not_spend_dots():
    app = _app()
    coterie_id = _forming_coterie(app, [('Fiora', '111')])
    with app.app_context():
        db.session.add(_character('Kira', '222'))
        db.session.commit()
    _invite(app, coterie_id, 'Kira')

    kira = _client(app, '222')
    assert kira.get('/coteries/midnight-accord').status_code == 200

    resp = kira.post('/coteries/midnight-accord/creation/allocate',
                     data={'target_kind': 'chasse', 'dots': 1})
    assert resp.status_code == 403
    with app.app_context():
        assert db.session.get(Coterie, coterie_id).chasse == 0


def test_accepting_adds_the_member_and_their_dots():
    app = _app()
    coterie_id = _forming_coterie(app, [('Fiora', '111')])
    with app.app_context():
        db.session.add(_character('Kira', '222'))
        db.session.commit()
    invite_id = _invite(app, coterie_id, 'Kira')

    _client(app, '222').post(f'/coteries/midnight-accord/invite/{invite_id}/accept')

    with app.app_context():
        coterie = db.session.get(Coterie, coterie_id)
        assert sorted(m.character.character_name for m in coterie.members) == ['Fiora', 'Kira']
        assert CoterieInvitation.query.filter_by(coterie_id=coterie_id).one().status == 'accepted'
    assert _pool(app, coterie_id) == 4


def test_declining_leaves_the_coterie_untouched():
    app = _app()
    coterie_id = _forming_coterie(app, [('Fiora', '111')])
    with app.app_context():
        db.session.add(_character('Kira', '222'))
        db.session.commit()
    invite_id = _invite(app, coterie_id, 'Kira')

    _client(app, '222').post(f'/coteries/midnight-accord/invite/{invite_id}/decline')

    with app.app_context():
        coterie = db.session.get(Coterie, coterie_id)
        assert len(coterie.members) == 1
        assert CoterieInvitation.query.filter_by(coterie_id=coterie_id).one().status == 'declined'
    assert _pool(app, coterie_id) == 2
    # Declining also ends the read access the invitation granted.
    assert _client(app, '222').get('/coteries/midnight-accord').status_code == 404


def test_a_stranger_cannot_accept_someone_elses_invitation():
    app = _app()
    coterie_id = _forming_coterie(app, [('Fiora', '111')])
    with app.app_context():
        db.session.add(_character('Kira', '222'))
        db.session.add(_character('Solomon', '333'))
        db.session.commit()
    invite_id = _invite(app, coterie_id, 'Kira')

    assert _client(app, '333').post(
        f'/coteries/midnight-accord/invite/{invite_id}/accept').status_code == 403
    with app.app_context():
        assert len(db.session.get(Coterie, coterie_id).members) == 1


def test_accepting_is_refused_if_the_character_joined_elsewhere_meanwhile():
    app = _app()
    coterie_id = _forming_coterie(app, [('Fiora', '111')])
    with app.app_context():
        db.session.add(_character('Kira', '222'))
        db.session.commit()
    invite_id = _invite(app, coterie_id, 'Kira')

    # Kira joins another coterie while the invitation sits unanswered.
    with app.app_context():
        other = Coterie(name='Other Crew', slug='other-crew', status='active')
        db.session.add(other)
        db.session.flush()
        kira = DbCharacter.query.filter_by(character_name='Kira').one()
        db.session.add(CoterieMember(coterie_id=other.id, roster_character_id=kira.id,
                                     free_dots_remaining=2))
        db.session.commit()

    _client(app, '222').post(f'/coteries/midnight-accord/invite/{invite_id}/accept')

    with app.app_context():
        assert len(db.session.get(Coterie, coterie_id).members) == 1


def test_members_can_withdraw_an_unanswered_invitation():
    app = _app()
    coterie_id = _forming_coterie(app, [('Fiora', '111')])
    with app.app_context():
        db.session.add(_character('Kira', '222'))
        db.session.commit()
    invite_id = _invite(app, coterie_id, 'Kira')

    _client(app, '111').post(f'/coteries/midnight-accord/invite/{invite_id}/revoke')

    with app.app_context():
        assert db.session.get(CoterieInvitation, invite_id).status == 'revoked'
    assert _client(app, '222').get('/coteries/midnight-accord').status_code == 404


def test_signoff_is_blocked_while_an_invitation_is_unanswered():
    """An accept would add 2 dots to the pool, so the budget staff signed off
    on would change underneath them."""
    app = _app()
    coterie_id = _forming_coterie(app, [('Fiora', '111')])
    with app.app_context():
        db.session.add(_character('Kira', '222'))
        db.session.commit()
    invite_id = _invite(app, coterie_id, 'Kira')

    fiora = _client(app, '111')
    fiora.post('/coteries/midnight-accord/creation/allocate',
               data={'target_kind': 'chasse', 'dots': 2})
    fiora.post('/coteries/midnight-accord/submit-for-review')

    with app.app_context():
        assert db.session.get(Coterie, coterie_id).creation_state == 'forming'

    # Once the invitation is answered, sign-off proceeds.
    _client(app, '222').post(f'/coteries/midnight-accord/invite/{invite_id}/decline')
    fiora.post('/coteries/midnight-accord/submit-for-review')
    with app.app_context():
        assert db.session.get(Coterie, coterie_id).creation_state == 'submitted'


def test_invitation_appears_on_the_invitees_index():
    app = _app()
    coterie_id = _forming_coterie(app, [('Fiora', '111')])
    with app.app_context():
        db.session.add(_character('Kira', '222'))
        db.session.commit()
    _invite(app, coterie_id, 'Kira')

    body = _client(app, '222').get('/coteries/').data
    assert b'Coterie Invitations' in body
    assert b'Midnight Accord' in body


# ---------------------------------------------------------------------------
# Review follow-ups on the formation-hardening branch (PR #428)
# ---------------------------------------------------------------------------

def _retire(app, char_name):
    """Retire a character the way the status API does: flag off, row kept."""
    with app.app_context():
        char = DbCharacter.query.filter_by(character_name=char_name).one()
        char.active = False
        char.status = 'retired'
        db.session.commit()


def test_a_retired_member_loses_access_to_the_private_sheet():
    """Retirement leaves the CoterieMember row in place, so activity has to be
    checked at lookup time or the sheet stays readable forever."""
    app = _app()
    _forming_coterie(app, [('Fiora', '111'), ('Kira', '222')])
    kira = _client(app, '222')
    assert kira.get('/coteries/midnight-accord').status_code == 200

    _retire(app, 'Kira')

    assert kira.get('/coteries/midnight-accord').status_code == 404


def test_a_retired_member_cannot_spend_the_pool():
    app = _app()
    coterie_id = _forming_coterie(app, [('Fiora', '111'), ('Kira', '222')])
    _retire(app, 'Kira')

    resp = _client(app, '222').post('/coteries/midnight-accord/creation/allocate',
                                    data={'target_kind': 'chasse', 'dots': 1})

    assert resp.status_code == 403
    with app.app_context():
        assert db.session.get(Coterie, coterie_id).chasse == 0
    assert _pool(app, coterie_id) == 4


def test_answering_one_invitation_does_not_answer_the_players_other_one():
    """A player can have two characters invited to the same coterie; each
    button must answer its own row rather than whichever came first."""
    app = _app()
    coterie_id = _forming_coterie(app, [('Fiora', '111')])
    with app.app_context():
        db.session.add(_character('Kira', '222'))
        db.session.add(_character('Nadia', '222'))
        db.session.commit()
    kira_invite = _invite(app, coterie_id, 'Kira')
    nadia_invite = _invite(app, coterie_id, 'Nadia')

    # Answer the *second* invitation.
    _client(app, '222').post(
        f'/coteries/midnight-accord/invite/{nadia_invite}/accept')

    with app.app_context():
        assert db.session.get(CoterieInvitation, nadia_invite).status == 'accepted'
        assert db.session.get(CoterieInvitation, kira_invite).status == 'pending'
        names = sorted(m.character.character_name
                       for m in db.session.get(Coterie, coterie_id).members)
        assert names == ['Fiora', 'Nadia']


def test_declining_one_invitation_does_not_decline_the_players_other_one():
    app = _app()
    coterie_id = _forming_coterie(app, [('Fiora', '111')])
    with app.app_context():
        db.session.add(_character('Kira', '222'))
        db.session.add(_character('Nadia', '222'))
        db.session.commit()
    kira_invite = _invite(app, coterie_id, 'Kira')
    nadia_invite = _invite(app, coterie_id, 'Nadia')

    _client(app, '222').post(
        f'/coteries/midnight-accord/invite/{nadia_invite}/decline')

    with app.app_context():
        assert db.session.get(CoterieInvitation, nadia_invite).status == 'declined'
        assert db.session.get(CoterieInvitation, kira_invite).status == 'pending'


def test_accepting_is_refused_if_the_character_retired_meanwhile():
    """Accepting commits two creation dots, so an inactive character must not
    reach the formation budget."""
    app = _app()
    coterie_id = _forming_coterie(app, [('Fiora', '111')])
    with app.app_context():
        db.session.add(_character('Kira', '222'))
        db.session.commit()
    invite_id = _invite(app, coterie_id, 'Kira')

    _retire(app, 'Kira')

    _client(app, '222').post(f'/coteries/midnight-accord/invite/{invite_id}/accept')

    with app.app_context():
        assert len(db.session.get(Coterie, coterie_id).members) == 1
        assert db.session.get(CoterieInvitation, invite_id).status == 'pending'
    assert _pool(app, coterie_id) == 2


def test_the_advantage_form_shows_the_shared_pool_not_a_personal_balance():
    """The spend drains the pool, so the number next to it has to be the pool."""
    app = _app()
    coterie_id = _forming_coterie(app, [('Fiora', '111'), ('Kira', '222')])
    with app.app_context():
        coterie = db.session.get(Coterie, coterie_id)
        coterie.creation_state = 'active'
        coterie.status = 'active'
        # Kira has spent her own two dots; Fiora's two are still in the pool.
        for m in coterie.members:
            if m.character.character_name == 'Kira':
                m.free_dots_remaining = 0
        db.session.commit()

    body = _client(app, '222').get('/coteries/midnight-accord').get_data(as_text=True)

    assert 'Shared free dots remaining' in body
    assert 'Your free dots remaining' not in body
    # Kira's personal balance is 0, but she can still spend the pool's 2.
    assert '<strong>2</strong>' in body
