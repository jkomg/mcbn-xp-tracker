"""Load shared monorepo contracts/rules used by web and bot."""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any


def _repo_root() -> Path:
    configured = os.environ.get('MONOREPO_ROOT', '').strip()
    if configured:
        candidate = Path(configured).expanduser().resolve()
        if candidate.exists():
            return candidate

    here = Path(__file__).resolve()
    for candidate in [here.parent, *here.parents]:
        marker = candidate / 'packages' / 'api-contract' / 'spend_categories.json'
        if marker.exists():
            return candidate

    raise RuntimeError(
        'Unable to determine monorepo root for shared contracts. '
        'Set MONOREPO_ROOT or ensure packages/api-contract exists in parent path.'
    )


def load_json(relative_path: str) -> Any:
    path = _repo_root() / relative_path
    with path.open(encoding='utf-8') as f:
        return json.load(f)
