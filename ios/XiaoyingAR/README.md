# XiaoyingAR

这是第一版 iOS 原型的 Swift Package 骨架。它只使用本地派生音频；把素材放在应用 target 的资源目录，不要把创作者原始 WAV 放进仓库。

- `GestureComposer`：1–3 个音素、固定种子、受范围限制的时长/音高。
- `LocalVoiceEngine`：AVAudioEngine、TimePitch、EQ，初始化失败时由应用选择 `SilentVoiceEngine`。
- `ARSceneCoordinator`：ARWorldTracking、水平/垂直平面、点击放置 anchor，并将移动事件抛给应用层。

在 Xcode 中将本目录作为 Swift Package 引入 iOS App；真机验证弱光、桌面/床头、锚点丢失和耳机/扬声器听感。
