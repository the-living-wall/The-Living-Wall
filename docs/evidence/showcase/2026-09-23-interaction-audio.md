# Showcase 互动与声音验证

Refs #93。基线 main `38b680e`，任务分支 `3013038780-design/93-showcase-interaction`。本记录不代表生产发布。

## 已运行

- `npm test`：67/67 通过。
- `npm run typecheck`、`npm run lint`、`npm run build`、`npm run build:tencent`：通过。
- `npm run spec:validate`：8 项通过。既有 add-xiaoying-sound 的归档提示与本任务无关。
- `node scripts/showcase-browser-qa.mjs`：本地 3018 预览；1440×1000 桌面与 390×844 Chromium 移动触摸模拟。预设、三个滑块、播放/暂停/重置、鼠标/触摸触发状态改变、音频开启/关闭/重开、资源成功响应、无页面异常、无横向溢出通过。
- 两个成长存档键放置哨兵值，演示操作后均原样保留。
- 截图人工查看：现有黑底淡绿调性保留，声音按钮位于面板内，手机端不遮挡控件。截图在本地忽略目录 `outputs/showcase-qa/`。

## 修复过程与限制

首次 lint 检出 render 读取 ref 和 status 标签语义问题，已修正；新增 QA 脚本的数组字符串插值 lint 问题也已修正。首次浏览器连接 127.0.0.1 被拒绝，实际开发服务器监听 localhost，改用 localhost 后验证通过。

模拟与资源检查不能代替听感验收；尚需用户确认实际音量与互动感，iOS Safari/Android 真机、自动播放拒绝提示与后台切换仍需实际设备验收。复用共享声音组件，不声称本次重测了其所有生命周期。没有合并 main 或部署腾讯云。
