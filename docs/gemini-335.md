# Gemini 335：墙面接触学习路径

关联 [#25](https://github.com/3013038780-design/The-Living-Wall/issues/25)。给没有视觉背景的成员看。不改变线上碎光。

**不要按[亚博 Gemini 335/336 课程](https://www.yahboom.com/study/Gemini335_336/)从 ROS / SLAM 学起。** 那是教育机器人课表。碎光已经用 `pyorbbecsdk` + [`tools/depth-lab`](../tools/depth-lab/README.md)，浏览器里也有 MediaPipe 单手追踪。缺的是墙面平面、接触候选和投影坐标。

规格以 [Orbbec Gemini 335](https://www.orbbec.com/products/stereo-vision-camera/gemini-335/) 为准，不以课程页宣传语为准。

## 和碎光的关系

验收（PRD HW-01）：手沿墙画线，位置跟着走；抬手停止。

```text
Gemini 335 RGB + 深度
        ↓
   硬件 D2C 对齐
    ↓         ↓
墙面平面     RGB 手部关键点
    ↓         ↓
     接触或抬手
          ↓
    投影四点映射
          ↓
  creature.ts 的 x,y + contact
          ↓
       墙上的碎光
```

已有半截：

- [`app/hand-camera.tsx`](../app/hand-camera.tsx)：普通 RGB 摄像头 + MediaPipe，画面重合当抚摸，不是贴墙。
- [`lib/creature.ts`](../lib/creature.ts)：预留 `contact?: boolean`；不传则屏幕模拟；`false` 时能引起注意，不能积累享受或成长。
- [`tools/depth-lab`](../tools/depth-lab/README.md)：只读深度，做空平面校准和接触候选。没有 RGB、手部语义、投影，也没有接到线上碎光。

## 该看 / 跳过

| 该看 | 原因 |
| --- | --- |
| 支架、USB 3 直连 | 现场固定相机 |
| [Orbbec Viewer](https://orbbec.github.io/OrbbecSDK_v2/docs/tutorial/orbbecviewer.html) | 先确认 RGB / IR / Depth 三路 |
| OpenCV：形态学、连通域、透视变换（四点） | 测试台已用；投影校准会用 |
| MediaPipe Hands（21 点） | 浏览器已有；下一步要和深度对齐 |
| Orbbec：D2C、内参、0.26–3 m 最佳距离 | 比亚博课准确 |

跳过：ROS1/ROS2、SLAM、OctoMap、人脸/姿态、KCF、Gazebo、棋盘格自标定、IMU、多相机同步。

相机要点：双目结构光，850 nm 红外，深度 0.10–20 m（墙面互动放在 **0.5–2 m**，落在 0.26–3 m 最佳区间）；深度最高 1280×800@30fps，FOV 约 90°×65°；RGB 最高 1920×1080@30fps，FOV 约 86°×55°；USB 3 Type-C；机内 MX6800 算深度并做硬件 D2C。2 m 处 RMSE ≤ 1.5%（约 ±3 cm），**不能宣传毫米级贴墙精度**。

## 怎么开始

现场步骤和记录表：[现场证据](evidence/depth-lab/README.md)。顺序不要跳。

1. **Orbbec Viewer**：USB 3 直连，确认 Color / IR / Depth 都有画面。深度上墙应是连续色块，不是大片黑。预设可用 Default 或 Hand。不要升级固件，除非 Issue 里另有记录。
2. **depth-lab**：按 [`tools/depth-lab/README.md`](../tools/depth-lab/README.md) 对准真墙或硬板（不要摸显示器），框选空平面，校准 30 帧，单手靠近再离开。
3. **填对照表**：空墙、手悬空约 5 cm、手贴墙、抬手、第二只手或身体入画。状态只允许 `away` / `near` / `contact_candidate` / `unknown`。
4. **看三份代码再写下一张 Issue**：[`detector.py`](../tools/depth-lab/detector.py)、[`camera_capture.py`](../tools/depth-lab/camera_capture.py)、[`lib/creature.ts`](../lib/creature.ts) 的 `contact`。
5. **不要接网站**：先完成 #25 现场记录，再做 RGB+D2C+手部，再做 HW-02 投影四点，最后才接到 `creature.ts`。硬件验收不能用屏幕原型代替。

本机没有相机时，可跑几何单测和网页模拟模式，只验证软件流程。

## 该补的知识

1. 同一时刻有 RGB、IR、Depth。Depth 像素是距离（毫米）。测试台现在只吃 Depth。
2. 内参 `fx, fy, cx, cy` 把像素变成相机前方的三维点。`points()` 已做这件事。
3. 空墙拟合成平面后，看手到墙的法向距离，不是看「离相机多远」。
4. 接触候选默认 15 mm，离开再加 5 mm，持续约 150 ms。贴墙的手可能融进噪声；别的物体也会触发。
5. D2C：深度图和彩色图不是同一只眼睛。对齐后才能把 MediaPipe 手点和深度叠在一起。
6. 透视四点：墙上四角 ↔ 投影画面四角，把接触点映到碎光的 0–1 坐标。
7. 坐标链：相机像素 → 相机三维 → 墙面二维 → 投影像素 → `creature` 归一化 xy。测试台停在归一化深度画面坐标。

## 名词

**相机与深度**

- **RGB**：彩色画面。浏览器抚摸现在只用这个。
- **IR / 红外**：人眼几乎看不见。Gemini 用 850 nm 红外看纹理。
- **结构光 / 主动双目**：打出红外纹理，左右红外相机看视差，算出距离。室内墙面主要靠这个。
- **被动双目**：只用环境光纹理。暗墙主要靠主动红外。
- **视差 Disparity**：左右图同一点差了多少像素；差得越大，东西越近。
- **深度图**：和照片一样大的矩阵，像素值是距离。无效处是黑洞。
- **Y16**：16 位整数深度。再乘 SDK 的 `depth_scale` 转成毫米。
- **点云**：每个有效像素变成空间里一个 (x,y,z)。墙看起来像一层点。
- **基线 Baseline**：两只红外相机光心间距。335 是 50 mm。
- **FOV**：能看见的张角。深度和彩色不一样，边缘对不齐，必须 D2C。
- **最佳工作距离**：0.26–3 m。贴太近（&lt;10 cm）会没深度。
- **空间精度 RMSE**：2 m 处 ≤1.5%。不是毫米级承诺。
- **ASIC MX6800**：机内专用芯片，自己算深度。
- **LDM**：红外激光投射器，把纹理打到墙上。
- **All-Pass / IR-Pass**：335 是 All-Pass。强阳光下 336 的 IR-Pass 更稳。
- **IMU**：加速度计 + 陀螺仪。测试台未用。
- **USB 3 / UVC**：深度流量大，必须 USB 3。Mac 普通进程可能 `uvc_open -3`。

**几何**

- **内参**：`fx, fy` 焦距，`cx, cy` 主点。
- **外参**：两台相机之间的旋转和平移。D2C 要用。
- **D2C**：把深度重采样成「好像是彩色相机拍的」。
- **ROI**：框出来的感兴趣区域。校准只拟合框内空墙。
- **平面拟合**：用许多三维点估一面墙。测试台用 SVD 找法向。
- **法向距离**：点到墙的垂直距离。这才是抬手了没有。
- **拟合残差**：点离开平面多少毫米。太大说明墙不平、框里有东西、或角度太斜。
- **覆盖率**：框内有效深度占比。黑洞太多不能校准。
- **仿射变换**：3 对点。不够处理投影梯形。
- **透视变换 / 单应**：4 个点把一个平面映到另一个平面。投影四点就是这个。
- **畸变**：镜头把直线拍弯。出厂已补偿；墙面首版可忽略。

**测试台状态**

- **开运算 MORPH_OPEN**：去掉零星噪点。
- **连通域**：挨在一起的前景当成一块。现在取最大一块，不管是不是手。
- **分位数**：取这块较近的 20% 当间距。
- **迟滞**：贴上 15 mm，离开要到 20 mm 才算抬手。
- **去抖**：同一状态持续约 150 ms 才切换。
- **接触候选**：过了距离门，不是已证明手指碰到墙。
- **噪声下限**：校准残差 × 3。贴得比噪声还近的东西会当成墙。

**浏览器已有**

- **MediaPipe Hands**：从 RGB 估 21 个手部关键点。现在只用掌心，不管深度。
- **关键点 Landmark**：归一化关节点。
- **置信度**：没把握时不要当抚摸。现有约 0.6。

**课程里有、首版不用**

- **ROS 话题 / TF / RViz**、**CvBridge**、**KCF**、**ORB-SLAM2 / OctoMap**、人脸网格。PRD 不做身份识别。

## 当前进度

以代码、PRD、#25、#26 为准，不以讨论稿为准。

| 项 | 状态 |
| --- | --- |
| 浏览器陪伴、MediaPipe 单手、`contact` 接口 | 已完成 / 接口预留 |
| #26 合入 depth-lab | 2026-09-17 |
| Mac 真实深度流 | 2026-09-15 通过（帧龄约 8 ms），当时未校准 |
| 空平面校准、触碰精度、遮挡、投影 | 未现场验收 |
| HW-01 墙面接触、HW-02 投影四点 | 规划中 |
| 接到线上碎光 | 未做 |

#25 保持打开，直到现场对照表 A–C 有真实记录。不要用 `Closes #25` 提前关掉。后续已拆：

- [#45](https://github.com/the-living-wall/The-Living-Wall/issues/45) RGB + D2C + 手部门控
- [#46](https://github.com/the-living-wall/The-Living-Wall/issues/46) HW-02 投影四点
- [#47](https://github.com/the-living-wall/The-Living-Wall/issues/47) 接入 `creature.contact`

均 `depends on #25`，不要与现场验收叠进同一 PR。
