"""Minimal DBAPI-2 adapter for Turso's HTTP pipeline API (v2).

Replaces libsql-experimental to avoid Hrana stream expiry issues on Cloud Run.
Stateless by default — each auto-commit execute is a self-contained HTTP POST.
Transactions use Turso's baton mechanism: BEGIN returns a baton that threads
subsequent requests through the same server-side transaction until COMMIT/ROLLBACK
closes it.
"""
import json
import sqlite3
import urllib.error
import urllib.request
from typing import Any, Optional

apilevel = '2.0'
threadsafety = 1
paramstyle = 'qmark'


class TursoCursor:
    def __init__(self, conn: 'TursoConnection'):
        self._conn = conn
        self.description: Optional[list] = None
        self.rowcount: int = -1
        self.lastrowid: Optional[int] = None
        self._rows: list = []
        self._pos: int = 0

    def _to_turso_arg(self, v: Any) -> dict:
        if v is None:
            return {'type': 'null', 'value': None}
        if isinstance(v, bool):
            return {'type': 'integer', 'value': str(int(v))}
        if isinstance(v, int):
            return {'type': 'integer', 'value': str(v)}
        if isinstance(v, float):
            return {'type': 'real', 'value': str(v)}
        if isinstance(v, bytes):
            import base64
            return {'type': 'blob', 'value': base64.b64encode(v).decode()}
        return {'type': 'text', 'value': str(v)}

    def _from_turso_value(self, v: dict) -> Any:
        if v is None or v.get('type') == 'null':
            return None
        t = v.get('type', '')
        val = v.get('value', '')
        if t == 'integer':
            return int(val)
        if t == 'real':
            return float(val)
        if t == 'blob':
            import base64
            return base64.b64decode(val)
        return val  # text

    def _build_stmt(self, sql: str, parameters) -> dict:
        if parameters:
            if isinstance(parameters, dict):
                named_args = [{'name': k, 'value': self._to_turso_arg(v)} for k, v in parameters.items()]
                return {'sql': sql, 'named_args': named_args}
            return {'sql': sql, 'args': [self._to_turso_arg(v) for v in parameters]}
        return {'sql': sql}

    def execute(self, sql: str, parameters=None):
        stmt = self._build_stmt(sql, parameters)
        first_word = sql.strip().split()[0].upper() if sql.strip() else ''
        in_tx = self._conn._baton is not None

        if first_word == 'BEGIN':
            # Start a transaction — omit close so Turso returns a baton.
            requests = [{'type': 'execute', 'stmt': stmt}]
        elif in_tx and first_word in ('COMMIT', 'ROLLBACK'):
            # End the transaction — include close to release the baton.
            requests = [{'type': 'execute', 'stmt': stmt}, {'type': 'close'}]
        elif in_tx:
            # Mid-transaction statement — omit close to keep the baton alive.
            requests = [{'type': 'execute', 'stmt': stmt}]
        else:
            # Auto-commit mode — include close for a clean single-shot request.
            requests = [{'type': 'execute', 'stmt': stmt}, {'type': 'close'}]

        results = self._conn._post(requests)
        result = results[0]
        if result['type'] == 'error':
            msg = result.get('error', {}).get('message', 'unknown error')
            raise sqlite3.OperationalError(f'Turso: {msg}')

        data = result['response']['result']
        cols = data.get('cols', [])
        rows = data.get('rows', [])
        self.description = (
            [(col['name'], None, None, None, None, None, None) for col in cols]
            if cols else None
        )
        self.rowcount = data.get('affected_row_count', -1)
        last = data.get('last_insert_rowid')
        self.lastrowid = int(last) if last is not None else None
        self._rows = [tuple(self._from_turso_value(cell) for cell in row) for row in rows]
        self._pos = 0
        return self

    def executemany(self, sql: str, seq_of_parameters):
        for params in seq_of_parameters:
            self.execute(sql, params)

    def fetchone(self):
        if self._pos >= len(self._rows):
            return None
        row = self._rows[self._pos]
        self._pos += 1
        return row

    def fetchall(self):
        rows = self._rows[self._pos:]
        self._pos = len(self._rows)
        return rows

    def fetchmany(self, size: int = 1):
        rows = self._rows[self._pos:self._pos + size]
        self._pos += len(rows)
        return rows

    def close(self):
        pass

    def __iter__(self):
        return iter(self.fetchall())


class TursoConnection:
    def __init__(self, base_url: str, auth_token: str):
        self._endpoint = f'{base_url}/v2/pipeline'
        self._headers = {
            'Authorization': f'Bearer {auth_token}',
            'Content-Type': 'application/json',
        }
        self._baton: Optional[str] = None

    def _post(self, requests: list) -> list:
        body: dict = {'requests': requests}
        if self._baton:
            body['baton'] = self._baton
        payload = json.dumps(body).encode()
        req = urllib.request.Request(
            self._endpoint,
            data=payload,
            headers=self._headers,
            method='POST',
        )
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                resp_body = json.loads(resp.read())
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode(errors='replace')
            raise sqlite3.OperationalError(f'Turso HTTP {exc.code}: {detail}') from exc
        # Baton is present while a transaction is open; absent (or None) once closed.
        self._baton = resp_body.get('baton')
        return resp_body['results']

    def cursor(self, *_a, **_kw) -> TursoCursor:
        return TursoCursor(self)

    def commit(self):
        if self._baton is None:
            return
        self._post([
            {'type': 'execute', 'stmt': {'sql': 'COMMIT'}},
            {'type': 'close'},
        ])

    def rollback(self):
        if self._baton is None:
            return
        self._post([
            {'type': 'execute', 'stmt': {'sql': 'ROLLBACK'}},
            {'type': 'close'},
        ])

    def close(self):
        if self._baton is not None:
            self.rollback()

    def create_function(self, *_a, **_kw):
        pass


def connect(url: str, auth_token: str) -> TursoConnection:
    return TursoConnection(url, auth_token)
