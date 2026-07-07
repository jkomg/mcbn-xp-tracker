"""Hand-maintained mirror of the bot's Discord command tree, for the
Settings page's per-command/subcommand kill switches.

This is a manual mirror — same convention this codebase already uses for
BOOL_KEYS/INT_KEYS/STR_KEYS duplicated across api.py/settings.py and the
bot's configSyncWorker.ts/liveConfig.ts for every existing flag. Update this
file whenever a command or subcommand is added, renamed, or removed in
apps/bot/src/commands/*.ts — nothing here is auto-discovered from the bot.

Tokens: a bare command name (e.g. "xp") disables the whole command,
cascading to every subcommand. A dotted token (e.g. "xp.submit",
"lasombra.permissions.apply") disables just that leaf. Subcommand *groups*
(lasombra's "permissions") are flattened directly into their children's
tokens — there is no separate group-level toggle.
"""

BOT_COMMAND_CATALOG = [
    {
        'name': 'ping',
        'label': '/ping',
        'description': 'Bot health check.',
        'subcommands': [],
    },
    {
        'name': 'xp',
        'label': '/xp',
        'description': 'XP workflow bridge commands.',
        'subcommands': [
            {'name': 'submit', 'label': 'submit', 'description': 'Player-portal claim link (wizard stubbed out).'},
            {'name': 'summary', 'label': 'summary', 'description': 'XP totals for a character.'},
            {'name': 'history', 'label': 'history', 'description': 'Recent approved claims and spends.'},
            {'name': 'claim', 'label': 'claim', 'description': 'Player-portal claim link (wizard stubbed out).'},
            {'name': 'spend', 'label': 'spend', 'description': 'Player-portal spend link (wizard stubbed out).'},
            {'name': 'spend-cost', 'label': 'spend-cost', 'description': 'Preview V5 XP cost of a spend.'},
            {'name': 'health', 'label': 'health', 'description': 'Staff: bot-to-web API health check.'},
            {'name': 'help', 'label': 'help', 'description': 'Quick player help text.'},
            {'name': 'test-reminder', 'label': 'test-reminder', 'description': 'Staff test: post a dummy cubby reminder.'},
            {'name': 'test-passage', 'label': 'test-passage', 'description': 'Staff test: post a passage-of-time message.'},
            {'name': 'sync-cubby-access', 'label': 'sync-cubby-access', 'description': 'Staff: grant bot permissions on cubby channels.'},
        ],
    },
    {
        'name': 'coterie',
        'label': '/coterie',
        'description': 'Coterie information commands.',
        'subcommands': [
            {'name': 'status', 'label': 'status', 'description': "Show your coterie's domain and members."},
        ],
    },
    {
        'name': 'combat',
        'label': '/combat',
        'description': 'Combat tracker commands.',
        'subcommands': [
            {'name': 'start', 'label': 'start', 'description': 'Open the combat setup form.'},
        ],
    },
    {
        'name': 'lasombra',
        'label': '/lasombra',
        'description': 'Staff utility commands.',
        'subcommands': [
            {'name': 'approve', 'label': 'approve', 'description': 'Approve a character ticket.'},
            {'name': 'update', 'label': 'update', 'description': 'Post a sheet update to #player-character-sheets.'},
            {'name': 'retainer-update', 'label': 'retainer-update', 'description': 'Post a retainer sheet update to #player-retainer-sheets.'},
            {'name': 'edit', 'label': 'edit', 'description': "Edit a character's clan/sect/age."},
            {'name': 'delete', 'label': 'delete', 'description': 'Hard-delete a character with no history.'},
            {'name': 'broadcast', 'label': 'broadcast', 'description': 'Send a staff message to cubbies/announcements/a channel.'},
            {'name': 'sync-cubbies', 'label': 'sync-cubbies', 'description': 'Scan cubby channels, backfill IDs, retire missing cubbies.'},
            {'name': 'scan-activity', 'label': 'scan-activity', 'description': 'Backfill Discord post counts for IC nights.'},
            {'name': 'cancel-scan', 'label': 'cancel-scan', 'description': 'Cancel a running scan-activity backfill.'},
            {'name': 'coterie-create', 'label': 'coterie-create', 'description': 'Activate a coterie and post the setup link.'},
            {'name': 'blank', 'label': 'blank', 'description': 'Blank a tracked background for one night.'},
            {'name': 'permissions.audit', 'label': 'permissions audit', 'description': 'Read-only mention/overwrite/visibility scan.'},
            {'name': 'permissions.apply', 'label': 'permissions apply', 'description': 'Administrator-only: fix + snapshot.'},
            {'name': 'permissions.rollback', 'label': 'permissions rollback', 'description': 'Administrator-only: restore a prior snapshot.'},
        ],
    },
    {
        'name': 'deliver',
        'label': '/deliver',
        'description': 'Hand-deliver an in-character letter to #kindred-delivery.',
        'subcommands': [],
    },
    {
        'name': 'contact',
        'label': '/contact',
        'description': 'Text messages between characters via #kindred-contact.',
        'subcommands': [
            {'name': 'send', 'label': 'send', 'description': 'Start a new conversation.'},
            {'name': 'reply', 'label': 'reply', 'description': 'Reply to an existing conversation.'},
        ],
    },
    {
        'name': 'prestation',
        'label': '/prestation',
        'description': 'Boon ledger for #prestation.',
        'subcommands': [
            {'name': 'owe', 'label': 'owe', 'description': 'Record that another character owes you a boon.'},
            {'name': 'status', 'label': 'status', 'description': 'See boons owed to you and boons you owe.'},
            {'name': 'repay', 'label': 'repay', 'description': 'Propose or confirm repayment of a boon.'},
        ],
    },
    {
        'name': 'post',
        'label': '/post',
        'description': 'In-character social media post to #social-media.',
        'subcommands': [],
    },
    {
        'name': 'cobweb',
        'label': '/cobweb',
        'description': 'Malkavian Cobweb broadcast to #reach-out-and-touch-mind.',
        'subcommands': [],
    },
    {
        'name': 'rumor',
        'label': '/rumor',
        'description': 'Post a rumor to #rumors using the standard template.',
        'subcommands': [],
    },
]


def flattened_tokens() -> set[str]:
    """All valid tokens (command names and dotted subcommand tokens)."""
    tokens: set[str] = set()
    for command in BOT_COMMAND_CATALOG:
        tokens.add(command['name'])
        for sub in command['subcommands']:
            tokens.add(f"{command['name']}.{sub['name']}")
    return tokens
