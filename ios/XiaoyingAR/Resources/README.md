# 本地音频资源命名

将经过授权的派生 WAV 放入 iOS App target 的资源目录。`LocalVoiceEngine` 会为每个音素预加载最多三个变体：

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

`relocate` 和 `settle` 在没有专门素材时保持静默，不复制其他语义的原始录音冒充它们。应用没有资源、没有声音权限或音频引擎启动失败时，AR 画面仍继续运行。
