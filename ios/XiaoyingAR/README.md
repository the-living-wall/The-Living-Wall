# XiaoyingAR

这是第一版 iOS 原型的 Swift Package 骨架。它只使用本地派生音频；把素材放在应用 target 的资源目录，不要把创作者原始 WAV 放进仓库。

- `GestureComposer`：1–3 个音素、固定种子、受范围限制的时长/音高。
- `LocalVoiceEngine`：AVAudioEngine、TimePitch、EQ，初始化失败时由应用选择 `SilentVoiceEngine`；声音池按固定种子选择变体，并支持优先级中断、静音和音量。
- `VoiceInteraction`：将放置、邀请、移动、受惊、安定和休息映射为受冷却保护的音素组合；休息状态只接受明确邀请唤醒。
- `ARSceneCoordinator`：ARWorldTracking、水平/垂直平面、点击放置 anchor，按相机移动速度发出移动、受惊和安定事件。
- `XiaoyingPrototypeView`：可直接放入宿主 App 的 SwiftUI 体验壳，提供邀请、休息、静音和音量控制。

在 Xcode 中将本目录作为 Swift Package 引入 iOS App；真机验证弱光、桌面/床头、锚点丢失和耳机/扬声器听感。
