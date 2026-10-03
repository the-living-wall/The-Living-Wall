# iOS 本地声音资源导入

本流程只接收离线处理后的、已获授权的派生 WAV，不接收创作者原始录音。原始录音应留在本机私有目录。

## 导入命令

先用试听页选出每个已录制音素的最多三个变体，再执行：

```bash
node tools/voice-lab/import-ios-resources.mjs \
  --input /path/to/xiaoying-derived/selected \
  --resources ios/XiaoyingAR/Resources/Audio \
  --dry-run
```

确认 dry-run 输出后去掉 `--dry-run`。工具会检查文件名、PCM 格式、单声道、48 kHz、16-bit，并写入 `voice-resource-manifest.json`。不符合规范的文件不会被复制。

当前只导入 `curiosity`、`invite`、`comfort`、`refuse`、`startle`、`remember`、`sleep`、`play`。`relocate` 与 `settle` 继续保持静默，直到有专门且经过确认的素材。

## Xcode 接入

在 Xcode 中把导入后的 `Audio/` 目录加入 App target，并勾选 “Copy items if needed” 与目标 membership。资源名必须保持不变，`LocalVoiceEngine` 会按 `_01`–`_03` 预加载。

这份清单与导入目录可作为交付记录；不要把原始 `.m4a`、未筛选的全量切片或包含个人信息的录音提交到公开仓库。
