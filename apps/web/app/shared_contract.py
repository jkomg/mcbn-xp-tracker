"""Load shared monorepo contracts/rules used by web and bot."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any


def _repo_root() -> Path:
    # .../apps/web/app/shared_contract.py -> repo root
    return Path(__file__).resolve().parents[3]


def load_json(relative_path: str) -> Any:
    path = _repo_root() / relative_path
    with path.open(encoding='utf-8') as f:
        return json.load(f)
