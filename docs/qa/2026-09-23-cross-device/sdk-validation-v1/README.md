# SDK 接入验证第一版

2026-09-23，Refs #88 / Draft PR #91。基础提交 `cece90cabce458e7537fa3b4899ea799e49f5c59`，加本目录同 PR 的 SDK 实现及恢复修复。当前源文件散列见 `source-hashes.json`；构建、失败及浏览器过程分别留档，没有覆盖前几轮发布准备证据。

入库前已清除 trace 文本中的合成访问凭证，完整备用链接截图保留在仓库外；断言、事件顺序及其余截图保留，见 `redaction.json`。trace 用于复核操作过程，不是可继续访问的邀请。

## 结论与范围

本地 SDK 适配器、业务契约和原 HTTP 流程验证通过。尚未开启 CloudBase 匿名登录、部署 SDK 函数或修改云端权限；不能标为真实 SDK 云端收发/ACL 通过。主站、独立 HTTP 测试站和数据库部署未改变。

新增可选官方 Web SDK 3.10.1 传输、独立 `index.sdk` 入口及关闭默认开关。平台会话只提供调用资格，业务读写继续依赖独立双方凭证，复用原事务、过期、共同确认和配额。SDK 只加载 auth/functions 模块，压缩后的延迟加载块约 98 kB；普通 HTTP 构建不加载该块。具体资源、权限差异及回退见 [联调准备](../../../../services/gifts/cloudbase/SDK-VALIDATION.md)。

## 实际运行结果

- `npm test`：104/104，见 `tests.log`。包括模拟 CloudBase 事务下三个场景、匿名调用上下文缺失/伪造、独立凭证、竞争认领、版本冲突、重复请求、角色、双方确认、过期及删除。共同约定仅纪念，保持原来的样子。
- 传输补验：并发共享登录、登录/加载失败重试、429/超时保留同一请求、迟到的登录不补发、平台错误脱敏、业务冲突与平台授权失败区分；`index.sdk` 默认关闭且不接受进程残留身份。均为本地契约，不证明腾讯云实际 context 或权限。
- `npm run typecheck`、`npm run lint`、`npm run build`、`npm run build:tencent`、`npm run build:gifts`、`npm run build:gifts:cloud`、`npm run build:gifts:sdk` 通过，各有同名日志。原生产构建不引入朋友入口。
- `npm run spec:validate`：10/10，旧 creature-audio 归档 warning 保留。OpenSpec 格式通过不代表云端验收。
- 原 HTTP 三场景重跑通过：首次结果 `http-browser/results.json`；发现恢复显示问题后的结果 `http-browser-recovery/results.json`。每轮都有发送者/朋友 trace 及桌面、390px 截图，`errors=[]`。使用本机 SQLite 和两个隔离浏览器上下文，不是两台物理设备，也不是 SDK 云端联调。
- 安静陪伴场景额外验证断网创建、刷新恢复原文及称呼、再生成同一份心意，截图 `http-browser-recovery/0/creation-recovered.png`。断网重试、服务重启、刷新、声音按钮、剪贴板失败等专项只在场景 0 运行；其他场景相应 JSON 字段为 false 表示未运行该专项，不是失败。
- 依赖审计存在 11 个现有包告警，新增依赖路径无命中；见 `dependency-audit-summary.json`。没有自动升级既有构建依赖，不宣称整个项目无漏洞。

## 内嵌浏览器实际检查

CUA 操作 `http://127.0.0.1:4194/`，合成正文“SDK 验证：这是一条合成测试留言。”，称呼“测试朋友 / 测试发送者”。首页可进入创作页；生成时未配置的云端授权被拒，界面显示“连接授权暂不可用，请稍后重试；未发送的内容仍保留。”；没有出现已创建、复制邀请或接收成功状态，按钮可重试。这只证明当前配置下的失败处理，不把未成功登录当作云函数或数据库 ACL 拒绝证据。

刷新检查发现：后台待重试请求保存了原文，但创作界面显示默认开头及空称呼。修复为初始化界面时恢复待重试正文和称呼，并禁用待确认期间的“使用这句开头”，避免界面内容与实际重发不一致。修复后同一浏览器刷新、进入创作，原文与两方称呼正确显示；原问题及复查步骤记录于 `sdk-browser-observations.json`。

## 失败记录

- `tests-sandbox-failure.log`：初次测试监听本地端口受沙箱 EPERM 限制，获准后重跑通过。
- `typecheck-sdk-option-failure.log` / `lint-initial-failure.log`：SDK 配置参数位置、unknown/可选链类型等实现错误，已修复重跑。`detectSessionInUrl:false` 放在 init 的 auth 配置中，防止 SDK 消费邀请 URL。
- 首轮 SDK 全量包约 845 kB，后来改为按模块加载；最终构建见 `build-gifts-sdk.log`，旧模块优化记录见 `build-gifts-sdk-modular.log`。

## 复现与未完成

在此分支安装锁定依赖后执行：

```sh
npm test
npm run typecheck
npm run lint
npm run build
npm run build:tencent
npm run build:gifts
npm run build:gifts:cloud
npm run spec:validate
QA_OUTPUT=outputs/sdk-http-regression node --experimental-strip-types prototypes/live-gift/qa-cross-device.mjs
```

SDK 构建的环境变量、权限草案、部署顺序、复测项目及回退均在 [SDK-VALIDATION.md](../../../../services/gifts/cloudbase/SDK-VALIDATION.md)。本轮没有安装 OPA 校验工具，Rego 草案尚待腾讯云校验；平台验证不通过时不放宽到全部资源。

仍待：用户确认具体权限变更、真实平台匿名会话与本次调用身份、合法调用后的客户端越权测试、最终主站来源首次邀请及真机恢复、备份/平台日志保留边界、依赖 PR 合入与最新 CI。用户此前反馈的电脑/手机基本互发成功及主要人工走查保留，不要求重新开始全部验收。OpenSpec 3.2～3.4 与 4.3 不因此勾选，PR 保持 Draft。
