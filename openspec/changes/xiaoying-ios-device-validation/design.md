# Design

导入工具使用 Node 标准库解析 RIFF/WAVE 的 `fmt ` 块，只接受 PCM、单声道、48 kHz、16-bit 文件，并将文件名限制在八个已确认音素及 `_01`–`_03` 变体。它写出资源清单，便于 Xcode target membership 与审计。

权限配置由宿主 App 合并 `InfoPlist.example.xml`；Swift Package 不直接拥有 Info.plist。真机测试按桌面/床头/弱光/移动/锚点恢复/音频失败分层，确保声音不是 AR 画面可用性的前置条件。
