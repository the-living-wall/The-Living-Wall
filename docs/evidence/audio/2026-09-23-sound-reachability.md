# #61 本地声音可达性验证 · 2026-09-23

范围：本地分支 livehighhigh/61-sound-reachability，基于本地声音实验 7faf764；未发布、未推 main。后续 PR 前须同步最新 main 并重跑，不可将此记录当线上版本证明。

## 已执行

- Node 22.13.0；npm test：65/65 通过。
- npm run typecheck、npm run lint、npm run build：通过。
- openspec validate local-sound-events --strict：通过。工具提示 MODIFIED 的 creature-audio 尚无已归档基础规格；本轮没有归档。
- git diff --check：通过。
- 浏览器运行 tests/fixtures/sound-reachability.html：24 项断言通过。真实 Web Audio 解码和输出，真实 Creature 慢抚输入，合成旋转/位移输入；没有使用真实摄像头。

浏览器测得主输出峰值（统一音量 0.45，非响度 LUFS）：rest 0.026302、curiosity 0.017332、touch 0.006811、voice 0.027914、purr 0.034051、scales 0.006595、roll 0.032471、move 0.005721、startle 0.057961、settle 0.035986；组合动作 0.044192。均非零、未削波；这不证明各音色主观响度一致或好听。

浏览器确认：接触及核心回应可达；真实慢抚达到文字阈值时呼噜同步出现；转动、快速旋转及位移分别触发 scales/roll/move，身体声不打断呼噜；受惊清除其他通道；真实无人 Creature 独处约 10 秒出现呼吸；停止清除所有通道；呼噜按钮试听有限时长。

## 统一输入对比

使用当前同一 Creature，分别载入 git 中四版 SoundDirector；输入为独处 12 秒、慢抚 13 秒、绕身体移动 5 秒、一次快速近身运动后离开，总计 45 秒。此项是调度逻辑对比，未模拟真实播放忙碌，不等于重放四个历史网站。

| 调度版本 | 享受文字首次出现 | 享受声音首次事件 | 受惊次数 |
| --- | --- | --- | --- |
| 1030a02 | 14.42 秒 | 19.52 秒 | 1 |
| 745f4e5 | 14.42 秒 | 17.50 秒 | 1 |
| 7faf764 | 14.42 秒 | 17.50 秒 | 1 |
| 本轮本地 | 14.42 秒 | 14.42 秒 | 1 |

本轮独处 10 秒触发呼吸，30 秒受惊，30.18 秒真实后退触发移动声。没有改受惊行为阈值。初始无人朝向变化不触发鳞片，新增真实 Creature 测试覆盖此情况。

## 素材

- scales.mp3 SHA256：90599667dc704b7910eb552e0cf2703dfad2ec1c8c9bcf027df2951149867ac4，与 1030a02、745f4e5 相同。
- move.mp3 SHA256：74d22d520cc1d0c5e6ded552bfb21773ce95453d60425b804d61dd66b9a9a6d2，与 e60e4ba 的已选 whoosh 相同，播放前 1 秒。
- 未删除原 scales.wav，但播放引擎不再加载它。

## 待完成

用户在 localhost:3018 试听整体体验，尤其旧鳞片、旋转与呼噜的混音。通过后再按组织流程同步 main、提交 PR、验证 CI；当前没有合并、部署或关闭 Issue。手机与投影现场不在本次验收范围。
