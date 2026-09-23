# 小莹朋友互动 v2：统一表达与共同经历验收记录

Refs [Issue #76](https://github.com/the-living-wall/The-Living-Wall/issues/76) / [Draft PR #77](https://github.com/the-living-wall/The-Living-Wall/pull/77)。本轮为用户批准的本地原型调整，不是上线能力。

## 被测版本与范围

被测应用提交：`2807bca9af5cbc5dfcae1fe5293a7649744832de`。最终测试在提交后运行；证据追加提交仅更新文档和任务状态。已合并 main 到 `06c3a70`，底座 #70 仍未合并；#77 保持原依赖，待底座合入后由本任务同步 main、改 base 并重新验证。

- 开头、正文、给谁与落款合并；已修改正文不随选择覆盖，只能明确替换，返回编辑保留输入。
- 称呼最多 20 个 Unicode 字符；空值回退角色名，历史保存署名快照。当前留言使用新称呼，既有共同记录不改写。
- 统一「一起塑造小莹」，默认保留当前样子并存纪念；换表现同时存纪念。取消纪念不撤销样子，恢复样子不删除对话。
- 创作/接收页移除成长面板，个人页保留；不把聊天量或抚摸量写入共同成长。
- 沉静、俏皮、好奇默认采用 v2。普通互动持续可见，特殊状态静态呈现；v1 定义保持不变供历史恢复。
- 同步主线最新声音控件，保留接收默认静音；朋友页手机控件随页面流动，避免定位重叠。没有改动生产声音/成长规则。

## 三个交流场景

原始分步输入、时间与断言见 [scenarios/results.json](scenarios/results.json)。每个场景使用新的浏览器上下文和虚构对话，初始状态互不影响。

1. **安静陪伴**：写下疲惫与安慰的话，选择来源和沉静；试看不生效，另一身份确认后保存对话并采用沉静。[确认结果](scenarios/quiet/04-confirmed.png)
2. **轻松打趣**：双方开一个温和的玩笑，手动选择俏皮；单方提交后仍是原样，双方确认后生效。[确认结果](scenarios/playful/04-confirmed.png)
3. **共同约定**：记录海边散步的邀请，默认保留现在的样子；双方确认只留下纪念，不判断约定已履行。[确认结果](scenarios/promise/04-confirmed.png)

三场景通过，不代表自动理解情绪、识别人格或验证真实朋友身份。

## 完整流程与界面回归

[浏览器结果](regression/results.json)保留逐组检查结论，无页面脚本错误。

- 表达区域、显式替换、返回编辑、称呼显示与改名后的历史快照。
- 默认保留当前表现、无来源不可提交、三种试看、关闭/Escape、改选重新确认、自己不能确认、拒绝/撤回、取消纪念不改形态、恢复旧表现。
- 清空原赠言后的历史恢复和改选仍使用历史来源；刷新清空演示；个人页成长仍可见，真实成长键哨兵未改变。
- 1280×850、820×1200、390×844、360×740、375×667：长内容可滚动，无横向溢出、正文/页脚或预览按钮/声音控件重叠；窄屏试看可退出。
- 声音开关、互动音量、背景音乐和设置入口可操作；没有宣称真人听感验收。

查看：[桌面表达区](regression/composer.png)、[390px 表达区](regression/composer-390.png)、[390px 交流](regression/receive-390.png)、[减少动态](regression/reduced-motion.png)。

## 实际鼠标互动与视频

[互动采样结果](interaction/results.json)记录三种表现从确认、静置、靠近、缓慢抚摸、快速划动触发受惊、移开并恢复，到减少动态的过程。通过已有只读 `get_creature_state` 接口读取行为状态；未注入亲密度、成长值或直接设置受惊状态。

每项均要求观察到有效抚摸（enjoyment > 0.1）、受惊（alarm > 0.1）及恢复，且最终所选表现不变。画布视频记录连续光感，页面截图记录实际状态文案；视频本身不含周边操作面板。静态/非消失绘制规则另由单测覆盖，视频的审美及动作辨识仍待用户体验。

关键帧：[沉静抚摸](interaction/calm/04-stroke.png)、[俏皮抚摸](interaction/playful/04-stroke.png)、[好奇抚摸](interaction/curious/04-stroke.png)、[沉静受惊](interaction/calm/05-startle.png)、[沉静恢复](interaction/calm/06-recovered.png)。

## 自动检查

- 单测 83/83；包含新姓名快照、统一纪念/形态、持续可见、特殊状态静态特征和旧版本规则。
- typecheck、lint、应用 build、独立 Vite 构建通过。
- OpenSpec 严格校验 8/8；已有声音变更仍有目标规格缺失的归档提示，不是本轮新增或失败。

实际输出保留在 [checks](checks/)，不以格式校验代替行为验收。

## 失败与修复记录

失败记录保留在 [attempts](attempts/)，未覆盖，也不将修改后通过写作初次通过。

1. 更新后第一轮旧单测仍认为「改变表现不保存纪念」，与已批准的新规则冲突。按新规则调整断言，增加取消纪念不影响表现的独立测试。
2. 首次完整浏览器脚本用“我的称呼”模糊匹配，同时匹配对话框与输入框。改为精确匹配，未改产品行为来绕过测试。
3. 第二次浏览器回归发现主线新手机声音样式导致预览按钮重叠、设置入口隐藏。修复限于朋友原型页面，追加位置断言；个人页不修改。第三次及最终版本复验通过。
4. 首次互动录制中，场景标签 `phase` 被引擎同名字段覆盖，误报未发生抚摸；原始记录已有 enjoyment 上升及画面反馈。改用独立 `stage` 字段后复验，保留原失败，不放宽有效抚摸阈值。

## 保存与复现

截图、原始结果、检查日志、失败结果入库。大型回放与画布视频保存在本机项目目录：

`outputs/qa/shared-shaping/2026-09-23-final-2807bca/`

[media-manifest.json](media-manifest.json)记录每个文件的绝对路径、大小、SHA-256；复制到其他电脑时需一并复制该目录。三个视频分别位于 `interaction/calm/interaction.webm`、`interaction/playful/interaction.webm`、`interaction/curious/interaction.webm`。

先启动 4180 原型，然后分别运行：

```sh
QA_OUTPUT=/absolute/path/to/new-scenarios node prototypes/live-gift/qa-scenarios.mjs
QA_OUTPUT=/absolute/path/to/new-regression node prototypes/live-gift/qa.mjs
QA_OUTPUT=/absolute/path/to/new-interaction node prototypes/live-gift/qa-interaction.mjs
```

每轮使用新目录。回放用本机 Playwright `show-trace` 打开对应 trace.zip；无须上传到第三方。

## 尚未完成的人工验收

用户尚未验收本轮审美、三种动作差异、真实手机体验及听感。没有真人身份认证、跨设备同步、真实送达或通知。本地模拟和自动测试不能代替这些。OpenSpec 3.3 保持未完成，PR 保持 Draft，不合并、不部署。
