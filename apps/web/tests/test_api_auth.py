from flask import Flask, jsonify

from app.blueprints.api import require_bot_token


def _app():
    app = Flask(__name__)
    app.config["WEB_APP_API_TOKEN"] = "expected-token"

    @app.route("/protected")
    @require_bot_token
    def protected():
        return jsonify({"ok": True})

    return app


def test_require_bot_token_rejects_invalid_token():
    app = _app()
    with app.test_client() as client:
        res = client.get("/protected", headers={"Authorization": "Bearer wrong-token"})
        assert res.status_code == 401


def test_require_bot_token_accepts_valid_token():
    app = _app()
    with app.test_client() as client:
        res = client.get("/protected", headers={"Authorization": "Bearer expected-token"})
        assert res.status_code == 200
        assert res.get_json()["ok"] is True
