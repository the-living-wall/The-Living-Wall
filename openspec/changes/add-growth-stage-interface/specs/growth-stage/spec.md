# Growth stage interface

## ADDED Requirements

### Requirement: maturity maps to one shared stage
系统 SHALL 使用 `care / 1800` 的成熟度和统一阈值，将成熟度映射到五个成长阶段：S0 `<0.15`、S1 `0.15–<0.35`、S2 `0.35–<0.65`、S3 `0.65–<0.85`、S4 `>=0.85`。

#### Scenario: exact boundaries
- **WHEN** maturity is exactly `0.15`, `0.35`, `0.65`, or `0.85`
- **THEN** the result is respectively S1, S2, S3, or S4

#### Scenario: maturity is clamped
- **WHEN** a caller supplies a value below 0 or above 1
- **THEN** the stage function treats it as 0 or 1

### Requirement: stage information is shared
系统 SHALL 为每个阶段提供稳定的名称、成熟度范围和中文描述，供后续 UI、视觉和声音模块读取。

#### Scenario: metadata lookup
- **WHEN** a consumer requests any valid stage
- **THEN** the system returns its name, maturity range, and Chinese description

### Requirement: legacy growth remains compatible
系统 SHALL 继续读取 version 1 的 Growth 存档，并根据 care 推导阶段，不改变已有 care、affection、dailyCare 或 day。

#### Scenario: restore version one archive
- **WHEN** a version one archive with `care = 630` is restored
- **THEN** the creature keeps all archive values and derives stage S2

### Requirement: stage does not regress
阶段函数 SHALL 只依赖长期 care/maturity，不读取 alarm、fatigue、resting、trust 或当前 phase。

#### Scenario: transient state does not change stage
- **WHEN** a creature at S2 becomes alarmed, fatigued, or resting
- **THEN** its derived growth stage remains S2
