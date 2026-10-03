# 本地音频资源命名

将经过授权的派生 WAV 放入 iOS App target 的资源目录。`LocalVoiceEngine` 会为每个音素预加载最多八个变体：

```text
curiosity_01.wav  curiosity_02.wav  curiosity_03.wav
invite_01.wav     invite_02.wav     invite_03.wav
comfort_01.wav    comfort_02.wav    comfort_03.wav
refuse_01.wav     refuse_02.wav     refuse_03.wav
startle_01.wav    startle_02.wav    startle_03.wav
remember_01.wav   remember_02.wav   remember_03.wav
sleep_01.wav      sleep_02.wav      sleep_03.wav
play_01.wav       play_02.wav       play_03.wav
```

创作者从试听页导出的 `xiaoying-voice-selections.json` 可以用工具转换为标准资源名：

```bash
node tools/voice-lab/prepare-selected-voice.mjs \
  --selection /private/xiaoying/xiaoying-voice-selections.json \
  --variants /private/xiaoying/variants \
  --output /private/xiaoying/ios-audio
```

工具会保留每个情绪的全部勾选项，并按该情绪重新编号；不会上传或复制原始录音。

`relocate` 和 `settle` 在没有专门素材时保持静默，不复制其他语义的原始录音冒充它们。应用没有资源、没有声音权限或音频引擎启动失败时，AR 画面仍继续运行。

## 导入与真机验证

不要手工把原始录音拖入工程。使用仓库工具校验并复制已授权派生素材：

```bash
node tools/voice-lab/import-ios-resources.mjs \
  --input /path/to/xiaoying-derived/selected \
  --resources ios/XiaoyingAR/Resources/Audio \
  --dry-run
```

完整说明见 [`docs/voice/ios-resource-import.md`](../../../docs/voice/ios-resource-import.md)，真机执行见 [`DeviceValidationChecklist.md`](./DeviceValidationChecklist.md)。
