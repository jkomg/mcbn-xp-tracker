# API Contract Package

Shared cross-app contract artifacts used by both `apps/web` and `apps/bot`.

## Files

- `spend_categories.json`: canonical XP spend category list.

## Usage

- Web: loaded via `apps/web/app/shared_contract.py`
- Bot: loaded via `apps/bot/src/sharedContract.ts`
