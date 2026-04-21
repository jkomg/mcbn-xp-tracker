"""Chronicle Wiki — public-facing lore and location pages."""

from __future__ import annotations

import html as _html_mod
import re
from datetime import datetime, timezone
from html.parser import HTMLParser

import markdown as md_lib
from markupsafe import Markup
from flask import (
    Blueprint, render_template, request, redirect, url_for, flash, abort,
)
from app.auth import require_staff, get_staff_user, is_staff as _is_staff
from app.db import db, WikiPage, DbCharacter, DbSpendRequest

bp = Blueprint('wiki', __name__)

CATEGORIES: list[tuple[str, str, str]] = [
    ('locations',   'Locations',   'bi-geo-alt-fill'),
    ('characters',  'Characters',  'bi-person-fill'),
    ('coteries',    'Coteries',    'bi-people-fill'),
    ('factions',    'Factions',    'bi-shield-fill'),
    ('lore',        'Lore',        'bi-book-fill'),
]
CATEGORY_DISPLAY: dict[str, str] = {s: n for s, n, _ in CATEGORIES}

# Slugs reserved by static wiki routes — these can never be used as page slugs.
_RESERVED_SLUGS = frozenset({'new', 'edit', 'category', 'search'})


@bp.context_processor
def _wiki_context():
    return {'wiki_categories': CATEGORIES, 'wiki_category_display': CATEGORY_DISPLAY}


def _slugify(text: str) -> str:
    text = text.lower().strip()
    text = re.sub(r'[^\w\s-]', '', text)
    text = re.sub(r'[\s_]+', '-', text)
    return re.sub(r'-+', '-', text).strip('-')


_ALLOWED_TAGS = frozenset({
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'p', 'br', 'hr',
    'ul', 'ol', 'li',
    'strong', 'em', 'del', 's',
    'a', 'img',
    'blockquote', 'pre', 'code',
    'table', 'thead', 'tbody', 'tr', 'th', 'td',
    'div', 'span',
})
_ALLOWED_ATTRS: dict[str, list[str]] = {
    'a':   ['href', 'title', 'rel'],
    'img': ['src', 'alt', 'title', 'width', 'height'],
    '*':   ['class', 'id'],
}
_VOID_TAGS = frozenset({'br', 'hr', 'img'})
_URL_ATTRS = frozenset({'href', 'src'})
_JS_RE = re.compile(r'^\s*javascript:', re.I)


class _HtmlSanitizer(HTMLParser):
    """Allow-list HTML sanitizer using stdlib HTMLParser.

    Tags not in _ALLOWED_TAGS are dropped along with all their content
    (tracked via _skip_depth so nested disallowed tags work correctly).
    """

    def __init__(self) -> None:
        super().__init__(convert_charrefs=False)
        self._out: list[str] = []
        self._skip_depth: int = 0  # >0 means we're inside a disallowed tag

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        tag = tag.lower()
        if tag not in _ALLOWED_TAGS:
            self._skip_depth += 1
            return
        if self._skip_depth:
            return
        allowed = _ALLOWED_ATTRS.get(tag, []) + _ALLOWED_ATTRS['*']
        safe = ''
        for name, value in attrs:
            name = name.lower()
            if name not in allowed:
                continue
            value = value or ''
            if name in _URL_ATTRS and _JS_RE.match(value):
                continue
            safe += f' {name}="{_html_mod.escape(value)}"'
        self._out.append(f'<{tag}{safe}>')

    def handle_endtag(self, tag: str) -> None:
        tag = tag.lower()
        if tag not in _ALLOWED_TAGS:
            if self._skip_depth:
                self._skip_depth -= 1
            return
        if self._skip_depth:
            return
        if tag not in _VOID_TAGS:
            self._out.append(f'</{tag}>')

    def handle_data(self, data: str) -> None:
        if not self._skip_depth:
            self._out.append(_html_mod.escape(data))

    def handle_entityref(self, name: str) -> None:
        if not self._skip_depth:
            self._out.append(f'&{name};')

    def handle_charref(self, name: str) -> None:
        if not self._skip_depth:
            self._out.append(f'&#{name};')

    def get_output(self) -> str:
        return ''.join(self._out)


def _sanitize(html_str: str) -> str:
    san = _HtmlSanitizer()
    san.feed(html_str)
    return san.get_output()


_STRIKETHROUGH_RE = re.compile(r'~~(.+?)~~', re.DOTALL)
_FENCED_CODE_RE = re.compile(r'(```[\s\S]*?```|`[^`\n]+`)', re.DOTALL)


def _apply_strikethrough(text: str) -> str:
    """Convert ~~text~~ to <del>text</del>, skipping inline/fenced code spans."""
    # Split on code spans/blocks, only transform the non-code segments.
    parts = _FENCED_CODE_RE.split(text)
    for i, part in enumerate(parts):
        if not _FENCED_CODE_RE.match(part):
            parts[i] = _STRIKETHROUGH_RE.sub(r'<del>\1</del>', part)
    return ''.join(parts)


def _render_md(text: str) -> Markup:
    # Pre-convert Discord/GitHub strikethrough ~~text~~ → <del>text</del>
    # before the markdown parser runs, skipping code spans/blocks.
    text = _apply_strikethrough(text or '')
    raw_html = md_lib.markdown(
        text,
        extensions=['extra', 'toc', 'nl2br'],
        output_format='html',
    )
    return Markup(_sanitize(raw_html))


def _unique_slug(base: str) -> str:
    # Start from -1 suffix if the base itself is reserved
    slug = f'{base}-1' if base in _RESERVED_SLUGS else base
    i = 1
    while WikiPage.query.filter_by(slug=slug).first():
        i += 1
        slug = f'{base}-{i}'
    return slug


# ── Public routes ─────────────────────────────────────────────────────────────

def _get_featured_page(slug: str) -> Markup | None:
    """Return rendered HTML for a featured index section page, or None if not found."""
    page = WikiPage.query.filter_by(slug=slug, published=True).first()
    if not page or not page.body_markdown:
        return None
    return _render_md(page.body_markdown)


@bp.route('/')
def index():
    recent = (WikiPage.query
              .filter_by(published=True)
              .order_by(WikiPage.updated_at.desc())
              .limit(6)
              .all())
    counts = {s: WikiPage.query.filter_by(category=s, published=True).count()
              for s, _, _ in CATEGORIES}
    chronicle_background = _get_featured_page('chronicle-background')
    state_of_domain = _get_featured_page('state-of-domain')
    coteries_page = WikiPage.query.filter_by(slug='domains-and-coteries', published=True).first()
    return render_template(
        'wiki/index.html',
        recent=recent,
        counts=counts,
        chronicle_background=chronicle_background,
        state_of_domain=state_of_domain,
        coteries_page=coteries_page,
    )


@bp.route('/search')
def search():
    q = request.args.get('q', '').strip()
    results = []
    if q:
        visible = [WikiPage.published == True]  # noqa: E712
        if _is_staff():
            visible = []
        pattern = f'%{q}%'
        pages = (WikiPage.query
                 .filter(*visible)
                 .filter(
                     db.or_(
                         WikiPage.title.ilike(pattern),
                         WikiPage.body_markdown.ilike(pattern),
                     )
                 )
                 .order_by(WikiPage.title.asc())
                 .limit(50)
                 .all())
        for p in pages:
            results.append({
                'page': p,
                'excerpt': _excerpt(p.body_markdown or '', q),
                'title_match': q.lower() in p.title.lower(),
            })
        results.sort(key=lambda r: (not r['title_match'], r['page'].title.lower()))
    return render_template('wiki/search.html', q=q, results=results)


def _excerpt(body: str, query: str, context: int = 160) -> str:
    """Return a plain-text excerpt around the first match of query in body."""
    # Strip markdown syntax for a cleaner snippet
    plain = re.sub(r'[#*_`\[\]!]', '', body).replace('\n', ' ')
    lower = plain.lower()
    idx = lower.find(query.lower())
    if idx == -1:
        return plain[:context].strip() + ('…' if len(plain) > context else '')
    start = max(0, idx - context // 2)
    end = min(len(plain), idx + len(query) + context // 2)
    snippet = plain[start:end].strip()
    if start > 0:
        snippet = '…' + snippet
    if end < len(plain):
        snippet = snippet + '…'
    return snippet


@bp.route('/category/<category>')
def category(category):
    if category not in CATEGORY_DISPLAY:
        abort(404)
    pages = (WikiPage.query
             .filter_by(category=category, published=True)
             .order_by(WikiPage.title.asc())
             .all())
    # For the characters category, look up status for each page from DbCharacter
    char_statuses: dict[str, str] = {}
    if category == 'characters':
        names = [p.title for p in pages]
        if names:
            rows = DbCharacter.query.filter(
                db.func.lower(DbCharacter.character_name).in_(
                    [n.lower() for n in names]
                )
            ).all()
            for r in rows:
                s = r.status or ('active' if r.active else 'retired')
                char_statuses[r.character_name.lower()] = s
        # Sort: active first, then retired, then deceased — all alphabetically within group
        _order = {'active': 0, 'retired': 1, 'deceased': 2}
        pages = sorted(pages, key=lambda p: (
            _order.get(char_statuses.get(p.title.lower(), 'active'), 0),
            p.title.lower()
        ))
    return render_template('wiki/category.html',
                           active_category=category,
                           category_name=CATEGORY_DISPLAY[category],
                           pages=pages,
                           char_statuses=char_statuses)


def _xp_snapshot(character_name: str) -> tuple[dict | None, list]:
    """Return (xp_totals_dict, approved_spends) for a character, or (None, [])."""
    from sqlalchemy import func as _func
    from app.db import DbLedgerEntry
    char = DbCharacter.query.filter(
        _func.lower(DbCharacter.character_name) == character_name.lower()
    ).first()
    if not char:
        return None, []

    creation_xp = char.creation_xp or 0

    spend_total = db.session.query(
        _func.coalesce(_func.sum(DbSpendRequest.verified_cost), 0)
    ).filter(
        _func.lower(DbSpendRequest.character_name) == character_name.lower(),
        _func.lower(DbSpendRequest.status) == 'approved',
    ).scalar()
    total_spends = int(spend_total or 0)

    ledger = db.session.query(
        _func.coalesce(_func.sum(DbLedgerEntry.awarded), 0).label('awarded'),
        _func.coalesce(_func.sum(DbLedgerEntry.spent), 0).label('spent'),
    ).filter(
        _func.lower(DbLedgerEntry.character_name) == character_name.lower()
    ).first()
    ledger_awarded = int(ledger.awarded or 0)
    ledger_spent = int(ledger.spent or 0)

    total_xp = creation_xp + ledger_awarded
    balance = total_xp - total_spends - ledger_spent

    totals = {
        'total_xp': total_xp,
        'total_spends': total_spends + ledger_spent,
        'balance': balance,
    }

    approved_spends = (DbSpendRequest.query
                       .filter(
                           _func.lower(DbSpendRequest.character_name) == character_name.lower(),
                           _func.lower(DbSpendRequest.status) == 'approved',
                       )
                       .order_by(DbSpendRequest.review_date.desc(), DbSpendRequest.id.desc())
                       .all())

    return totals, approved_spends


@bp.route('/<slug>')
def page(slug):
    p = WikiPage.query.filter_by(slug=slug).first_or_404()
    if not p.published and not _is_staff():
        abort(404)
    body_html = _render_md(p.body_markdown)
    xp_snapshot, approved_spends, char_status = None, [], None
    if p.category == 'characters':
        xp_snapshot, approved_spends = _xp_snapshot(p.title)
        char_row = DbCharacter.query.filter(
            db.func.lower(DbCharacter.character_name) == p.title.lower()
        ).first()
        if char_row:
            char_status = char_row.status or ('active' if char_row.active else 'retired')
    return render_template('wiki/page.html', page=p, body_html=body_html,
                           xp_snapshot=xp_snapshot, approved_spends=approved_spends,
                           char_status=char_status)


# ── Staff routes ───────────────────────────────────────────────────────────────

@bp.route('/new', methods=['GET', 'POST'])
@require_staff
def new_page():
    if request.method == 'POST':
        title = request.form.get('title', '').strip()
        if not title:
            flash('Title is required.', 'danger')
            return redirect(url_for('wiki.new_page'))
        slug = _unique_slug(_slugify(title))
        p = WikiPage(
            slug=slug,
            title=title,
            body_markdown=request.form.get('body_markdown', ''),
            category=request.form.get('category', '').strip(),
            cover_image_url=request.form.get('cover_image_url', '').strip(),
            published=request.form.get('published') == '1',
            source='manual',
            updated_by=get_staff_user(),
        )
        db.session.add(p)
        db.session.commit()
        flash(f'Page "{title}" created.', 'success')
        return redirect(url_for('wiki.page', slug=slug))
    return render_template('wiki/edit.html', page=None)


@bp.route('/edit/<slug>', methods=['GET', 'POST'])
@require_staff
def edit_page(slug):
    p = WikiPage.query.filter_by(slug=slug).first_or_404()
    if request.method == 'POST':
        p.title = request.form.get('title', p.title).strip() or p.title
        p.category = request.form.get('category', p.category).strip()
        p.body_markdown = request.form.get('body_markdown', '')
        p.cover_image_url = request.form.get('cover_image_url', '').strip()
        p.published = request.form.get('published') == '1'
        p.updated_by = get_staff_user()
        p.updated_at = datetime.now(timezone.utc)
        db.session.commit()
        flash(f'Page "{p.title}" saved.', 'success')
        return redirect(url_for('wiki.page', slug=slug))
    return render_template('wiki/edit.html', page=p)


@bp.route('/delete/<slug>', methods=['POST'])
@require_staff
def delete_page(slug):
    p = WikiPage.query.filter_by(slug=slug).first_or_404()
    title = p.title
    db.session.delete(p)
    db.session.commit()
    flash(f'Page "{title}" deleted.', 'success')
    return redirect(url_for('wiki.index'))


@bp.route('/lock/<slug>', methods=['POST'])
@require_staff
def lock_page(slug):
    p = WikiPage.query.filter_by(slug=slug).first_or_404()
    if p.sync_locked:
        flash(f'Page "{p.title}" is already sync-locked.', 'info')
        return redirect(url_for('wiki.page', slug=slug))
    p.sync_locked = True
    p.sync_locked_by = get_staff_user()
    p.sync_locked_at = datetime.now(timezone.utc)
    db.session.commit()
    flash(f'Page "{p.title}" is now sync-locked. Bot sync upserts/deletes are blocked.', 'success')
    return redirect(url_for('wiki.page', slug=slug))


@bp.route('/unlock/<slug>', methods=['POST'])
@require_staff
def unlock_page(slug):
    p = WikiPage.query.filter_by(slug=slug).first_or_404()
    if not p.sync_locked:
        flash(f'Page "{p.title}" is not sync-locked.', 'info')
        return redirect(url_for('wiki.page', slug=slug))
    p.sync_locked = False
    p.sync_locked_by = ''
    p.sync_locked_at = None
    db.session.commit()
    flash(f'Page "{p.title}" sync lock removed. Bot sync can update it again.', 'success')
    return redirect(url_for('wiki.page', slug=slug))
