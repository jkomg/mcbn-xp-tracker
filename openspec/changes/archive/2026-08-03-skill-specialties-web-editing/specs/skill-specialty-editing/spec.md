## Purpose

Lets players purchase skill specialties after character creation through the normal XP spend-request flow, and lets staff correct a character's specialties directly, instead of specialties only ever entering the sheet via RoD/CC import.

## ADDED Requirements

### Requirement: Player can request a skill specialty purchase
The system SHALL allow a player to submit a spend request for a Skill Specialty on any skill their character has rated at 1 or higher, at a fixed cost of 3 XP, following the same submission/review/approval pipeline used for other spend categories.

#### Scenario: Player submits a valid specialty request
- **WHEN** a player submits a Skill Specialty spend request naming a skill rated ≥ 1 on their character and a specialty name not already present on that skill
- **THEN** the system creates a pending spend request for staff review at a cost of 3 XP

#### Scenario: Player attempts a specialty on an unrated skill
- **WHEN** a player submits a Skill Specialty spend request naming a skill rated 0 (or not present) on their character
- **THEN** the system rejects the submission and does not create a spend request

#### Scenario: Player attempts a duplicate specialty
- **WHEN** a player submits a Skill Specialty spend request naming a specialty that already exists for that skill on their character
- **THEN** the system rejects the submission and does not create a spend request

### Requirement: Approved specialty purchase updates the character sheet
The system SHALL add the named specialty to the character's `skill_specialties` for that skill when a Skill Specialty spend request is approved, and SHALL remove it if that approval is later reversed.

#### Scenario: Approval adds the specialty
- **WHEN** staff approve a pending Skill Specialty spend request
- **THEN** the specialty name is added to the character's specialties for that skill and becomes visible on the character sheet

#### Scenario: Reversal removes the specialty
- **WHEN** staff reverse an approval for a Skill Specialty spend request whose specialty is still present unchanged on the character sheet
- **THEN** the specialty is removed from the character's specialties for that skill

### Requirement: Staff can directly edit a character's skill specialties
The system SHALL allow staff to add or remove a skill specialty on a character's sheet directly, without an XP charge and without going through the spend-request pipeline.

#### Scenario: Staff adds a specialty directly
- **WHEN** staff add a specialty to a skill on a character's sheet via the roster/sheet edit view
- **THEN** the specialty appears on the character's specialties for that skill with no XP deducted

#### Scenario: Staff removes a specialty directly
- **WHEN** staff remove an existing specialty from a skill on a character's sheet via the roster/sheet edit view
- **THEN** the specialty no longer appears on the character's specialties for that skill

#### Scenario: Staff attempts a duplicate specialty
- **WHEN** staff attempt to add a specialty name that already exists for that skill on the character
- **THEN** the system rejects the edit and the existing specialty list is unchanged
