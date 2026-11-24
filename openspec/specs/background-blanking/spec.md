# background-blanking Specification

## Purpose

Blanked background dots return at the opening of the first night after the next
downtime — the rule the game calendar already documents — rather than as soon as
staff open that night's period for submissions. Staff can see every outstanding
blank across the roster.

## Requirements

### Requirement: Blanked dots return only once the releasing night has begun
The system SHALL release a blank only when the night that returns the dots has
actually started according to the game calendar, regardless of whether that
night's play period is already open for submissions.

#### Scenario: Releasing night has not started yet
- **WHEN** a blank is scheduled to release on a night whose play period is open for submissions but whose start date has not yet arrived
- **THEN** the dots remain blanked and no release notification is sent

#### Scenario: Releasing night has started
- **WHEN** a blank is scheduled to release on a night whose start date has arrived
- **THEN** the dots are returned and the player is notified

#### Scenario: Releasing night started while nobody was looking
- **WHEN** the releasing night began before the release check next ran
- **THEN** the dots are returned on that next check rather than being skipped

#### Scenario: A night absent from the calendar
- **WHEN** a blank is scheduled to release on a night the game calendar has no entry for
- **THEN** the system does not release it silently, and the outstanding blank remains visible to staff

### Requirement: Taking a blank is unaffected by the release gate
The system SHALL continue to record a blank against the currently open night for
submissions, independent of calendar dates.

#### Scenario: Player blanks during an open period that has not started
- **WHEN** a player blanks dots while the newest open play period's start date has not yet arrived
- **THEN** the blank is recorded against that night and scheduled to release after the following downtime

### Requirement: The release notification states when the dots are usable
The system SHALL tell the player that the released dots are available now, and
SHALL NOT present a date range that could be read as a future effective date.

#### Scenario: Dots are released
- **WHEN** a release notification is sent for a background
- **THEN** it names the background and dot count and makes clear the dots are available immediately

### Requirement: Staff can see outstanding blanks across the roster
The system SHALL provide staff a view of every background with dots currently
blanked, showing the character, the background, the number of dots blanked, the
night the blank was taken, and the night that returns them.

#### Scenario: Staff review outstanding blanks
- **WHEN** staff open the blanking view
- **THEN** every background with dots currently blanked is listed with its character, dots blanked, night blanked, and releasing night

#### Scenario: A blank is overdue
- **WHEN** a blank's releasing night has started but the dots have not been returned
- **THEN** the view distinguishes that entry from blanks that are not yet due

#### Scenario: Nothing is blanked
- **WHEN** no character has dots blanked
- **THEN** the view says so rather than rendering an empty table

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
counting every outstanding blank, and SHALL enforce that bound even when two
requests arrive at once.

#### Scenario: Blanking more than remains
- **WHEN** a player blanks dots that, added to every outstanding blank, would exceed the background's rating
- **THEN** the system rejects it and no blank is recorded

#### Scenario: Two members blank the last dot at the same time
- **WHEN** two coterie members each blank the final available dot of a donated background concurrently
- **THEN** exactly one succeeds, the other is refused, and the outstanding total never exceeds the background's rating

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

### Requirement: Blank state has a single stored representation
The system SHALL store blanked dots only as individual blanks, and SHALL NOT keep
a per-background copy of how many dots are blanked or when they return.

#### Scenario: Inspecting a background's stored data
- **WHEN** a background with outstanding blanks is read directly from the database
- **THEN** its blanked dots and release nights are found only among its individual blanks, with no per-background column that could disagree with them
