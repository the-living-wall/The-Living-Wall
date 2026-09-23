# 跨设备朋友互动 · 本地与 CloudBase 适配验证

Refs #88，依赖 #76 / PR #77。2026-09-23 新建留档，不覆盖共同塑造旧证据。

## 当前进度入口

后续云端部署、真机反馈与剩余验收以 [待验收清单与发布准备](PENDING-ACCEPTANCE.md) 为准；下文保留初始本地验证时的历史状态。

## 结果与边界

- `npm test`：95/95，通过。其中 CloudBase 适配为 5 项本地契约测试，使用事务测试替身；不是真实腾讯云数据库测试。
- `npm run typecheck`、`npm run lint`、`npm run build`、`npm run build:gifts`、`npm run build:gifts:cloud`：通过。云函数包入口可本地加载，未请求腾讯云。
- `npm run spec:validate`：9 项通过；工具同时提示另一个既存 `creature-audio` 增量存在归档约束，本次未归档或更改它。
- 三个场景的两个独立浏览器上下文：安静陪伴→沉静、轻松打趣→俏皮、共同约定→只保留纪念且原样，通过；页面异常为空。没有把约定记录解释成线下完成。
- 电脑宽度 1280、窄屏宽度 390；检查窄屏无横向溢出，保留声音入口。安静场景额外验证断网保留输入、重试只写一条、SQLite 后台重启和双方刷新恢复；三个场景都验证发送者删除后接收者不可读。

## 证据

`cloudbase-local/results.json` 为浏览器运行原始报告，明确记录基座 HEAD 与当时未提交状态；`tested-files.json` 记录受测实现文件散列。报告不是干净 HEAD 上的云端验收。检查输出保存为对应日志，三场景截图各有 desktop/mobile 文件。

浏览器过程 trace 位于本工作区 `outputs/cross-device-qa/cloudbase-adapter-local/{0,1,2}/{sender,friend}-trace.zip`，仅合成测试数据，未提交大型 trace。可用 Playwright trace viewer 打开。重跑方法：先 `npm run build:gifts`，再执行 `QA_OUTPUT=outputs/cross-device-qa/<新的版本目录> node prototypes/live-gift/qa-cross-device.mjs`。不要覆盖旧输出目录。

初次完整测试的两项 HTTP 用例曾因沙箱禁止监听端口报 EPERM；取得本机监听权限后95项通过。初次 lint 发现 CommonJS 平台入口和未显式处理测试 Promise，已做局部修正并重新通过。构建产物未部署，不能以本记录证明公网可用。

## 尚未验收

CloudBase 实际集合规则、后台运行角色、事务返回、HTTP 网关路径/同源配置、定时清理一分钟目标、平台备份保留、费用/限额设置、函数实例切换，以及两台真实设备公网收发。审美与真机体验继续由用户验收。PR 保持 Draft，不改生产首页、不关闭 Issue。
