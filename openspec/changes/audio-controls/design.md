## 设计

`CreatureAudio` 保留一个总体互动增益，并在每个 cue 的播放增益上乘以独立音量。默认独立音量为 100%，背景音乐默认 12%。`SoundControls` 使用 `xiaoying-sound-volumes` localStorage 保存数值，读取失败或格式错误时回退默认值。

可见性只挂起运行时：关闭并释放互动 AudioContext、暂停媒体元素，同时记录用户是否启用；恢复可见时重新加载并尝试播放。用户主动关闭后不自动恢复。`pointerleave` 不参与声音生命周期。

映射：身体为鳞片/旋转/快速移动，心/口为呼吸与回应，手为好奇/接触/抚摸。实际事件仍由现有 Creature 和 SoundDirector 判定。
