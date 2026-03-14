"""Staff settings overview — read-only view of current configuration."""

from flask import Blueprint, current_app, render_template
from app.auth import require_staff

bp = Blueprint('settings', __name__)


@bp.route('/')
@require_staff
def index():
    cfg = current_app.config

    # ── Web app feature flags ──────────────────────────────────────────────
    web_flags = [
        {
            'label': 'Auto-Create Periods',
            'env': 'AUTO_CREATE_PERIODS_ENABLED',
            'enabled': bool(cfg.get('AUTO_CREATE_PERIODS_ENABLED')),
            'description': 'Automatically creates the next play period when due.',
        },
        {
            'label': 'Auto-Close Periods',
            'env': 'AUTO_CLOSE_PERIODS_ENABLED',
            'enabled': bool(cfg.get('AUTO_CLOSE_PERIODS_ENABLED')),
            'description': 'Closes the current period after its end date and queues reminder DMs.',
        },
        {
            'label': 'Bot API Replay Protection',
            'env': 'BOT_API_REPLAY_PROTECTION_ENABLED',
            'enabled': bool(cfg.get('BOT_API_REPLAY_PROTECTION_ENABLED')),
            'description': 'Requires nonce + timestamp headers on write endpoints to prevent replay attacks.',
        },
        {
            'label': 'Sheets Header Validation',
            'env': 'SHEETS_VALIDATE_HEADERS_ON_STARTUP',
            'enabled': bool(cfg.get('SHEETS_VALIDATE_HEADERS_ON_STARTUP')),
            'description': 'Validates Google Sheets column headers on app startup.',
        },
        {
            'label': 'Local Status Page',
            'env': 'LOCAL_STATUS_ENABLED',
            'enabled': bool(cfg.get('LOCAL_STATUS_ENABLED')),
            'description': 'Enables the /local/status diagnostics page (localhost only).',
        },
    ]

    # ── Web app tuning ─────────────────────────────────────────────────────
    web_tuning = [
        {
            'label': 'Period open lead days',
            'env': 'AUTO_CREATE_PERIODS_OPEN_LEAD_DAYS',
            'value': cfg.get('AUTO_CREATE_PERIODS_OPEN_LEAD_DAYS', 1),
            'description': 'Days before the current period ends to open the next one.',
        },
        {
            'label': 'Default period length',
            'env': 'AUTO_CREATE_PERIODS_DEFAULT_LENGTH_DAYS',
            'value': cfg.get('AUTO_CREATE_PERIODS_DEFAULT_LENGTH_DAYS', 14),
            'description': 'Default length of a new period in days.',
        },
        {
            'label': 'Default period gap',
            'env': 'AUTO_CREATE_PERIODS_DEFAULT_GAP_DAYS',
            'value': cfg.get('AUTO_CREATE_PERIODS_DEFAULT_GAP_DAYS', 0),
            'description': 'Days between end of one period and start of the next.',
        },
        {
            'label': 'Replay protection window',
            'env': 'BOT_API_REPLAY_WINDOW_SECONDS',
            'value': cfg.get('BOT_API_REPLAY_WINDOW_SECONDS', 300),
            'description': 'Seconds within which a bot request timestamp must fall.',
        },
        {
            'label': 'Nonce TTL',
            'env': 'BOT_API_NONCE_TTL_SECONDS',
            'value': cfg.get('BOT_API_NONCE_TTL_SECONDS', 600),
            'description': 'How long a nonce is remembered to detect replays.',
        },
        {
            'label': 'Session lifetime',
            'env': 'SESSION_LIFETIME_SECONDS',
            'value': int(cfg.get('PERMANENT_SESSION_LIFETIME').total_seconds()),
            'description': 'Staff login session duration in seconds.',
        },
        {
            'label': 'Sheets cache TTL',
            'env': 'SHEETS_CACHE_TTL',
            'value': cfg.get('SHEETS_CACHE_TTL', 30),
            'description': 'How long Google Sheets reads are cached (seconds).',
        },
    ]

    # ── Integration status (configured / not configured) ───────────────────
    integrations = [
        {
            'label': 'Google Sheets backup',
            'configured': bool(cfg.get('SPREADSHEET_ID')),
            'description': 'Mirrors writes to a Google Sheet as a backup.',
        },
        {
            'label': 'Bot API (legacy token)',
            'configured': bool(cfg.get('WEB_APP_API_TOKEN')),
            'description': 'Single all-scope token for bot API access.',
        },
        {
            'label': 'Bot API read token',
            'configured': bool(cfg.get('WEB_APP_API_READ_TOKEN')),
            'description': 'Read-scoped token for bot API access.',
        },
        {
            'label': 'Bot API write token',
            'configured': bool(cfg.get('WEB_APP_API_WRITE_TOKEN')),
            'description': 'Write-scoped token for bot API access.',
        },
        {
            'label': 'Turso (cloud database)',
            'configured': bool(cfg.get('TURSO_CONNECT_URL')),
            'description': 'libSQL/Turso remote database (production). SQLite used when not configured.',
        },
    ]

    # ── Bot feature flags (static reference — bot config is not accessible here) ──
    bot_flags = [
        {
            'label': 'Review Notifier',
            'env': 'REVIEW_NOTIFIER_ENABLED',
            'description': 'Posts claim/spend approval and denial notices into character cubby channels.',
            'interval_env': 'REVIEW_NOTIFIER_INTERVAL_MS',
        },
        {
            'label': 'Submission Notifier',
            'env': 'SUBMISSION_NOTIFIER_ENABLED',
            'description': 'Posts new claim and spend submissions to a staff channel.',
            'interval_env': 'SUBMISSION_NOTIFIER_INTERVAL_MS',
        },
        {
            'label': 'Auto-Create Periods',
            'env': 'AUTO_PERIOD_CREATOR_ENABLED',
            'description': 'Bot triggers web-side period creation on a schedule.',
            'interval_env': 'AUTO_PERIOD_CREATOR_INTERVAL_MS',
        },
        {
            'label': 'Auto-Close Periods',
            'env': 'AUTO_PERIOD_CLOSER_ENABLED',
            'description': 'Bot triggers web-side period close and sends DMs to non-submitters.',
            'interval_env': 'AUTO_PERIOD_CLOSER_INTERVAL_MS',
        },
        {
            'label': 'Claim Reminders',
            'env': 'CLAIM_REMINDER_ENABLED',
            'description': 'DMs players with active characters who haven\'t filed a claim for the current period.',
            'interval_env': 'CLAIM_REMINDER_INTERVAL_MS',
        },
        {
            'label': 'Passage of Time',
            'env': 'PASSAGE_OF_TIME_ENABLED',
            'description': 'Posts sunrise, sunset, and downtime messages on a fortnightly/bi-monthly cadence.',
            'interval_env': 'PASSAGE_OF_TIME_INTERVAL_MS',
        },
        {
            'label': 'Hunt Consequence Monitor',
            'env': 'HUNT_CONSEQUENCE_ENABLED',
            'description': 'Monitors designated channels for hunt posts and routes consequence rolls to staff.',
            'interval_env': None,
        },
    ]

    return render_template(
        'settings/index.html',
        web_flags=web_flags,
        web_tuning=web_tuning,
        integrations=integrations,
        bot_flags=bot_flags,
    )
