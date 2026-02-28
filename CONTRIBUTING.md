# Contributing

Thanks for your interest in contributing.

## Before You Start

- Read [README.md](README.md) for architecture and setup.
- Check open issues and existing PRs to avoid duplicate work.
- For security issues, do **not** open a public issue. See [SECURITY.md](SECURITY.md).

## Local Setup

```bash
python3 --version  # requires 3.12+
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

Then configure `.env` values and run:

```bash
./dev.sh
```

## Branching and PRs

- Create a branch from `main`.
- Keep PRs focused and reasonably small.
- Include tests for behavior changes when possible.
- Update docs (`README.md`/`CHANGELOG.md`) for user-visible changes.

## Testing

Run tests before opening a PR:

```bash
./venv/bin/pytest -q
```

Run lint:

```bash
./venv/bin/python -m pip install ruff
./venv/bin/ruff check app tests
```

## Coding Guidelines

- Prefer clear, explicit logic over clever shortcuts.
- Keep route handlers thin; put data logic in `app/sheets.py` or dedicated modules.
- Validate all external input server-side.
- Preserve backward compatibility for existing Google Sheet tab/header contracts.

## Commit Messages

Use short imperative summaries, e.g.:

- `Fix advantage cost for 0->2 purchases`
- `Add CSRF protection to staff forms`

## License

By contributing, you agree that your contributions are licensed under the
[MIT License](LICENSE).
