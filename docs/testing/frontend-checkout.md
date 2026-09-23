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

已有 main 且工作区干净时：`git pull --ff-only`，再运行 `npm ci`。有本地修改或使用其他分支时先保留自己的工作，不直接覆盖。PR #51 合并前仍使用 `livehighhigh/50-main-depth-input` 分支。

## 2. 深度相机联调（可选）

本分支已包含与前端协议匹配的 `pixel-wall-v2` 服务源码，不依赖原作者 Downloads 或 `.runtime`。目前硬件实测平台为 Apple Silicon Mac + Gemini 335；其他系统的 SDK/USB 权限兼容性尚未验证，普通前端测试不受此限制。

在项目根目录另开一个终端，使用 Python 3.12 ARM64：

```sh
cd tools/depth-lab
python3.12 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python server.py --port 8769
```

若 SDK 安装失败，参照本目录 README 的官方 wheel 说明，不复制别人的虚拟环境。打开 http://127.0.0.1:8769/，连接相机。若 macOS 报 `uvc_open -3`，先 Ctrl+C 停止服务，再执行：

```sh
zsh 启动相机权限测试.command
```

此脚本只提升 USB 采集进程权限，网页服务仍以普通用户运行。管理员密码只在自己系统终端输入，不发给别人。无需用管理员权限运行 npm 或整个前端。

固定相机，清空墙面及手部遮挡，框选区域并校准 30 帧。校准有效后回到前端，点击“启用深度实验”。绿色空心圆是最大近墙区域中心，不是手背识别结果。移动手观察方向，按需调整镜像；移开手、断流、重新校准应停止输入。相机位置变化后重新校准。

相机和前端服务须在同一台电脑运行；`127.0.0.1` 不是远程访问地址。模拟数据会被前端拒绝，不用于伪装硬件测试成功。

低延迟实验（#89）：合并前在独立副本检出 `livehighhigh/89-depth-latency`，合并后使用 main；网页、采集脚本、`frame_stream.py` 与服务必须来自同一提交。停止旧程序后重新启动并校准，不混用新旧管道协议。启用深度实验后可展开“输入诊断”，记录 60 秒并导出数值。协议错误须更新完整启动链路。预览最多 10Hz，原始绿色圆圈独立更新；不要把预览或光团缓动计为取点速度。现场报告的 Gemini 355 与旧记录 335 尚待 SDK 枚举核实。

电脑屏幕、有线 O3 投影与 AirPlay 的测试顺序、目标、数值记录和完整回退版本见[延迟验证记录](../evidence/depth-latency/README.md)。有线物理响应目标仍待现场验收，本版本不自动发布生产。

## 3. 检查与反馈

```sh
npm test
npm run typecheck
npm run lint
npm run build
cd tools/depth-lab
.venv/bin/python -m unittest discover -v -p 'test_*.py'
node --test test_guide.mjs
```

反馈请带上 `git rev-parse --short HEAD`、系统/浏览器、输入模式、操作步骤、预期与实际表现，以及是否稳定复现。深度测试补充相机/投影方式、校准结果、距离和延迟体感；有条件可录到手与投影同框，但避免可识别个人信息。录像不是必需。

尚未解决：反应体感偏慢、有效区域不直观、精确投影映射及完整现场验收。已有观察见 `docs/evidence/depth-input/2026-09-19-live-test.md`，不要将近墙反应当作真实物理触碰或毫米级精度证明。

用户已确认常规方向跟随、移开手清除和退出深度模式正常；镜像开关及专门断流清除的现场验收按用户决定延期，不阻塞本次本地实验交付，但未标为通过。剩余验收继续在 Issue #50 跟踪。
