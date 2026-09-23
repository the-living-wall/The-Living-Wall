# Proposal

## Why

真实深度跟随比内置摄像头迟缓；主前端每次取点后等待100ms，采集时间和重复帧不可见。Issue #89（关联 #50/#25）先降低输入链路延迟，以有线输出验收，避免用行为参数掩盖输入问题。

## What Changes

- 33ms目标周期、单请求、唯一帧更新与300ms新鲜度保护。
- **BREAKING**：主前端深度实验要求新版轻量 `/api/input` 协议及带采集时间的管道；不回退旧服务。原 `/api/state` 测试台兼容。
- 采集/管道读取/检测解耦，单槽最新帧，预览独立最高10Hz。
- 只保存数值的诊断、优化前后软件对照和现场验收说明。
- 不改变近墙算法、50mm阈值、坐标映射、行为或成长；不生产发布。

## Capabilities

### New Capabilities

- `depth-input-latency`: 深度输入的有界时延、新鲜度与可测量性。

### Modified Capabilities

无已归档主规格修改；延续未归档 main-depth-input 的有效性、隔离和现场限制。

## Impact

M6/M8、PRD IN-03/HW-01/HW-02；Python深度服务/USB读取进程、本地Vite桥接与React输入。无需新增运行依赖。普通输入与生产接口边界保持不变。
