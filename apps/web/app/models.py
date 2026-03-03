"""Data classes for MCbN XP Tracker entities."""

from dataclasses import dataclass
from .shared_contract import load_json


@dataclass
class Character:
    character_name: str
    player_discord: str = ''          # Numeric Discord user ID
    player_discord_name: str = ''     # Human-readable Discord display name
    clan: str = ''
    age_category: str = ''  # Fledgling, Neonate, Ancilla, Elder, Mortal
    sect: str = ''           # Camarilla, Anarch, Hecata, Autarkis
    active: bool = True
    creation_xp: int = 0    # Audit baseline XP
    enemy: str = ''
    date_added: str = ''
    notes: str = ''

    # Computed fields (not stored in Roster sheet)
    earned_xp: int = 0
    approved_spends: int = 0
    available_xp: int = 0
    last_submission: str = ''


@dataclass
class PlayPeriod:
    period_label: str         # e.g., "Night 53 - 1/27 - 2/8"
    night_number: int = 0
    start_date: str = ''
    end_date: str = ''
    session_number: int = 0
    submissions_open: bool = True
    active: bool = True


@dataclass
class XPClaim:
    row_index: int = 0       # Row number in the sheet (for updates)
    timestamp: str = ''
    character_name: str = ''
    play_period: str = ''

    # Six XP categories - each has a checkbox and link
    posted_once: bool = False
    posted_once_link: str = ''
    hunting_awakening: bool = False
    hunting_awakening_link: str = ''
    scene_with_another: bool = False
    scene_with_another_link: str = ''
    conflict: bool = False
    conflict_link: str = ''
    combat: bool = False
    combat_link: str = ''
    unmitigated_stain: bool = False
    unmitigated_stain_link: str = ''
    wildcard: bool = False
    wildcard_link: str = ''
    wildcard_reason: str = ''
    wildcard_amount: int = 0

    xp_claimed: int = 0
    status: str = 'Pending'  # Pending, Approved, Denied, DUPLICATE
    approved_xp: int = 0
    reviewed_by: str = ''
    review_date: str = ''
    st_notes: str = ''

    @property
    def categories(self) -> list[dict]:
        """Return a list of category dicts for template rendering."""
        return [
            {
                'name': 'Posted at least once',
                'claimed': self.posted_once,
                'link': self.posted_once_link,
            },
            {
                'name': 'Hunting / Awakening scene',
                'claimed': self.hunting_awakening,
                'link': self.hunting_awakening_link,
            },
            {
                'name': 'Scene with another character',
                'claimed': self.scene_with_another,
                'link': self.scene_with_another_link,
            },
            {
                'name': 'Conflict with another character',
                'claimed': self.conflict,
                'link': self.conflict_link,
            },
            {
                'name': 'Combat with another character',
                'claimed': self.combat,
                'link': self.combat_link,
            },
            {
                'name': 'Unmitigated stain',
                'claimed': self.unmitigated_stain,
                'link': self.unmitigated_stain_link,
            },
            {
                'name': f'Wildcard ({self.wildcard_amount} XP): {self.wildcard_reason}' if self.wildcard_reason else f'Wildcard ({self.wildcard_amount} XP)',
                'claimed': self.wildcard,
                'link': self.wildcard_link,
            },
        ]


@dataclass
class SpendRequest:
    row_index: int = 0
    timestamp: str = ''
    character_name: str = ''
    spend_category: str = ''   # Attribute, Skill, Discipline, etc.
    trait_name: str = ''       # e.g., "Strength", "Dominate"
    current_dots: int = 0
    new_dots: int = 0
    xp_cost: int = 0          # Player-submitted cost
    is_in_clan: bool = False
    justification: str = ''
    status: str = 'Pending'
    verified_cost: int = 0     # Staff-verified cost
    reviewed_by: str = ''
    review_date: str = ''
    st_notes: str = ''


@dataclass
class LedgerEntry:
    """A single line in a character's XP ledger — award or spend."""
    row_index: int = 0
    character_name: str = ''
    date: str = ''            # e.g., "2025-01-27"
    awarded: int = 0          # XP earned (positive only)
    spent: int = 0            # XP spent (positive only)
    reason: str = ''
    entered_by: str = ''      # Staff who entered it
    timestamp: str = ''       # When it was entered (auto)


@dataclass
class AuditEntry:
    timestamp: str = ''
    staff_user: str = ''
    action_type: str = ''
    target_character: str = ''
    details: str = ''


# Constants for dropdown options
CLANS = [
    'Brujah', 'Gangrel', 'Hecata', 'Lasombra', 'Malkavian',
    'Nosferatu', 'Ravnos', 'Salubri', 'Toreador', 'Tremere',
    'Tzimisce', 'Ventrue', 'Banu Haqim', 'The Ministry',
    'Thin-Blood', 'Caitiff',
    'Mortal', 'Ghoul',
]

AGE_CATEGORIES = ['Fledgling', 'Neonate', 'Ancilla', 'Elder', 'Mortal']

SECTS = ['Camarilla', 'Anarch', 'Hecata', 'Autarkis', 'NA']

SPEND_CATEGORIES = load_json('packages/api-contract/spend_categories.json')
