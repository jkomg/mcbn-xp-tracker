"""Answer 503, not an unhandled 500, while Turso is unreachable.

A Turso outage fails whatever request touches the database at that moment, and
the generic handler in app/__init__.py records each one as an unhandled
exception and escalates it to Discord. None of that is actionable: callers
retry (the bot polls again next cycle), and the AppLogEntry write it attempts
fails during the same outage anyway.

Two kinds get None here and still go through the generic handler as an
alerting 500: errors where Turso answered and refused the SQL, and failures
where a write may have been applied before the answer was lost. A caller that
retries the second kind can apply it twice, so staff need to see it.
"""
from typing import Optional

from flask import Response, current_app, jsonify, make_response, request
from sqlalchemy.exc import OperationalError

from .db import db
from .turso_http import TursoUnavailableError

# Seconds a caller should wait before trying again.
RETRY_AFTER_SECONDS = 30


def db_unavailable_response(exc: BaseException) -> Optional[Response]:
    """A 503 for a Turso outage, or None for any other exception."""
    if not (isinstance(exc, OperationalError) and isinstance(exc.orig, TursoUnavailableError)):
        return None
    if exc.orig.may_have_applied:
        return None
    try:
        db.session.rollback()
    except Exception:
        pass
    current_app.logger.warning('db_unavailable on %s: %s', request.path, exc.orig)
    if request.path.startswith('/api/'):
        resp = make_response(jsonify({'ok': False, 'error': 'db_unavailable'}), 503)
    else:
        resp = make_response(
            'The database is temporarily unavailable. Please try again in a minute.', 503,
        )
    resp.headers['Retry-After'] = str(RETRY_AFTER_SECONDS)
    return resp
