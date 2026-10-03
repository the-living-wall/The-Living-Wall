# XiaoyingAR 宿主 App 模板

本目录是一个最小的 SwiftUI 宿主入口，不是完整的 Xcode 工程。它把现有 `XiaoyingARCore` Package 接到一个可运行的 iOS App 中，避免在真实设备阶段重复设计入口。

## 在 Xcode 中接入

1. 新建 iOS App（SwiftUI、iOS 16 或更高版本）。
2. 将仓库中的 `ios/XiaoyingAR` 作为本地 Swift Package 添加，并让 App target 依赖 `XiaoyingARCore`。
3. 将 `XiaoyingARHostApp.swift` 加入 App target；删除 Xcode 自动生成的 `App.swift`，避免出现两个 `@main`。
4. 把经授权筛选的 `Audio/` 目录加入 App target 的 Copy Bundle Resources。原始 `.m4a` 和未筛选素材不得加入工程。
5. 将 `Resources/InfoPlist.example.xml` 中的摄像头和 ARKit 能力键合并到宿主 App 的 Info.plist；当前原型不需要麦克风，只有接入语音输入后才加入麦克风用途键。
6. 在真机运行 `XiaoyingPrototypeView`，按 `Resources/DeviceValidationChecklist.md` 记录结果。

## 第一版边界

- 入口只展示 AR 场景、邀请/休息、静音和音量控制。
- 资源由 `LocalVoiceEngine` 从主 App Bundle 本地加载，不上传创作者录音。
- 这是验证闭环的宿主模板，不包含签名或发布配置；默认宿主会把 ARWorldMap 写入 Application Support，并在下次启动时尝试恢复。原生地图恢复仍需真实 iPhone 验收。

## 空间记忆验收顺序

1. 首次启动后扫描桌面/床头，点击放置；等待状态显示“小莹记住这里了”。
2. 彻底结束 App，再次打开并保持摄像头对准同一空间；应先显示“正在寻找小莹的家”，找回同一命名锚点后显示“小莹回到她记住的位置了”。
3. 在另一房间或明显不同位置启动；30 秒内无法重定位时，应显示“找不到上次的位置，请点击桌面重新放置”，而不是把小莹放在错误位置。
4. 点击新位置重新放置，确认旧地图被新命名锚点替换并可再次保存。
