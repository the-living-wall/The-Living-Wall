# 离线声音实验工具

`process-creator-voice.mjs` 只接受仓库外的私有 WAV 目录，并输出到另一个私有目录。它校验 `<phoneme>_<variant>_<take>.wav` 命名，使用本机 `ffmpeg` 做去静音、响度统一、带通滤波和 AAC 压缩，并写出包含每个素材处理命令的 manifest。变速、变调、空气/颗粒/谐波层应在听感实验中按 manifest 继续生成，不应把原始录音放进 Git。

先用 `--dry-run` 检查文件命名：

```bash
node tools/voice-lab/process-creator-voice.mjs --input /private/xiaoying/raw --output /private/xiaoying/derived --dry-run
```

真实处理需要本机安装 `ffmpeg`，并且输出路径必须是私有目录。当前仓库没有创作者录音，因此不会生成虚假音频资源。
