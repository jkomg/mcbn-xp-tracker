## Purpose

Each act of blanking returns on its own night. Blanking dots again never changes
when dots already blanked come back.

## ADDED Requirements

### Requirement: Each blank returns on its own night
The system SHALL record each act of blanking separately, with its own releasing
night, and SHALL return each one independently.

#### Scenario: Two blanks taken in different nights
- **WHEN** a player blanks dots in one night and blanks more of the same background in a later night, before the first lot has returned
- **THEN** each lot returns on the night its own blanking scheduled, and neither changes the other's night

#### Scenario: The earlier blank returns first
- **WHEN** the earlier blank's releasing night arrives while the later blank is still outstanding
- **THEN** only the earlier lot's dots are returned, and the later lot stays blanked with its night unchanged

#### Scenario: Blanking again does not reschedule an outstanding blank
- **WHEN** a player blanks more dots while an earlier blank is outstanding
- **THEN** the earlier blank's releasing night is unchanged, neither brought forward nor pushed out

#### Scenario: Two blanks due on the same night
- **WHEN** two outstanding blanks both release on the same night and that night starts
- **THEN** both are returned

### Requirement: A donated background's blanks behave like any other
The system SHALL treat blanks on a donated background exactly as it treats a
character's own, each returning on its own night.

#### Scenario: A coterie blanks a donated background
- **WHEN** a member blanks dots of a background donated to their coterie
- **THEN** a lot is recorded with its own releasing night, and it returns on that night like any other

#### Scenario: A donation ends with blanks outstanding
- **WHEN** a donated background is undonated, or its donor is removed from the coterie
- **THEN** its outstanding lots are discarded and the background returns to its owner at full rating

### Requirement: Reducing a background's rating reduces its outstanding blanks
The system SHALL keep outstanding blanks within a background's rating when that
rating is lowered, taking dots from the most recently blanked lot first so the
earliest promised return is preserved.

#### Scenario: Rating lowered below what is blanked
- **WHEN** a background's rating is reduced below the total of its outstanding blanks
- **THEN** outstanding lots are reduced, newest first, until they fit within the new rating

#### Scenario: Rating lowered but still above what is blanked
- **WHEN** a background's rating is reduced but still covers every outstanding blank
- **THEN** no outstanding lot changes

### Requirement: Blanking is still bounded by what is available
The system SHALL refuse to blank more dots than the background has unblanked,
counting every outstanding blank.

#### Scenario: Blanking more than remains
- **WHEN** a player blanks dots that, added to every outstanding blank, would exceed the background's rating
- **THEN** the system rejects it and no blank is recorded

### Requirement: The calendar gate applies per blank
The system SHALL release a blank only once that blank's own releasing night has
started according to the game calendar.

#### Scenario: One blank due, another not yet
- **WHEN** one outstanding blank's releasing night has started and another's has not
- **THEN** only the first is returned

#### Scenario: A releasing night absent from the calendar
- **WHEN** an outstanding blank names a releasing night the calendar has no entry for
- **THEN** that blank is held rather than released or discarded, and remains visible to staff

### Requirement: A background reports every pending release
The system SHALL show, for a background with dots blanked, how many dots are
blanked in total and when each lot returns.

#### Scenario: A background with two pending releases
- **WHEN** a player views a background with two outstanding blanks returning on different nights
- **THEN** both the total blanked and each lot's releasing night are shown

#### Scenario: A background with nothing blanked
- **WHEN** a background has no outstanding blanks
- **THEN** it shows its full rating as available and no pending release
