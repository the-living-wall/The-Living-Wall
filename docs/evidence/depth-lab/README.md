# Gemini 335 现场证据 · #25

独立本地测试台，不改变线上碎光。自动化几何测试通过 ≠ 墙面验收。屏幕原型不能代替物理触摸。

填写 [field-log.md](field-log.md)。不要提交原始深度帧、录像或可识别个人的画面。

## 0. 本机限制

深度测试台按 Apple Silicon Mac + USB 3 编写。Windows 开发机可以跑 `test_detector.py` 和网页模拟模式，不能替代 Mac 现场记录。

## 1. Orbbec Viewer

下载与说明：[Orbbec SDK v2](https://orbbec.github.io/OrbbecSDK_v2/)、[Viewer 教程](https://orbbec.github.io/OrbbecSDK_v2/docs/tutorial/orbbecviewer.html)（Gemini 330 系列示例）。macOS 用 M 系列包。

1. 关闭占用相机的软件。USB 3 直连 Gemini 335，不要经过无供电的 Hub。
2. 相机距真墙或硬板约 0.5–2 m，固定支架。不要对准电脑显示器。
3. 打开 Viewer，确认设备名含 335。记录固件版本；不要为这次验收升级固件。
4. 勾选并启动 **Color、IR、Depth** 三路。Depth 上墙应是连续伪彩色，不是大片黑。
5. 高级模式可打开硬件 D2C，确认彩色和深度能叠上。本轮测试台还不读 RGB。
6. 预设可用 Default 或 Hand。墙面首版不需要 IMU、点云导出或多机同步。

通过：三路都有稳定画面，墙在最佳距离内，Depth 没有整墙黑洞。失败则先修连接，不要进入校准。

## 2. depth-lab

按 [`tools/depth-lab/README.md`](../../../tools/depth-lab/README.md)。若 `uvc_open -3`，用 `启动相机权限测试.command`。

1. 连接后出现深度画面。无设备必须报错，不得自动跳模拟。
2. 框选空平面，移开手，校准 30 帧。记录能否校准、噪声 mm、失败原因。
3. 单手慢慢靠近、贴墙、离开。记录状态和间距。
4. 移动相机或墙之后必须重新校准。

无相机时：`.venv/bin/python -m unittest -v test_detector.py`，以及网页「模拟模式」。模拟只验证软件流程。

## 3. 对照表

每一项填实际状态，不要事后改成期望值。状态只能是 `away` / `near` / `contact_candidate` / `unknown`。

| 场景 | 期望（供对照，不是填写） |
| --- | --- |
| 空墙 | `away` |
| 手悬空约 5 cm | `near`，有间距读数 |
| 手贴墙 | 常为 `contact_candidate`；贴平可能融进噪声变成 `away` |
| 抬手 | 先 `near` 再 `away`（离开阈值 +5 mm） |
| 第二只手或身体入画 | 可能仍报候选：当前取最大连通域，不识别手 |
| 大面积遮挡 / 拔线 | `unknown`，不沿用旧坐标 |

## 4. 还不能宣称

接触候选不是手，更不是已证明碰到墙。坐标是归一化深度画面坐标，不是投影坐标。#25 在对照表未填真实数据前保持打开。
