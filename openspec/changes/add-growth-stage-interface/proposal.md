# 成长阶段基础接口

## Why

当前 `maturity` 已经由有效抚摸累计，但页面、视觉和声音还没有共同的阶段接口。后续模块如果各自解释百分比，会产生不同的临界值和行为。

## What Changes

- 在 `lib/creature.ts` 定义五个永久成长阶段及统一临界值。
- 提供阶段信息和到下一阶段进度的纯函数。
- 保持现有 `care / 1800`、每日上限、休息、受惊和旧版 `Growth` 存档规则不变。
- 为阶段边界、阶段不倒退和旧存档恢复增加测试。

## Non-goals

- 本变更不修改颜色、碎片形态、声音素材或用户界面。
- 本变更不升级 localStorage 存档版本。
- 本变更不改变成长速度或任何现有触摸判定。

## Impact

涉及 `lib/creature.ts`、`tests/creature.test.ts`、`tests/creature-archive.test.ts` 和 PRD 状态说明。后续视觉、声音和 UI 变更统一读取本变更提供的阶段接口。
