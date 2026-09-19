# 碎光本地深度测试台

关联 Issue #25。独立本地工具，不改变线上碎光。面向 Gemini 335 + Apple Silicon Mac，读取 Orbbec SDK 的 Y16 深度及内参，用 SDK 深度比例转毫米，拟合平面法向距离。

无视觉背景先读 [`docs/gemini-335.md`](../../docs/gemini-335.md)。现场对照表：[`docs/evidence/depth-lab/field-log.md`](../../docs/evidence/depth-lab/field-log.md)。先用 Orbbec Viewer 确认 Color / IR / Depth，再进本页校准；模拟模式和单测不能当作墙面验收。

## 启动

完成下方虚拟环境安装后，双击 `启动深度测试.command`，或在本目录运行 `.venv/bin/python server.py`，打开 http://127.0.0.1:8765 。终端 Ctrl+C 停止服务；网页“断开”停止采集。

其他 Mac 使用 Python 3.12 ARM64：

```sh
python3.12 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

若 PyPI 无对应 Mac wheel，使用[官方 v2.1.2 发布页](https://github.com/orbbec/pyorbbecsdk/releases/tag/v2.1.2) 的 cp312、macosx_13_0_arm64 wheel。使用虚拟环境，不升级固件或更改系统安全设置。

## 实测步骤

先完成 [Orbbec Viewer 三路检查](../../docs/evidence/depth-lab/README.md)，再进入本工具。

1. USB 3 连接相机，关闭其他占用设备的软件；点击连接。无设备时显示错误，不自动切换模拟。
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
- 无保存、上传、录像。只监听 127.0.0.1，限制 Host 和写入 Origin，不提供跨域访问。

## 测试

本目录执行 `.venv/bin/python -m unittest -v test_detector.py`。覆盖倾斜平面、生命周期、迟滞、去抖、噪声、空洞、零星像素、无效校准及重置。模拟模式只验证软件流程，不代表硬件实测。

产品影响：无线上行为变化，既有 PRD 未改；本工具是后续墙面输入的实验原型。

## 当前验证记录

2026-09-15：Mac ARM64 已成功导入官方 SDK，设备枚举为 0。9 项几何算法测试通过。真实深度流已在用户 Mac 上读取（当次帧龄 8 ms），当时未校准。

2026-09-18：补充学习路径和对照表。Windows 开发会话未检测到 Gemini 335，也没有 Orbbec Viewer。几何单测 9 项通过；模拟模式校准后 `away`（噪声 2.0 mm），80 mm → `near`，12 mm → `contact_candidate`，离开 → `away`。空平面校准、触碰精度、遮挡和投影仍待 Mac 现场填写对照表 A–C。#25 保持打开。

## macOS USB 拒绝访问（uvc_open -3）

2026-09-15 设备已以 USB 3 识别，但普通启动（包括用户终端）无法打开接口。若出现此错误，可双击 `启动相机权限测试.command`，在系统终端内输入 Mac 管理员密码。脚本只提升 `camera_capture.py` 相机读取进程；通过匿名管道把深度帧交给普通权限的网页服务（127.0.0.1:8767）。不修改系统长期权限、不执行固件更新，不在聊天中索要密码。关闭启动窗口或 Ctrl+C 结束会话。

该脚本需要用户本机密码。2026-09-15 已在用户 Mac 上确认真实深度流连接并持续返回画面（当次检查帧龄 8 ms），当时状态仍为未校准；平面校准、物理触碰精度和投影尚未完成真实验收。匿名管道已用合成数据验证，断流会清空画面并显示错误。官方参考：https://orbbec.github.io/pyorbbecsdk/source/7_FAQ/FAQ.html#permission-denied-on-macos 。
