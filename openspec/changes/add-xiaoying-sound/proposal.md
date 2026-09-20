## Why
小莹目前只有视觉反馈；用户已选定声音并记录降速、柔化与延长尾音的要求，需要可关闭的呼吸、互动与音乐反馈。Refs #55。

## What Changes
- 接入用户选定且许可核实的音效，以现有情绪驱动，添加冷却和单声部限制。
- 默认静音，主动开启；音量与背景音乐独立控制，后台暂停，资源失败允许重试。
- 呼噜与鳞片降速柔化，小语言增加衰减尾音；记录原始来源、许可和处理方式。
- 背景音乐使用指定曲目；若无法获取，明确待补，不以其他曲目代替。

## Capabilities
### New Capabilities
- `creature-audio`: 音效、音乐控制与互动状态映射。
### Modified Capabilities
无。

## Impact
app/page.tsx、声音控制组件、lib 音频引擎、public/audio、测试、PRD、THIRD_PARTY_NOTICES。无新增云端数据、麦克风访问或成长规则变更。
