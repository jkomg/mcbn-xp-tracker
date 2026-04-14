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
from app.db import db, WikiPage

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
_RESERVED_SLUGS = frozenset({'new', 'edit', 'category'})


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
    """Allow-list HTML sanitizer using stdlib HTMLParser."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=False)
        self._out: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        tag = tag.lower()
        if tag not in _ALLOWED_TAGS:
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
        if tag in _VOID_TAGS:
            self._out.append(f'<{tag}{safe}>')
        else:
            self._out.append(f'<{tag}{safe}>')

    def handle_endtag(self, tag: str) -> None:
        tag = tag.lower()
        if tag in _ALLOWED_TAGS and tag not in _VOID_TAGS:
            self._out.append(f'</{tag}>')

    def handle_data(self, data: str) -> None:
        self._out.append(_html_mod.escape(data))

    def handle_entityref(self, name: str) -> None:
        self._out.append(f'&{name};')

    def handle_charref(self, name: str) -> None:
        self._out.append(f'&#{name};')

    def get_output(self) -> str:
        return ''.join(self._out)


def _sanitize(html_str: str) -> str:
    san = _HtmlSanitizer()
    san.feed(html_str)
    return san.get_output()


def _render_md(text: str) -> Markup:
    raw_html = md_lib.markdown(
        text or '',
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

@bp.route('/')
def index():
    recent = (WikiPage.query
              .filter_by(published=True)
              .order_by(WikiPage.updated_at.desc())
              .limit(8)
              .all())
    counts = {s: WikiPage.query.filter_by(category=s, published=True).count()
              for s, _, _ in CATEGORIES}
    return render_template('wiki/index.html', recent=recent, counts=counts)


@bp.route('/category/<category>')
def category(category):
    if category not in CATEGORY_DISPLAY:
        abort(404)
    pages = (WikiPage.query
             .filter_by(category=category, published=True)
             .order_by(WikiPage.title.asc())
             .all())
    return render_template('wiki/category.html',
                           active_category=category,
                           category_name=CATEGORY_DISPLAY[category],
                           pages=pages)


@bp.route('/<slug>')
def page(slug):
    p = WikiPage.query.filter_by(slug=slug).first_or_404()
    if not p.published and not _is_staff():
        abort(404)
    body_html = _render_md(p.body_markdown)
    return render_template('wiki/page.html', page=p, body_html=body_html)


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
