## Purpose

Blanked background dots return at the opening of the first night after the next
downtime — the rule the game calendar already documents — rather than as soon as
staff open that night's period for submissions. Staff can see every outstanding
blank across the roster.

## ADDED Requirements

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
