from flask import Flask

from app import _apply_local_session_cookie_defaults


def _app_for(redirect_uri: str) -> Flask:
    app = Flask(__name__)
    app.config["DISCORD_REDIRECT_URI"] = redirect_uri
    app.config["SESSION_COOKIE_SECURE"] = True
    app.config["REMEMBER_COOKIE_SECURE"] = True
    return app


def test_local_http_redirect_disables_secure_cookies_when_unset():
    app = _app_for("http://127.0.0.1:5001/auth/callback")
    _apply_local_session_cookie_defaults(app, session_cookie_secure_configured=False)
    assert app.config["SESSION_COOKIE_SECURE"] is False
    assert app.config["REMEMBER_COOKIE_SECURE"] is False


def test_explicit_cookie_setting_is_respected():
    app = _app_for("http://127.0.0.1:5001/auth/callback")
    _apply_local_session_cookie_defaults(app, session_cookie_secure_configured=True)
    assert app.config["SESSION_COOKIE_SECURE"] is True
    assert app.config["REMEMBER_COOKIE_SECURE"] is True


def test_non_local_or_https_redirects_remain_secure():
    app = _app_for("https://mcbn.jkomg.us/auth/callback")
    _apply_local_session_cookie_defaults(app, session_cookie_secure_configured=False)
    assert app.config["SESSION_COOKIE_SECURE"] is True
    assert app.config["REMEMBER_COOKIE_SECURE"] is True
