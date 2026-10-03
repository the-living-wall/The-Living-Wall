# Creature voice resource validation

## ADDED Requirements

### Requirement: Authorized derived assets only
The project MUST provide a deterministic import path that rejects raw or unrecognized voice assets.

#### Scenario: Valid selected assets
- **WHEN** the importer receives named 48 kHz mono PCM 16-bit WAV variants for the eight captured phonemes
- **THEN** it copies only those files and writes a manifest of the imported assets

#### Scenario: Invalid or raw asset
- **WHEN** the importer receives an unknown filename or a WAV with another channel count, rate, encoding, or bit depth
- **THEN** it reports an error and does not copy that asset

### Requirement: AR remains usable without audio
The host app MUST document camera/microphone permissions and preserve AR interaction when audio is unavailable.

#### Scenario: Permission denied or engine failure
- **WHEN** microphone permission is denied or local audio initialization fails
- **THEN** the AR scene remains interactive and the voice engine becomes silent without crashing
