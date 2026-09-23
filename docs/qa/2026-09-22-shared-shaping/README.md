# 共同塑造小莹：三个场景的测试留档

关联 [Issue #76](https://github.com/the-living-wall/The-Living-Wall/issues/76) / [Draft PR #77](https://github.com/the-living-wall/The-Living-Wall/pull/77)。用户要求保留测试过程，本次仅增加测试脚本及证据，**无产品行为变化，PRD 未改**。

## 版本、时间与结论

- 被测应用：`b7edcbd8ea1b61656d673b983d20a8d59cbdd6bf`，本机 `http://127.0.0.1:4180/`，不是线上网站。
- 本次执行：2026-09-22 18:59:44–18:59:52（北京时间）。Chrome 153.0.8010.53，1280×850；每个场景使用独立、无登录的浏览器上下文及虚构对话。没有操作用户已有的浏览器会话。
- **三个场景全部通过**。每一步实际时间、输入、断言名称及结果见 [scenario-results.json](scenario-results.json)；完整复现脚本见 [qa-scenarios.mjs](../../../prototypes/live-gift/qa-scenarios.mjs)。本次执行时该脚本为新增未提交文件，已记录在结果的 workingTree 字段；应用文件未改动。
- 开工已获取远端：main 从 `051a289` 前进到 `cccca0e`，差异仅自动更新的项目动态文档，本次没有合并主线、改 PR base、合并 PR 或部署。
- “安静陪伴、轻松打趣、共同约定”是交流场景；“沉静、俏皮、好奇”是手动选择的表现目录。两者不一一绑定，也没有自动分类。

## 场景 1：安静陪伴

输入：「今天有点累，不太想说话。」／「那就安静待一会儿，不用急着回复。」

1. 进入接收视角，核对原来的样子和默认静音。
2. 用两种模拟身份分别留言；核对留言保留、性情没有自动改变。[留言截图](quiet/01-dialogue.png)
3. 进入「一起塑造小莹」，未选来源时不能提交；手动勾选双方原话、填写理由并选择沉静。
4. 试看并返回；当前共同选择仍为原样。[试看截图](quiet/02-preview.png)
5. 一方提出；没有自己的确认按钮、没有生效历史，原样保持。[待确认截图](quiet/03-pending.png)
6. 切换另一身份主动确认；当前变为沉静，历史含双方原话及理由。[确认结果](quiet/04-confirmed.png)

实际结果：以上检查均通过，无页面脚本错误。证明流程约束，不证明实际疗愈效果。

## 场景 2：轻松打趣

输入：「今天又把钥匙忘在家里了，我真是金鱼记忆。」／「给金鱼配个钥匙挂绳，下次一起出门。」

1. 独立进入接收视角，两种身份来回留言，仍是原样。[留言截图](playful/01-dialogue.png)
2. 手动勾选原话并填写理由，选择俏皮；未选来源不能提交。
3. 试看、返回均不生效。[试看截图](playful/02-preview.png)
4. 提出后等待另一身份；自己不能确认。[待确认截图](playful/03-pending.png)
5. 另一身份确认后变为俏皮，记录保留双方原话及理由。[确认结果](playful/04-confirmed.png)

实际结果：以上检查均通过，无页面脚本错误。这里是人主动选择俏皮，不是系统判断用户性格或理解玩笑。

## 场景 3：共同约定

输入：「周末如果有空，我们去海边散步吧。」／「好呀，到时候再确认天气和时间。」

1. 独立进入接收视角，双方留言，性情仍为原样。[留言截图](promise/01-dialogue.png)
2. 打开「留下这一刻」，手动选取原话；理由为「一个还没发生的散步约定，先把邀请留下」。
3. 单方提出后，没有生效历史，也不能自己确认。[待确认截图](promise/03-pending.png)
4. 另一身份确认后，新增一条纪念，保留原话和理由；出现取消纪念入口，未生成恢复性情入口，性情仍是原样。[确认结果](promise/04-confirmed.png)

实际结果：以上检查均通过，无页面脚本错误。保存的是尚未发生的邀请；未实现履约判断，也未验证线下活动发生。

## 此前已运行的完整回归

以下属于前一轮实际证据，未冒充本轮重跑：

- 被测提交同为 `b7edcbd`：78/78 单元测试、typecheck、lint、应用构建、独立预览构建通过；OpenSpec 严格校验 7/7。服务器 [CI 记录](https://github.com/the-living-wall/The-Living-Wall/actions/runs/35711311960) 可独立查证。
- 现有 [完整浏览器脚本](../../../prototypes/live-gift/qa.mjs) 覆盖取消/Escape、改选重新确认、恢复、纪念与取消纪念、拒绝/撤回、清空原赠言后的历史来源、原声音开关和成长存档保护。
- 1280×850，以及 820×1200、390×844、360×740、375×667 的长内容和试看检查，无横向溢出或页脚遮挡，无页面脚本错误。
- 原始截图和结果从临时目录原样保留到 [prior-regression](prior-regression/)。旧 results.json 本身不含提交与执行时间，版本对应依据前一轮 README/PR 记录；没有向原文件补造元数据。
- 三种外观试看：[沉静](prior-regression/desktop-calm.png)、[俏皮](prior-regression/desktop-playful.png)、[好奇](prior-regression/desktop-curious.png)。这是静态留证，不能单凭截图断言动作可辨识。

## 如何复查过程

仓库长期保留：本说明、复现脚本、逐步 JSON 结果、全部关键截图及历史回归证据。完整回放包含浏览器操作、画面快照和资源，约 12 MB，不作为源代码二进制入库；已放到项目的 `outputs/qa/shared-shaping/2026-09-22-scenarios/`，不再依赖系统临时目录。[trace-manifest.json](trace-manifest.json) 记录本机绝对路径、大小与 SHA-256；换电脑时需另行复制该目录。

在项目根目录运行，先启动本地原型，再执行：

```sh
QA_OUTPUT=/absolute/path/to/a-new-evidence-folder node prototypes/live-gift/qa-scenarios.mjs
```

每次指定新的留档目录，保留失败过程，不覆盖旧结果。查看已有回放：

```sh
node_modules/.bin/playwright show-trace /absolute/path/to/quiet/trace.zip
```

`playful/trace.zip`、`promise/trace.zip` 同理。回放用于复查自动操作，不是一次新的测试。未来真实用户对话不得直接录入这些测试证据。

## 仍待人体验确认

用户已认可方向，要求继续完善细节；未将其写成完整验收。三种表现的审美、动作辨识、真人听感及手机真机仍待确认。本机角色切换不能证明两位真人身份、真实送达、通知、跨设备存储或离线约定完成。OpenSpec 的人工体验任务 3.3 继续保留未完成。
