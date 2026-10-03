# Creature Voice

## ADDED Requirements

### Requirement: Shared phoneme semantics
The project MUST expose the ten stable event names `curiosity`, `invite`, `comfort`, `refuse`, `startle`, `remember`, `sleep`, `play`, `relocate`, and `settle` to Web and iOS integrations.

#### Scenario: Catalog is shared
- **WHEN** an integration requests the voice catalog
- **THEN** it receives the same ten event names and no raw recording data

### Requirement: Bounded variation
The voice layer MUST vary pitch, duration or texture only within a phoneme's declared range, honor cooldowns, and support a deterministic seed for reproduction.

#### Scenario: Seeded gesture
- **WHEN** the same one-to-three phoneme sequence is composed with the same seed
- **THEN** duration, pitch and variant are reproducible and remain within catalog ranges

### Requirement: Local privacy
The first version MUST process creator recordings locally, MUST NOT upload raw recordings, and MUST degrade to silence when audio initialization fails.

#### Scenario: Audio failure
- **WHEN** local audio initialization fails or the user mutes the app
- **THEN** AR interaction continues and no audio is emitted

### Requirement: Spatial prototype
The iOS prototype MUST allow a user to place a Xiaoying anchor on a detected surface and map invitation, movement, tilt, startle and settle events to vocal gestures.

#### Scenario: Surface placement
- **WHEN** the user taps a detected desktop or bedside surface
- **THEN** the prototype creates an anchor and emits a placement event for the interaction layer

### Requirement: Web compatibility
The change MUST NOT replace or alter the existing Web audio playback rules; shared semantics are additive.

#### Scenario: Existing Web behavior
- **WHEN** the current Web audio test suite runs
- **THEN** its existing sound-state and playback behavior remains unchanged
