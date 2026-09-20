# 主前端深度输入

## Why

Gemini 335 深度流已经能驱动独立 entity 演示，但用户需要在原版碎光画面上测试。主前端目前只有鼠标和 RGB 手掌输入，无法进行这一联调。

## What Changes

- 本地开发主页面增加主动开启的深度测试模式，复用原版 Creature 与 CreatureRenderer。
- 读取有效真实相机的最大近墙区域，映射位置并提供镜像选项；显示实验输入位置和状态，便于观察。
- 数据过期、断流、重新校准或没有区域时清除输入；鼠标、RGB 和深度输入互斥。
- 近墙区域可用于原版互动实验，但不得被宣称为真实手掌或物理触摸。实验使用独立成长存档，避免污染日常存档。
- 校准仍由现有深度测试台负责；页面提供入口及校准状态说明。
- 同伴可从单个任务分支拉取并重建环境：纳入现场使用的 pixel-wall-v2 服务子集、对应测试和启动说明，不提交虚拟环境或 SDK 二进制。

## Capabilities

### New Capabilities
- `main-depth-input`: 主前端本地深度实验输入与原版视觉联调。

### Modified Capabilities
无。

## Impact

涉及 app/page.tsx、新输入组件与纯数据适配函数、Vite 本地开发代理、测试和 PRD 的 IN-03/HW-01 状态说明。不改变相机采集进程，不添加公开深度接口，不发布生产环境。

依赖现有 Issue #25 的相机服务；#25 原范围仅为独立测试台，本变更实施前需查重并关联独立 Issue。已关联 [Issue #50](https://github.com/the-living-wall/The-Living-Wall/issues/50)，从最新 main 的独立任务分支实施。
