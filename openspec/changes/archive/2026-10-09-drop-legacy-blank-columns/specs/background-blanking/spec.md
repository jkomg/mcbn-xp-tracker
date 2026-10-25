## Purpose

Blank state is stored in exactly one place.

## ADDED Requirements

### Requirement: Blank state has a single stored representation
The system SHALL store blanked dots only as individual blanks, and SHALL NOT keep
a per-background copy of how many dots are blanked or when they return.

#### Scenario: Inspecting a background's stored data
- **WHEN** a background with outstanding blanks is read directly from the database
- **THEN** its blanked dots and release nights are found only among its individual blanks, with no per-background column that could disagree with them
