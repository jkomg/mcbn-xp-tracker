"""Tests for claim reopen and amendment db_service methods."""

import pytest
from flask import Flask

from app.db import db, DbXPClaim
from app.db_service import DBService


@pytest.fixture()
def app_ctx():
    app = Flask(__name__)
    app.config['TESTING'] = True
    app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///:memory:'
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    db.init_app(app)
    with app.app_context():
        db.create_all()
        yield app


def _seed_claim(status='Denied'):
    row = DbXPClaim(
        timestamp='20260301 10:00:00',
        character_name='Alice',
        play_period='Night 77',
        posted_once=True,
        posted_once_link='https://discord.com/old-link',
        xp_claimed=1,
        status=status,
        reviewed_by='Storyteller',
        review_date='20260302 09:00:00',
        st_notes='Wrong link.',
    )
    db.session.add(row)
    db.session.commit()
    return row.id


class TestReopenClaimForAmendment:
    def test_sets_status_to_amend(self, app_ctx):
        svc = DBService()
        claim_id = _seed_claim('Denied')
        svc.reopen_claim_for_amendment(claim_id, reviewer='ST', notes='Please fix link.')
        row = DbXPClaim.query.get(claim_id)
        assert row.status == 'Amend'

    def test_stores_reviewer_and_notes(self, app_ctx):
        svc = DBService()
        claim_id = _seed_claim('Denied')
        svc.reopen_claim_for_amendment(claim_id, reviewer='ST', notes='Fix your links.')
        row = DbXPClaim.query.get(claim_id)
        assert row.reviewed_by == 'ST'
        assert row.st_notes == 'Fix your links.'

    def test_sets_review_date(self, app_ctx):
        svc = DBService()
        claim_id = _seed_claim('Denied')
        svc.reopen_claim_for_amendment(claim_id, reviewer='ST')
        row = DbXPClaim.query.get(claim_id)
        assert row.review_date  # non-empty timestamp

    def test_raises_for_missing_claim(self, app_ctx):
        svc = DBService()
        with pytest.raises(ValueError):
            svc.reopen_claim_for_amendment(9999, reviewer='ST')


class TestAmendClaim:
    def test_updates_evidence_fields(self, app_ctx):
        svc = DBService()
        claim_id = _seed_claim('Amend')
        new_cats = {
            'posted_once': 'https://discord.com/new-link',
            'scene_with_another': 'https://discord.com/scene-link',
        }
        svc.amend_claim(claim_id, new_cats)
        row = DbXPClaim.query.get(claim_id)
        assert row.posted_once is True
        assert row.posted_once_link == 'https://discord.com/new-link'
        assert row.scene_with_another is True
        assert row.scene_with_another_link == 'https://discord.com/scene-link'

    def test_clears_unchecked_categories(self, app_ctx):
        svc = DBService()
        claim_id = _seed_claim('Amend')
        # Only scene_with_another — posted_once should be cleared
        svc.amend_claim(claim_id, {'scene_with_another': 'https://discord.com/x'})
        row = DbXPClaim.query.get(claim_id)
        assert row.posted_once is False
        assert row.posted_once_link == ''

    def test_returns_to_pending(self, app_ctx):
        svc = DBService()
        claim_id = _seed_claim('Amend')
        svc.amend_claim(claim_id, {'posted_once': 'https://discord.com/x'})
        row = DbXPClaim.query.get(claim_id)
        assert row.status == 'Pending'

    def test_clears_review_fields(self, app_ctx):
        svc = DBService()
        claim_id = _seed_claim('Amend')
        svc.amend_claim(claim_id, {'posted_once': 'https://discord.com/x'})
        row = DbXPClaim.query.get(claim_id)
        assert row.reviewed_by == ''
        assert row.review_date == ''
        assert row.st_notes == ''
        assert row.approved_xp == 0

    def test_recalculates_xp_claimed(self, app_ctx):
        svc = DBService()
        claim_id = _seed_claim('Amend')
        svc.amend_claim(claim_id, {
            'posted_once': 'https://discord.com/a',
            'scene_with_another': 'https://discord.com/b',
            'conflict': 'https://discord.com/c',
        })
        row = DbXPClaim.query.get(claim_id)
        assert row.xp_claimed == 3

    def test_wildcard_xp_counted(self, app_ctx):
        svc = DBService()
        claim_id = _seed_claim('Amend')
        svc.amend_claim(claim_id, {
            'posted_once': 'https://discord.com/a',
            'wildcard': 'https://discord.com/wc',
            'wildcard_reason': 'Conclave',
            'wildcard_amount': '3',
        })
        row = DbXPClaim.query.get(claim_id)
        assert row.xp_claimed == 4  # 1 standard + 3 wildcard
        assert row.wildcard_amount == 3
        assert row.wildcard_reason == 'Conclave'

    def test_raises_for_missing_claim(self, app_ctx):
        svc = DBService()
        with pytest.raises(ValueError):
            svc.amend_claim(9999, {'posted_once': 'https://discord.com/x'})
