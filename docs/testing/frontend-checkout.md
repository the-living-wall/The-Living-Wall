# 同伴拉取与前端测试

本地实验由 PR #51 交付，合并后使用 main 按下方步骤测试；合并不等于生产发布。不要拷贝他人的 `.venv`、`node_modules` 或 `.runtime`；每台机器按依赖清单新建环境。

## 1. 获取代码与启动前端（不需要深度相机）

安装 Node.js 24 LTS 和 Git，然后在终端执行：

```sh
git clone --branch main https://github.com/the-living-wall/The-Living-Wall.git
cd The-Living-Wall
npm ci
npm run dev -- --port 3018
```

浏览器打开 http://localhost:3018/，可以测试原版画面和鼠标互动。不要通过双击 HTML 或生产预览测试深度入口；深度桥接仅在开发服务中提供。若要测试 RGB 手掌识别，另运行 `npm run setup:assets` 下载模型，允许浏览器相机权限。

已有 main 且工作区干净时：`git pull --ff-only`，再运行 `npm ci`。有本地修改或使用其他分支时先保留自己的工作，不直接覆盖。PR #51 已合并，不需要切回历史功能分支。

## 2. 深度相机联调（可选）

本分支已包含与前端协议匹配的 `pixel-wall-v2` 服务源码，不依赖原作者 Downloads 或 `.runtime`。目前硬件实测平台为 Apple Silicon Mac + Gemini 335；其他系统的 SDK/USB 权限兼容性尚未验证，普通前端测试不受此限制。

连接真实相机和投影仪时，按[Mac 真实硬件启动指南](depth-hardware-startup.md)操作：首次创建 Python 3.12 虚拟环境；日常依次启动前端 3018、深度服务 8769、校准空墙、启用深度实验、检查投影。指南区分普通启动与 USB 权限脚本，也说明移动设备、息屏断流、端口占用和完整重启后的恢复。

已安装成功且仍在同一目录时，不必每天重建环境。只刷新网页不能重启相机进程；相机/墙面位置变化、重新连接或深度服务重启后需重新校准。绿色空心圆是最大近墙区域中心，不是手背识别结果。

相机和前端服务须在同一台电脑运行；`127.0.0.1` 不是远程访问地址。模拟数据会被前端拒绝，不用于伪装硬件测试成功。

## 3. 检查与反馈

```sh
npm test
npm run typecheck
npm run lint
npm run build
cd tools/depth-lab
.venv/bin/python -m unittest -v test_detector test_server test_metrology test_frontend_contract
node --test test_guide.mjs
```

反馈请带上 `git rev-parse --short HEAD`、系统/浏览器、输入模式、操作步骤、预期与实际表现，以及是否稳定复现。深度测试补充相机/投影方式、校准结果、距离和延迟体感；有条件可录到手与投影同框，但避免可识别个人信息。录像不是必需。

尚未解决：反应体感偏慢、有效区域不直观、精确投影映射及完整现场验收。已有观察见 `docs/evidence/depth-input/2026-09-19-live-test.md`，不要将近墙反应当作真实物理触碰或毫米级精度证明。

PR #51 合并时的历史记录（2026-09-20）：用户已确认常规方向跟随、移开手清除和退出深度模式正常；当时镜像开关及专门断流清除按用户决定延期，未标为通过。后续验收结果继续在 Issue #50 与带版本的现场记录中跟踪；本次启动指南更新不新增现场验收结论。
