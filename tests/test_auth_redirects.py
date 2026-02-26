from flask import Flask, session

from app.auth import pop_login_next, stash_login_next


def _app():
    app = Flask(__name__)
    app.secret_key = "test-secret"
    return app


def test_stash_login_next_keeps_local_path_with_query():
    app = _app()
    with app.test_request_context("/player/MyChar?tab=claims"):
        stash_login_next()
        assert session["login_next"] == "/player/MyChar?tab=claims"


def test_pop_login_next_rejects_external_url():
    app = _app()
    with app.test_request_context("/login"):
        session["login_next"] = "https://evil.example/phish"
        assert pop_login_next("/player/") == "/player/"
