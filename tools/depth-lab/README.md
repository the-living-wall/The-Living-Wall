# 碎光本地深度测试台

## 主前端联调（2026-09-20 更新）

同伴请先阅读[拉取、环境安装与前端测试](../../docs/testing/frontend-checkout.md)。本目录已纳入现场使用的 `pixel-wall-v2` 服务及测试，来源见 [SOURCE.md](SOURCE.md)，无需 `.runtime` 或旧下载文件夹。权限测试脚本现在统一使用 **8769** 端口；下方 2026-09-15 的 8767 为历史记录。

当前算法采用逐像素空墙背景，输出全部前景与近墙区域，主前端选取最大近墙区域。固定中心测量区的距离诊断与互动区域分开，不代表指尖测量；尚无手部语义与精确投影映射。下方原型记录保留历史背景，以本节及测试指南为当前联调入口。

软件测试：`.venv/bin/python -m unittest -v test_detector test_server test_metrology`，以及 `node --test test_guide.mjs`。无需连接相机；合成测试不替代现场验收。

关联 Issue #25、#49。独立本地工具，不改变线上碎光。面向 Gemini 335 + Apple Silicon Mac，读取 Orbbec SDK 的 Y16 深度及内参，用 SDK 深度比例转毫米，拟合平面法向距离。

## Windows 启动（待目标平台验收）

面向 Windows 10 x64，使用 **Python 3.12 x64**（安装时保留 Python launcher）。依赖固定在 `requirements.txt`；当前 SDK 2.1.2 提供 [CPython 3.12 Windows x64 wheel](https://pypi.org/project/pyorbbecsdk2/2.1.2/#files)。

1. 按 [Orbbec 官方安装指南](https://orbbec.github.io/pyorbbecsdk/source/2_installation/install_the_package.html)准备设备环境；如出现 DLL 加载错误，检查 [Microsoft VC++ x64 运行库](https://learn.microsoft.com/cpp/windows/latest-supported-vc-redist)。
2. 双击本目录 `安装环境.bat`，等待显示 Ready。脚本只安装到本目录 `.venv`，不会自动安装驱动、提权或删除旧环境。已从 Mac 复制的 `.venv` 不能复用；如脚本提示不兼容，先手动移走旧 `.venv` 再重试。
3. 用 USB 3 数据线直连 Gemini 335。可先用官方 Viewer 检查深度流；**关闭 Viewer 后**再启动测试台，避免占用相机。
4. 双击 `启动深度测试.bat`，自动打开 http://127.0.0.1:8765 。在网页点「连接 Gemini 335」；无设备或 SDK 错误会显示中文提示，不会自动切入模拟模式。
5. 没有相机时，主动选择「模拟模式」测试校准流程。它不构成真实深度流或墙面触碰验收。

与主前端实验联调时，在命令提示符执行 `启动深度测试.bat --port 8769`。Ctrl+C 停止服务。

手动安装与启动的等价命令（本目录执行）：

```bat
py -3.12 -m venv .venv
.venv\Scripts\python -m pip install --only-binary=:all: -r requirements.txt
.venv\Scripts\python server.py --open
```

Windows 直接在服务进程中读相机；`--capture-stdin` 与两个 `.command` 文件只用于 macOS。不要在 Windows 使用管理员管道。安装脚本的 `--no-pause` 参数仅省略结束时按键等待，供自动验证使用。

## macOS 启动

完成下方虚拟环境安装后，双击 `启动深度测试.command`，或在本目录运行 `.venv/bin/python server.py`，打开 http://127.0.0.1:8765 。终端 Ctrl+C 停止服务；网页“断开”停止采集。与主前端深度实验联调时改用 `.venv/bin/python server.py --port 8769`，对应 http://127.0.0.1:8769/ 。

其他 Mac 使用 Python 3.12 ARM64：

```sh
python3.12 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

若 PyPI 无对应 Mac wheel，使用[官方 v2.1.2 发布页](https://github.com/orbbec/pyorbbecsdk/releases/tag/v2.1.2) 的 cp312、macosx_13_0_arm64 wheel。使用虚拟环境，不升级固件或更改系统安全设置。

## 实测步骤

1. USB 3 连接相机，关闭 Orbbec Viewer 和其他占用设备的软件；点击连接。无设备时显示错误，不自动切换模拟。
2. 固定相机，朝向真实空平面，拖动框选；可以用墙或硬板，不要触摸电脑显示器。
3. 移开手，点击校准，采集 30 帧；检查覆盖率、时间稳定度、拟合残差和角度。
4. 伸入单个物体慢慢靠近平面，观察最大前景区域中心和间距。
5. 移动相机或表面必须重新校准。仅内存保存，不跨启动复用。平面大幅变化/遮挡提示未知，但不能检测所有移动，尤其沿平面平移。

## 算法边界

- 最大连通前景区域，不含手部语义、多手 ID 或指尖追踪。
- 间距取区域法向距离的 20% 分位数，不是指尖精确间距。
- 默认 15 mm 是接触候选阈值（可调 8–40 mm），释放迟滞 +5 mm，去抖 150 ms；不是精度承诺。
- 低于噪声下限的区域与平面融合，贴平的手可能消失，边缘/其他物体可能产生候选。因此不能证明物理触碰；后续需 RGB 手部跟踪和真实采样验证。
- 深度缺失/超时显示未知，不沿用接触坐标；失联重新连接并校准。
- 未完成投影映射或接入线上碎光。`/api/state` 的位置是归一化深度画面坐标，不是投影坐标。
- 引导测试可在浏览器下载数值报告，不保存图像或录像、不上传。刷新页面会丢失未下载报告。只监听 127.0.0.1，限制 Host 和写入 Origin，不提供跨域访问。

## 测试

本目录执行 `.venv/bin/python -m unittest -v test_detector test_server test_metrology`（Windows 用 `.venv\Scripts\python` 替代解释器路径）。覆盖倾斜平面、生命周期、迟滞、去抖、噪声、空洞、零星像素、无效校准及重置。模拟模式只验证软件流程，不代表硬件实测。

产品影响：只补本地工具的 Windows 启动与错误提示，无线上行为变化，既有 PRD 未改；本工具是后续墙面输入的实验原型。

## 当前验证记录

2026-09-15：Mac ARM64 已成功导入官方 SDK，设备枚举为 0。9 项几何算法测试通过。真实深度流、物理触碰精度、遮挡和投影尚待设备连接后验收。

## macOS USB 拒绝访问（uvc_open -3）

2026-09-15 设备已以 USB 3 识别，但普通启动（包括用户终端）无法打开接口。若出现此错误，可双击 `启动相机权限测试.command`，在系统终端内输入 Mac 管理员密码。脚本只提升 `camera_capture.py` 相机读取进程；通过匿名管道把深度帧交给普通权限的网页服务（127.0.0.1:8767）。不修改系统长期权限、不执行固件更新，不在聊天中索要密码。关闭启动窗口或 Ctrl+C 结束会话。

该脚本需要用户本机密码。2026-09-15 已在用户 Mac 上确认真实深度流连接并持续返回画面（当次检查帧龄 8 ms），当时状态仍为未校准；平面校准、物理触碰精度和投影尚未完成真实验收。匿名管道已用合成数据验证，断流会清空画面并显示错误。官方参考：https://orbbec.github.io/pyorbbecsdk/source/7_FAQ/FAQ.html#permission-denied-on-macos 。

## #49 验收清单

- [ ] Windows 10 x64：首次安装成功；从含空格的目录双击启动并打开本机网页。
- [ ] Windows：模拟模式可完成空平面校准；无设备连接显示中文错误，不切模拟。
- [ ] Windows + Gemini 335：真实深度画面（无相机则记录未测）。
- [ ] macOS：原有普通启动与权限管道现场回归。

脚本与单测不代替以上目标平台及设备验收。合并与验收分开记录，Issue #49 完整验收前保持开放。

2026-09-22 本地验证（Mac，#49 恢复分支）：31 项 Python 测试通过，含 Windows 平台错误分支（模拟平台）、无设备不降级、禁止 Windows 管道及显式模拟校准/停止；应用 66 项测试、typecheck、lint、build、3 项引导测试通过。Python 仍有既有 NumPy 数值警告。首次协议测试因 PATH 未包含 Node 失败，指定已安装 Node 24 后重跑通过。新增 Windows CI 运行安装脚本及无相机软件测试，其运行结果以 PR 为准；不能替代 Windows 10 双击启动、真实设备与真人体验验收。
