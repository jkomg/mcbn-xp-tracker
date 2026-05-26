"""Character Creator admin routes.

Provides:
  GET  /api/cc/restrictions            — public; used by SPA to filter banned components
  GET  /cc-admin/loresheets            — staff UI: view/manage loresheet bans
  POST /cc-admin/loresheets/<id>/ban   — staff: ban a loresheet
  POST /cc-admin/loresheets/<id>/unban — staff: lift a loresheet ban
"""

import os
import re
from datetime import datetime, timezone
from functools import lru_cache

from flask import Blueprint, flash, jsonify, redirect, render_template, request, session, url_for

from app.auth import require_staff
from app.db import CcRestriction, db

# Path to the SPA loresheet data file — used to build the admin catalog.
_LORESHEETS_TS = os.path.normpath(
    os.path.join(os.path.dirname(__file__), '..', '..', '..', '..', 'character-app', 'src', 'data', 'Loresheets.ts')
)

_SOURCE_LABELS = {
    'core': 'V5 Core',
    'camarilla': 'Camarilla',
    'anarch': 'Anarch',
    'chicago': 'Chicago by Night',
    'players-guide': "Player's Guide",
    'gehenna-war': 'Gehenna War',
    'in-memoriam': 'In Memoriam',
    'tattered-facade': 'Tattered Facade',
    'blood-sigils': 'Blood Sigils',
    'cults-of-the-blood-gods': 'Cults of the Blood Gods',
    'chicago-folios': 'Chicago Folios',
    'children-of-the-blood': 'Children of the Blood',
    'book-of-nod-apocrypha': 'Book of Nod Apocrypha',
    'let-the-streets-run-red': 'Let the Streets Run Red',
    'fall-of-london': 'The Fall of London',
    'forbidden-religions': 'Forbidden Religions',
    'trails-of-ash-and-bone': 'Trails of Ash and Bone',
    'live-from-the-succubus-club': 'Live From the Succubus Club',
    'download': 'Download / Choice of Games',
    'winters-teeth': "Winter's Teeth",
    'custom': 'Nashville (Custom)',
}

_LS_PATTERN = re.compile(
    r'\{\s*\n\s+id:\s*"([^"]+)",\s*\n\s+name:\s*"([^"]+)",\s*\n\s+source:\s*"([^"]+)"',
    re.MULTILINE,
)


@lru_cache(maxsize=1)
def _load_loresheet_catalog():
    """Parse id/name/source from the SPA Loresheets.ts file."""
    try:
        with open(_LORESHEETS_TS, encoding='utf-8') as f:
            text = f.read()
    except OSError:
        return []
    entries = _LS_PATTERN.findall(text)
    return [
        {'id': ls_id, 'name': name, 'source': source, 'source_label': _SOURCE_LABELS.get(source, source)}
        for ls_id, name, source in entries
    ]

bp = Blueprint('cc_admin', __name__)

COMPONENT_TYPE_LORESHEET = 'loresheet'


# ---------------------------------------------------------------------------
# Public API — consumed by the character creator SPA
# ---------------------------------------------------------------------------

@bp.route('/api/cc/restrictions')
def cc_restrictions():
    """Return all active component bans, grouped by type.

    Response shape:
      { "loresheets": ["minneapolis", "the-nictuku", ...] }
    """
    rows = CcRestriction.query.filter_by(component_type=COMPONENT_TYPE_LORESHEET).all()
    return jsonify({'loresheets': [r.component_id for r in rows]})


# ---------------------------------------------------------------------------
# Staff admin UI — loresheet management
# ---------------------------------------------------------------------------

@bp.route('/cc-admin/loresheets')
@require_staff
def loresheet_list():
    """Staff view: all loresheets with ban status."""
    banned_rows = {
        r.component_id: r
        for r in CcRestriction.query.filter_by(component_type=COMPONENT_TYPE_LORESHEET).all()
    }
    catalog = _load_loresheet_catalog()
    return render_template(
        'cc_admin/loresheets.html',
        catalog=catalog,
        banned=banned_rows,
    )


@bp.route('/cc-admin/loresheets/<loresheet_id>/ban', methods=['POST'])
@require_staff
def loresheet_ban(loresheet_id):
    """Ban a loresheet."""
    reason = (request.form.get('reason') or '').strip()
    actor = session.get('staff_user') or session.get('discord_name') or 'unknown'

    existing = CcRestriction.query.filter_by(
        component_type=COMPONENT_TYPE_LORESHEET,
        component_id=loresheet_id,
    ).first()

    if existing:
        existing.reason = reason
        existing.updated_by = actor
        existing.updated_at = datetime.now(timezone.utc)
    else:
        db.session.add(CcRestriction(
            component_type=COMPONENT_TYPE_LORESHEET,
            component_id=loresheet_id,
            reason=reason,
            updated_by=actor,
            updated_at=datetime.now(timezone.utc),
        ))

    db.session.commit()
    flash(f'Loresheet "{loresheet_id}" banned.', 'success')
    return redirect(url_for('cc_admin.loresheet_list'))


@bp.route('/cc-admin/loresheets/<loresheet_id>/unban', methods=['POST'])
@require_staff
def loresheet_unban(loresheet_id):
    """Lift a loresheet ban."""
    row = CcRestriction.query.filter_by(
        component_type=COMPONENT_TYPE_LORESHEET,
        component_id=loresheet_id,
    ).first()
    if row:
        db.session.delete(row)
        db.session.commit()
        flash(f'Loresheet "{loresheet_id}" unbanned.', 'success')
    return redirect(url_for('cc_admin.loresheet_list'))
