# Design

## Decisions

- 阶段由 `maturity = clamp(care / 1800)` 唯一决定，阈值为 0.15、0.35、0.65、0.85。
- 阶段是单调的长期成熟度映射；当前受惊、疲倦和安全感不参与阶段计算。
- 阶段信息使用不可变配置，供行为、渲染、声音和 UI 共同读取。
- `getGrowthProgressToNextStage` 在 S4 返回 1；其他阶段返回当前阶段区间内的 0–1 进度。
- 旧版 `Growth.version === 1` 继续按原逻辑读取，阶段从 `care` 即时推导，不写入新字段。

## API

```ts
export type GrowthStage = 0 | 1 | 2 | 3 | 4;
export type GrowthStageInfo = {
  stage: GrowthStage;
  name: string;
  minMaturity: number;
  maxMaturity: number;
  description: string;
};
export function getGrowthStage(maturity: number): GrowthStage;
export function getGrowthStageInfo(stage: GrowthStage): GrowthStageInfo;
export function getGrowthProgressToNextStage(maturity: number): number;
```

## Compatibility

现有 `Growth` 类型、`archive()` 输出、localStorage key 和 `Creature` 的成长计算保持不变。此变更只增加只读派生接口，因此可以先合入，再由后续 UI、视觉和声音变更消费。
