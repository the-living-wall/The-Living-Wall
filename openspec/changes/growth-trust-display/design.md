# Design

## Decisions

- `maturity` 是长期、单调、可存档的成长；`affection` 是长期亲密关系；`trust` 是当前回应状态，主要在本轮互动中波动。
- 首页信任表达使用“当前回应”短句，不暴露原始百分比，避免把陪伴变成刷分。
- 信任阈值沿用现有行为模型：`<0.2` 小心试探，`0.2–0.45` 还在观察，`>0.45 且 <0.7` 愿意靠近，`≥0.7` 安心相伴。
- `startle`、`recover`、`resting`、`alone`、`search` 等即时边界优先于高信任文案，避免受惊时仍显示安心。
- Showcase 保留数值控制；正式首页只展示体验性反馈。

## Compatibility

不改变现有 localStorage key、archive 字段、成长累计速度、每日上限、声音触发和阶段视觉参数。
