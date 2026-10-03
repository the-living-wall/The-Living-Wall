# XiaoyingAR 宿主 App 模板

本目录是一个最小的 SwiftUI 宿主入口，不是完整的 Xcode 工程。它把现有 `XiaoyingARCore` Package 接到一个可运行的 iOS App 中，避免在真实设备阶段重复设计入口。

## 在 Xcode 中接入

1. 新建 iOS App（SwiftUI、iOS 16 或更高版本）。
2. 将仓库中的 `ios/XiaoyingAR` 作为本地 Swift Package 添加，并让 App target 依赖 `XiaoyingARCore`。
3. 将 `XiaoyingARHostApp.swift` 加入 App target；删除 Xcode 自动生成的 `App.swift`，避免出现两个 `@main`。
4. 把经授权筛选的 `Audio/` 目录加入 App target 的 Copy Bundle Resources。原始 `.m4a` 和未筛选素材不得加入工程。
5. 将 `Resources/InfoPlist.example.xml` 中的摄像头、麦克风和 ARKit 能力键合并到宿主 App 的 Info.plist。
6. 在真机运行 `XiaoyingPrototypeView`，按 `Resources/DeviceValidationChecklist.md` 记录结果。

## 第一版边界

- 入口只展示 AR 场景、邀请/休息、静音和音量控制。
- 资源由 `LocalVoiceEngine` 从主 App Bundle 本地加载，不上传创作者录音。
- 这是验证闭环的宿主模板，不包含签名、发布配置或跨会话空间地图。
