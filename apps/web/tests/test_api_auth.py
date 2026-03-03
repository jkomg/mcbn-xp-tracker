import time

from flask import Flask, jsonify

from app.blueprints.api import require_bot_scope, require_replay_protection


def _app():
    app = Flask(__name__)
    app.config["WEB_APP_API_TOKEN"] = "legacy-token"
    app.config["WEB_APP_API_READ_TOKEN"] = "read-token"
    app.config["WEB_APP_API_WRITE_TOKEN"] = "write-token"
    app.config["BOT_API_REPLAY_PROTECTION_ENABLED"] = True
    app.config["BOT_API_REPLAY_WINDOW_SECONDS"] = 300
    app.config["BOT_API_NONCE_TTL_SECONDS"] = 600
    app.config["BOT_API_NONCE_CACHE_SIZE"] = 1000

    @app.route("/read")
    @require_bot_scope("read")
    def read():
        return jsonify({"ok": True})

    @app.route("/write", methods=["POST"])
    @require_bot_scope("write")
    @require_replay_protection
    def write():
        return jsonify({"ok": True})

    return app


def _write_headers(token: str, nonce: str, ts: int | None = None):
    if ts is None:
        ts = int(time.time())
    return {
        "Authorization": f"Bearer {token}",
        "X-Request-Timestamp": str(ts),
        "X-Request-Nonce": nonce,
    }


def test_scope_rejects_invalid_token():
    app = _app()
    with app.test_client() as client:
        res = client.get("/read", headers={"Authorization": "Bearer wrong-token"})
        assert res.status_code == 401


def test_legacy_token_has_read_and_write_scope():
    app = _app()
    with app.test_client() as client:
        read = client.get("/read", headers={"Authorization": "Bearer legacy-token"})
        write = client.post("/write", headers=_write_headers("legacy-token", "nonce-1"))
        assert read.status_code == 200
        assert write.status_code == 200


def test_read_token_cannot_call_write_route():
    app = _app()
    with app.test_client() as client:
        res = client.post("/write", headers=_write_headers("read-token", "nonce-2"))
        assert res.status_code == 403


def test_replay_protection_requires_headers():
    app = _app()
    with app.test_client() as client:
        res = client.post("/write", headers={"Authorization": "Bearer write-token"})
        assert res.status_code == 400


def test_replay_protection_rejects_duplicate_nonce():
    app = _app()
    with app.test_client() as client:
        first = client.post("/write", headers=_write_headers("write-token", "nonce-dup"))
        second = client.post("/write", headers=_write_headers("write-token", "nonce-dup"))
        assert first.status_code == 200
        assert second.status_code == 409
