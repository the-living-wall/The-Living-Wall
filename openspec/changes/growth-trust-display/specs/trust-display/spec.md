# Trust display

## ADDED Requirements

### Requirement: homepage shows a non-numeric current response

The homepage MUST show a short current-response phrase in the existing status area and MUST NOT add a trust percentage meter.

#### Scenario: first encounter
- **WHEN** the creature is alone or cautiously observing
- **THEN** the response phrase indicates a gentle boundary such as “等一次温柔的相遇” or “小心试探”.

#### Scenario: trust increases
- **WHEN** the current trust crosses a display boundary during approach or bonding
- **THEN** the phrase changes to “还在观察”, “愿意靠近”, or “安心相伴” without changing growth or affection.

#### Scenario: immediate boundary overrides trust
- **WHEN** the creature is startled, recovering, resting, alone, or searching
- **THEN** the phrase describes that immediate state instead of claiming stable reassurance.

### Requirement: growth specification remains explicit about implementation status

The repository MUST distinguish documented design from implemented behavior for growth, affection, trust, and stage-dependent audio.

#### Scenario: reader reviews the growth plan
- **WHEN** a contributor reads the unified growth specification
- **THEN** the file states the current thresholds and persistence rules and labels future audio expression as planned rather than complete.
