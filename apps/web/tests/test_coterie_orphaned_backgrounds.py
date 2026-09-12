"""A donated background outlives the character who donated it.

Donating is normally a loan — undonating and staff's remove_member both hand it
straight back. A character leaving play is different: the coterie keeps the
asset, and a remaining member may buy it at standard price to take ownership.
"""

import os
import sys

from flask import Blueprint, Flask
from flask_wtf.csrf import CSRFProtect

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app.blueprints import coteries as coteries_module  # noqa: E402
from app.coterie_donations import (claim_purchased_background,  # noqa: E402
                                   orphan_donated_backgrounds, purchase_price)
from app.db import (Coterie, CoterieInvitation, CoterieMember,  # noqa: E402
                    DbCharacter, DbCharacterBackground, DbPlayPeriod,
                    DbSpendRequest, db)
from app.db_service import DBService  # noqa: E402

STAFF_ID = '999'
_TEMPLATES_DIR = os.path.abspath(
    os.path.join(os.path.dirname(__file__), '..', 'app', 'templates'))
_STATIC_DIR = os.path.abspath(
    os.path.join(os.path.dirname(__file__), '..', 'app', 'static'))

_stub = Blueprint('player', __name__)


@_stub.route('/player/<name>')
def character(name):
    return 'ok'


_roster_stub = Blueprint('roster', __name__)


@_roster_stub.route('/roster/<name>')
def detail(name):
    return 'ok'


_spends_stub = Blueprint('spends', __name__)


@_spends_stub.route('/spends/')
def pending():
    return 'ok'


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
    app.register_blueprint(_stub)
    app.register_blueprint(_roster_stub)
    app.register_blueprint(_spends_stub)
    with app.app_context():
        db.create_all()
    return app


def _client(app, discord_id=None):
    client = app.test_client()
    if discord_id is not None:
        with client.session_transaction() as sess:
            sess['discord_id'] = discord_id
            if discord_id == STAFF_ID:
                sess['authenticated'] = True
                sess['staff_user'] = 'Staff Tester'
    return client


def _coterie(app, members, creation_xp=0):
    """An active coterie. `members` is a list of (char_name, discord_id)."""
    with app.app_context():
        coterie = Coterie(name='The Midnight Accord', slug='midnight-accord',
                          status='active', creation_state='active')
        db.session.add(coterie)
        db.session.flush()
        for idx, (char_name, discord_id) in enumerate(members):
            char = DbCharacter(character_name=char_name, player_discord=discord_id,
                               active=True, status='active', creation_xp=creation_xp)
            db.session.add(char)
            db.session.flush()
            db.session.add(CoterieMember(
                coterie_id=coterie.id, roster_character_id=char.id,
                free_dots_remaining=2, role='leader' if idx == 0 else 'member'))
        db.session.commit()
        return coterie.id


def _donate(app, coterie_id, char_name, bg_name='Haven', dots=3, key=None):
    with app.app_context():
        row = DbCharacterBackground(
            character_name=char_name, background_key=key or bg_name.lower(),
            background_name=bg_name, dots_total=dots, dots_blanked=0,
            donated_coterie_id=coterie_id, updated_at='', updated_by='')
        db.session.add(row)
        db.session.commit()
        return row.id


def _bg(app, bg_id):
    with app.app_context():
        return db.session.get(DbCharacterBackground, bg_id)


# ---------------------------------------------------------------------------
# Leaving play orphans the donation
# ---------------------------------------------------------------------------

def test_retiring_leaves_the_donation_with_the_coterie():
    app = _app()
    coterie_id = _coterie(app, [('Fiora', '111'), ('Kira', '222')])
    bg_id = _donate(app, coterie_id, 'Fiora')

    with app.app_context():
        DBService().set_character_status('Fiora', 'retired')

    row = _bg(app, bg_id)
    assert row.donated_coterie_id == coterie_id, 'the coterie keeps the asset'
    assert row.orphaned_from == 'Fiora', 'provenance is recorded'
    assert row.orphaned_at


def test_death_orphans_the_donation_too():
    app = _app()
    coterie_id = _coterie(app, [('Fiora', '111'), ('Kira', '222')])
    bg_id = _donate(app, coterie_id, 'Fiora')

    with app.app_context():
        DBService().set_character_status('Fiora', 'deceased')

    assert _bg(app, bg_id).orphaned_from == 'Fiora'


def test_deactivate_character_orphans_the_donation():
    """roster.deactivate takes a different db_service route than set_status."""
    app = _app()
    coterie_id = _coterie(app, [('Fiora', '111'), ('Kira', '222')])
    bg_id = _donate(app, coterie_id, 'Fiora')

    with app.app_context():
        DBService().deactivate_character('Fiora')

    assert _bg(app, bg_id).orphaned_from == 'Fiora'


def test_reactivating_does_not_orphan():
    app = _app()
    coterie_id = _coterie(app, [('Fiora', '111'), ('Kira', '222')])
    bg_id = _donate(app, coterie_id, 'Fiora')

    with app.app_context():
        DBService().set_character_status('Fiora', 'active')

    assert _bg(app, bg_id).orphaned_from is None


def test_a_pending_donation_is_withdrawn_rather_than_orphaned():
    """It never became the coterie's, and the donor cannot see it through."""
    app = _app()
    coterie_id = _coterie(app, [('Fiora', '111'), ('Kira', '222')])
    with app.app_context():
        row = DbCharacterBackground(
            character_name='Fiora', background_key='resources',
            background_name='Resources', dots_total=2, dots_blanked=0,
            donation_pending_coterie_id=coterie_id, updated_at='', updated_by='')
        db.session.add(row)
        db.session.commit()
        bg_id = row.id
        DBService().set_character_status('Fiora', 'retired')

    row = _bg(app, bg_id)
    assert row.donation_pending_coterie_id is None
    assert row.orphaned_from is None


def test_orphaning_is_idempotent_across_repeated_status_writes():
    app = _app()
    coterie_id = _coterie(app, [('Fiora', '111'), ('Kira', '222')])
    bg_id = _donate(app, coterie_id, 'Fiora')

    with app.app_context():
        svc = DBService()
        svc.set_character_status('Fiora', 'retired')
        first = db.session.get(DbCharacterBackground, bg_id).orphaned_at
        svc.set_character_status('Fiora', 'deceased')

    assert _bg(app, bg_id).orphaned_at == first, 'the first departure stands'


def test_staff_removing_a_member_still_returns_the_background():
    """Removal is an administrative undo, not a character leaving play."""
    app = _app()
    coterie_id = _coterie(app, [('Fiora', '111'), ('Kira', '222')])
    bg_id = _donate(app, coterie_id, 'Kira')
    with app.app_context():
        member_id = CoterieMember.query.join(DbCharacter).filter(
            DbCharacter.character_name == 'Kira').one().id

    _client(app, STAFF_ID).post(
        f'/coteries/midnight-accord/members/{member_id}/remove')

    row = _bg(app, bg_id)
    assert row.donated_coterie_id is None
    assert row.orphaned_from is None


# ---------------------------------------------------------------------------
# The coterie keeps using it in the meantime
# ---------------------------------------------------------------------------

def test_an_orphaned_background_stays_usable_by_the_remaining_members():
    app = _app()
    coterie_id = _coterie(app, [('Fiora', '111'), ('Kira', '222')])
    bg_id = _donate(app, coterie_id, 'Fiora')
    with app.app_context():
        db.session.add(DbPlayPeriod(period_label='Night 5', night_number=5,
                                    active=True, submissions_open=True))
        db.session.commit()
        DBService().set_character_status('Fiora', 'retired')

    _client(app, '222').post(
        f'/coteries/midnight-accord/blank/{bg_id}', data={'dots': 1})

    assert _bg(app, bg_id).dots_blanked == 1, 'the coterie still gets the benefit'


def test_the_sheet_shows_who_donated_it_and_that_it_is_unclaimed():
    app = _app()
    coterie_id = _coterie(app, [('Fiora', '111'), ('Kira', '222')], creation_xp=100)
    _donate(app, coterie_id, 'Fiora')
    with app.app_context():
        DBService().set_character_status('Fiora', 'retired')

    body = _client(app, '222').get('/coteries/midnight-accord').get_data(as_text=True)

    assert 'Donated by Fiora, who has left play' in body
    assert 'Unclaimed' in body
    assert 'Buy for 9 XP' in body, '3 dots at the standard 3 XP per dot'


# ---------------------------------------------------------------------------
# Buying it
# ---------------------------------------------------------------------------

def test_price_is_the_standard_advantage_cost_for_the_dots_left():
    app = _app()
    coterie_id = _coterie(app, [('Fiora', '111')])
    bg_id = _donate(app, coterie_id, 'Fiora', dots=4)
    with app.app_context():
        row = db.session.get(DbCharacterBackground, bg_id)
        row.dots_blanked = 1          # already spent, so not charged for
        db.session.commit()
        assert purchase_price(row) == 9, '3 remaining dots at 3 XP each'


def test_a_member_can_offer_to_buy_it():
    app = _app()
    coterie_id = _coterie(app, [('Fiora', '111'), ('Kira', '222')], creation_xp=100)
    bg_id = _donate(app, coterie_id, 'Fiora')
    with app.app_context():
        DBService().set_character_status('Fiora', 'retired')

    _client(app, '222').post(f'/coteries/midnight-accord/orphaned/{bg_id}/buy')

    with app.app_context():
        spend = DbSpendRequest.query.one()
        assert spend.character_name == 'Kira'
        assert spend.spend_category == 'Advantage (Merit/Background)'
        assert spend.trait_name == 'Haven'
        assert (spend.current_dots, spend.new_dots) == (0, 3)
        assert spend.xp_cost == 9
        assert spend.status == 'Pending'
        assert spend.purchased_background_id == bg_id
        assert spend.coterie_id == coterie_id
    # Nothing moves until staff approve.
    assert _bg(app, bg_id).character_name == 'Fiora'


def test_buying_is_refused_without_the_xp():
    app = _app()
    coterie_id = _coterie(app, [('Fiora', '111'), ('Kira', '222')], creation_xp=4)
    bg_id = _donate(app, coterie_id, 'Fiora')
    with app.app_context():
        DBService().set_character_status('Fiora', 'retired')

    _client(app, '222').post(f'/coteries/midnight-accord/orphaned/{bg_id}/buy')

    with app.app_context():
        assert DbSpendRequest.query.count() == 0


def test_a_non_member_cannot_buy_it():
    app = _app()
    coterie_id = _coterie(app, [('Fiora', '111')], creation_xp=100)
    bg_id = _donate(app, coterie_id, 'Fiora')
    with app.app_context():
        db.session.add(DbCharacter(character_name='Solomon', player_discord='333',
                                   active=True, status='active', creation_xp=100))
        db.session.commit()
        DBService().set_character_status('Fiora', 'retired')

    resp = _client(app, '333').post(
        f'/coteries/midnight-accord/orphaned/{bg_id}/buy')

    assert resp.status_code == 403
    with app.app_context():
        assert DbSpendRequest.query.count() == 0


def test_a_background_still_owned_by_a_living_donor_cannot_be_bought():
    app = _app()
    coterie_id = _coterie(app, [('Fiora', '111'), ('Kira', '222')], creation_xp=100)
    bg_id = _donate(app, coterie_id, 'Fiora')

    _client(app, '222').post(f'/coteries/midnight-accord/orphaned/{bg_id}/buy')

    with app.app_context():
        assert DbSpendRequest.query.count() == 0


def test_a_second_offer_is_refused_while_one_is_pending():
    app = _app()
    coterie_id = _coterie(
        app, [('Fiora', '111'), ('Kira', '222'), ('Nadia', '333')], creation_xp=100)
    bg_id = _donate(app, coterie_id, 'Fiora')
    with app.app_context():
        DBService().set_character_status('Fiora', 'retired')

    _client(app, '222').post(f'/coteries/midnight-accord/orphaned/{bg_id}/buy')
    _client(app, '333').post(f'/coteries/midnight-accord/orphaned/{bg_id}/buy')

    with app.app_context():
        assert DbSpendRequest.query.count() == 1


def test_a_buyer_who_already_has_that_background_is_refused():
    """character_backgrounds is unique on (character_name, background_key), and
    merging the two would silently rewrite dot totals."""
    app = _app()
    coterie_id = _coterie(app, [('Fiora', '111'), ('Kira', '222')], creation_xp=100)
    bg_id = _donate(app, coterie_id, 'Fiora')
    with app.app_context():
        db.session.add(DbCharacterBackground(
            character_name='Kira', background_key='haven', background_name='Haven',
            dots_total=2, dots_blanked=0, updated_at='', updated_by=''))
        db.session.commit()
        DBService().set_character_status('Fiora', 'retired')

    _client(app, '222').post(f'/coteries/midnight-accord/orphaned/{bg_id}/buy')

    with app.app_context():
        assert DbSpendRequest.query.count() == 0


def test_approval_hands_the_background_to_the_buyer_and_keeps_it_donated():
    app = _app()
    coterie_id = _coterie(app, [('Fiora', '111'), ('Kira', '222')], creation_xp=100)
    bg_id = _donate(app, coterie_id, 'Fiora')
    with app.app_context():
        DBService().set_character_status('Fiora', 'retired')

    _client(app, '222').post(f'/coteries/midnight-accord/orphaned/{bg_id}/buy')

    with app.app_context():
        spend = DbSpendRequest.query.one()
        claimed = claim_purchased_background(spend)
        db.session.commit()
        assert claimed is not None

    row = _bg(app, bg_id)
    assert row.character_name == 'Kira', 'the asset has a living owner again'
    assert row.orphaned_from is None, 'it is no longer on offer'
    assert row.donated_coterie_id == coterie_id, 'it stays in the coterie pool'


def test_claiming_a_spend_that_bought_nothing_is_a_no_op():
    app = _app()
    _coterie(app, [('Fiora', '111')])
    with app.app_context():
        spend = DbSpendRequest(character_name='Fiora', spend_category='Attribute',
                               trait_name='Strength', status='Pending')
        db.session.add(spend)
        db.session.commit()
        assert claim_purchased_background(spend) is None


def test_a_clash_appearing_before_approval_blocks_the_transfer():
    """The buyer may pick the background up another way while this sits in the
    queue; the transfer would then violate the unique constraint."""
    app = _app()
    coterie_id = _coterie(app, [('Fiora', '111'), ('Kira', '222')], creation_xp=100)
    bg_id = _donate(app, coterie_id, 'Fiora')
    with app.app_context():
        DBService().set_character_status('Fiora', 'retired')

    _client(app, '222').post(f'/coteries/midnight-accord/orphaned/{bg_id}/buy')

    with app.app_context():
        db.session.add(DbCharacterBackground(
            character_name='Kira', background_key='haven', background_name='Haven',
            dots_total=1, dots_blanked=0, updated_at='', updated_by=''))
        db.session.commit()
        spend = DbSpendRequest.query.filter_by(purchased_background_id=bg_id).one()
        assert claim_purchased_background(spend) is None

    assert _bg(app, bg_id).character_name == 'Fiora', 'left for staff to resolve'


# ---------------------------------------------------------------------------
# Renames follow the donor's name
# ---------------------------------------------------------------------------

def test_renaming_follows_both_the_owner_and_the_departed_donor():
    app = _app()
    coterie_id = _coterie(app, [('Fiora', '111'), ('Kira', '222')])
    own_id = _donate(app, coterie_id, 'Kira', bg_name='Resources', key='resources')
    orphan_id = _donate(app, coterie_id, 'Fiora')
    with app.app_context():
        DBService().set_character_status('Fiora', 'retired')
        DBService().rename_character('Fiora', 'Fiora Nightingale')
        DBService().rename_character('Kira', 'Kira Vex')

    assert _bg(app, own_id).character_name == 'Kira Vex'
    assert _bg(app, orphan_id).orphaned_from == 'Fiora Nightingale'


def test_orphan_helper_ignores_a_character_with_nothing_donated():
    app = _app()
    _coterie(app, [('Fiora', '111')])
    with app.app_context():
        assert orphan_donated_backgrounds('Fiora') == []
        assert orphan_donated_backgrounds('') == []


# ---------------------------------------------------------------------------
# End to end, through the real staff approval route
# ---------------------------------------------------------------------------

def _spends_app():
    """A second app wiring up the real spends blueprint, so approval is
    exercised through the route staff actually post to rather than by calling
    the transfer helper directly."""
    import app as app_module
    from app.blueprints import spends as spends_module

    app = Flask(__name__, template_folder=_TEMPLATES_DIR, static_folder=_STATIC_DIR)
    app.config['TESTING'] = True
    app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///:memory:'
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    app.config['WTF_CSRF_ENABLED'] = False
    app.config['ALLOWED_DISCORD_IDS'] = {STAFF_ID}
    app.secret_key = 'test-secret'
    db.init_app(app)
    CSRFProtect().init_app(app)
    service = DBService()
    app_module.db_service = service
    spends_module.db_service = service
    spends_module.sheets_sync = None
    coteries_module.db_service = service
    app.register_blueprint(spends_module.bp, url_prefix='/spends')
    app.register_blueprint(coteries_module.bp, url_prefix='/coteries')
    app.register_blueprint(_stub)
    app.register_blueprint(_roster_stub)
    with app.app_context():
        db.create_all()
    return app


def test_approving_through_the_spends_route_transfers_the_background():
    app = _spends_app()
    coterie_id = _coterie(app, [('Fiora', '111'), ('Kira', '222')], creation_xp=100)
    bg_id = _donate(app, coterie_id, 'Fiora')
    with app.app_context():
        DBService().set_character_status('Fiora', 'retired')

    _client(app, '222').post(f'/coteries/midnight-accord/orphaned/{bg_id}/buy')
    with app.app_context():
        row_id = DbSpendRequest.query.one().id

    resp = _client(app, STAFF_ID).post(
        f'/spends/{row_id}/approve', data={'verified_cost': '9'})

    assert resp.status_code in (200, 302)
    with app.app_context():
        assert db.session.get(DbSpendRequest, row_id).status == 'Approved'
    row = _bg(app, bg_id)
    assert row.character_name == 'Kira'
    assert row.orphaned_from is None
    assert row.donated_coterie_id == coterie_id
    # The buyer paid for it.
    with app.app_context():
        assert DBService().get_xp_totals('Kira')['available_xp'] == 91


def test_bulk_approving_through_the_spends_route_transfers_the_background():
    app = _spends_app()
    coterie_id = _coterie(app, [('Fiora', '111'), ('Kira', '222')], creation_xp=100)
    bg_id = _donate(app, coterie_id, 'Fiora')
    with app.app_context():
        DBService().set_character_status('Fiora', 'retired')

    _client(app, '222').post(f'/coteries/midnight-accord/orphaned/{bg_id}/buy')
    with app.app_context():
        row_id = DbSpendRequest.query.one().id

    _client(app, STAFF_ID).post('/spends/bulk-approve',
                                data={'spend_ids': [str(row_id)]})

    assert _bg(app, bg_id).character_name == 'Kira'
    assert _bg(app, bg_id).orphaned_from is None


def test_denying_the_purchase_leaves_the_background_on_offer():
    app = _spends_app()
    coterie_id = _coterie(app, [('Fiora', '111'), ('Kira', '222')], creation_xp=100)
    bg_id = _donate(app, coterie_id, 'Fiora')
    with app.app_context():
        DBService().set_character_status('Fiora', 'retired')

    _client(app, '222').post(f'/coteries/midnight-accord/orphaned/{bg_id}/buy')
    with app.app_context():
        row_id = DbSpendRequest.query.one().id

    _client(app, STAFF_ID).post(f'/spends/{row_id}/deny', data={'notes': 'no'})

    row = _bg(app, bg_id)
    assert row.character_name == 'Fiora'
    assert row.orphaned_from == 'Fiora', 'still unclaimed'
    # And the refusal frees the offer up for someone else.
    with app.app_context():
        from app.coterie_donations import blocking_reason
        assert blocking_reason(db.session.get(DbCharacterBackground, bg_id),
                               'Kira') is None


# ---------------------------------------------------------------------------
# Codex review follow-ups on PR #428
# ---------------------------------------------------------------------------

def test_approval_is_refused_when_the_transfer_cannot_complete():
    """The P1. claim_purchased_background returning None was only skipping the
    commit — approve_spend and patch_character_draft had already run, so the
    buyer paid and got the trait while the background stayed on offer."""
    app = _spends_app()
    coterie_id = _coterie(app, [('Fiora', '111'), ('Kira', '222')], creation_xp=100)
    bg_id = _donate(app, coterie_id, 'Fiora')
    with app.app_context():
        DBService().set_character_status('Fiora', 'retired')

    _client(app, '222').post(f'/coteries/midnight-accord/orphaned/{bg_id}/buy')
    with app.app_context():
        row_id = DbSpendRequest.query.one().id
        # Kira picks Haven up another way while the request sits in the queue.
        db.session.add(DbCharacterBackground(
            character_name='Kira', background_key='haven', background_name='Haven',
            dots_total=1, dots_blanked=0, updated_at='', updated_by=''))
        db.session.commit()

    _client(app, STAFF_ID).post(f'/spends/{row_id}/approve', data={'verified_cost': '9'})

    with app.app_context():
        assert db.session.get(DbSpendRequest, row_id).status == 'Pending', 'not approved'
        assert DBService().get_xp_totals('Kira')['available_xp'] == 100, 'no XP charged'
    assert _bg(app, bg_id).orphaned_from == 'Fiora', 'still on offer'


def test_bulk_approval_skips_a_purchase_that_cannot_complete():
    app = _spends_app()
    coterie_id = _coterie(app, [('Fiora', '111'), ('Kira', '222')], creation_xp=100)
    bg_id = _donate(app, coterie_id, 'Fiora')
    with app.app_context():
        DBService().set_character_status('Fiora', 'retired')

    _client(app, '222').post(f'/coteries/midnight-accord/orphaned/{bg_id}/buy')
    with app.app_context():
        row_id = DbSpendRequest.query.one().id
        db.session.add(DbCharacterBackground(
            character_name='Kira', background_key='haven', background_name='Haven',
            dots_total=1, dots_blanked=0, updated_at='', updated_by=''))
        db.session.commit()

    _client(app, STAFF_ID).post('/spends/bulk-approve', data={'spend_ids': [str(row_id)]})

    with app.app_context():
        assert db.session.get(DbSpendRequest, row_id).status == 'Pending'
        assert DBService().get_xp_totals('Kira')['available_xp'] == 100


def test_approval_is_refused_if_the_dots_were_blanked_away_meanwhile():
    """The price was fixed against the dots available when the offer was made,
    and the coterie keeps using the background while the request is pending."""
    app = _spends_app()
    coterie_id = _coterie(app, [('Fiora', '111'), ('Kira', '222')], creation_xp=100)
    bg_id = _donate(app, coterie_id, 'Fiora')
    with app.app_context():
        DBService().set_character_status('Fiora', 'retired')

    _client(app, '222').post(f'/coteries/midnight-accord/orphaned/{bg_id}/buy')
    with app.app_context():
        row_id = DbSpendRequest.query.one().id
        assert db.session.get(DbSpendRequest, row_id).new_dots == 3
        db.session.get(DbCharacterBackground, bg_id).dots_blanked = 2
        db.session.commit()

    _client(app, STAFF_ID).post(f'/spends/{row_id}/approve', data={'verified_cost': '9'})

    with app.app_context():
        assert db.session.get(DbSpendRequest, row_id).status == 'Pending'
        assert DBService().get_xp_totals('Kira')['available_xp'] == 100


def test_reactivating_a_donor_takes_the_donation_back_off_offer():
    app = _app()
    coterie_id = _coterie(app, [('Fiora', '111'), ('Kira', '222')])
    bg_id = _donate(app, coterie_id, 'Fiora')
    with app.app_context():
        DBService().set_character_status('Fiora', 'retired')
        assert _bg(app, bg_id).orphaned_from == 'Fiora'
        DBService().set_character_status('Fiora', 'active')

    row = _bg(app, bg_id)
    assert row.orphaned_from is None, 'no longer buyable'
    assert row.orphaned_at is None
    assert row.donated_coterie_id == coterie_id, 'still donated, as it was before'


def test_reactivating_does_not_take_back_a_background_someone_bought():
    app = _spends_app()
    coterie_id = _coterie(app, [('Fiora', '111'), ('Kira', '222')], creation_xp=100)
    bg_id = _donate(app, coterie_id, 'Fiora')
    with app.app_context():
        DBService().set_character_status('Fiora', 'retired')
    _client(app, '222').post(f'/coteries/midnight-accord/orphaned/{bg_id}/buy')
    with app.app_context():
        row_id = DbSpendRequest.query.one().id
    _client(app, STAFF_ID).post(f'/spends/{row_id}/approve', data={'verified_cost': '9'})
    assert _bg(app, bg_id).character_name == 'Kira'

    with app.app_context():
        DBService().set_character_status('Fiora', 'active')

    assert _bg(app, bg_id).character_name == 'Kira', 'it belongs to the buyer now'


def test_an_invitation_does_not_keep_sheet_access_after_retirement():
    """Same class as the member-authorization fix: retirement leaves the
    invitation row in place, and an invitation grants read access."""
    app = _app()
    coterie_id = _coterie(app, [('Fiora', '111')])
    with app.app_context():
        kira = DbCharacter(character_name='Kira', player_discord='222',
                           active=True, status='active')
        db.session.add(kira)
        db.session.flush()
        db.session.add(CoterieInvitation(coterie_id=coterie_id,
                                         roster_character_id=kira.id,
                                         status='pending', invited_by='Fiora'))
        db.session.commit()
    assert _client(app, '222').get('/coteries/midnight-accord').status_code == 200

    with app.app_context():
        DBService().set_character_status('Kira', 'retired')

    assert _client(app, '222').get('/coteries/midnight-accord').status_code == 404


def test_a_purchased_background_lands_in_backgrounds_not_merits():
    """_apply_patch defaults a genuinely new advantage to merits because it
    cannot tell a Background from a Merit by name. A purchase came from a
    character_backgrounds row, so it can."""
    from app.character_sheet import _apply_patch

    data = {'backgrounds': [], 'merits': []}
    _apply_patch(data, 'Advantage (Merit/Background)', 'Haven', '', 3,
                 known_background=True)
    assert [e['name'] for e in data['backgrounds']] == ['Haven']
    assert data['merits'] == []

    data2 = {'backgrounds': [], 'merits': []}
    _apply_patch(data2, 'Advantage (Merit/Background)', 'Iron Will', '', 2)
    assert [e['name'] for e in data2['merits']] == ['Iron Will']
    assert data2['backgrounds'] == []
