# 无 OPA 最小权限实测（第四版）

2026-09-24（北京时间），Refs #88 / Draft PR #91。用户确认第三版具体方案后执行。只涉及 the-living-wall / env-d1g2bv5sn355fc36e / ap-shanghai，复用现有资源；未保存 OPA、未购买资源、未发布正式主站。应用代码未改，测试构建源 b0de813（SDK 实现源 d916ba6）。

## 已应用及实测

- 匿名角色原 app/API connector 两条 wildcard allow 已移除；这类角色规则不等于函数 ACL。保留其他角色。
- 函数规则仅新增 xiaoying-gifts-sdk-probe 的 auth != null；原 wildcard 仍排除匿名，cleanup 仍 false。
- 安全来源仅新增 127.0.0.1:4194。匿名登录已开启，其余登录配置保留；具名函数当前 GIFT_SDK_ENABLED=true。
- 真实 Web SDK 3.10.1 GATEWAY 匿名会话成功；关闭业务时具名探针返回 503，cleanup 与原 API 函数的 SDK 调用均 EXCEED_AUTHORITY；两个 ADMINONLY 集合直读和直写均 DATABASE_PERMISSION_DENIED；无凭证调用 MISSING_CREDENTIALS。
- 首轮发现存储 READONLY 实际允许创建者上传，匿名上传了一个 24 字节虚构文件。此前将 READONLY 解读为禁止客户端写入是错误的。已先关闭匿名，收紧为公开读、仅非匿名创建者写，然后删除唯一测试文件并确认 qa-acl/ 为空，再开启匿名复测；上传返回 STORAGE_EXCEED_AUTHORITY。初次失败证据保留，不替换为成功记录。
- 未登记的 127.0.0.1:4195 仍可调用，因此不能把本机端口视为安全边界。不同主机名 denied.localhost 的匿名认证和函数预检均 HTTP 403；example.invalid 认证也为 403。安全来源是浏览器来源约束，不代替业务凭证认证。
- 应用真实创建虚构赠光成功，发送者刷新后恢复同一 ID、正文和称呼，显示保存至 2026/10/1；复制邀请操作显示成功。邀请及双方凭证不写入证据。

## 未完成与阻塞

自动打开邀请曾被 Browser Use URL 安全策略拦截，此失败保留。用户随后手动完成接收及共同塑造，并提供两张截图，补齐下列结果证据：

- [接收方截图](manual-recipient.png)显示「测试乙 · 收到心意」；[发送方截图](manual-sender.png)显示「测试甲 · 送出心意」。
- 两端均显示甲的 `hallo` 与乙的 `he re`，发送方提示「朋友已回复，可以继续聊」。本地来源的双方身份和双向留言结果人工验收通过。
- 两端均显示「俏皮」「我们的共同记录（1）」以及双方已共同选择的提示。共同塑造结果同步人工验收通过；截图不单独证明协议版本号或并发处理。
- 截图没有展示首次接受按钮的操作过程或异常重试，因此这些步骤不由最终画面推定通过。用户在随后针对双方刷新检查的回复中明确确认「测试通过」：双方刷新后身份、留言、俏皮形态和共同记录仍保留，记为用户人工验收通过；不是自动化重跑结果。SDK 并发/幂等/限流也仍需补证。OpenSpec 4.3 保持未完成。此为同机不同浏览器的本地来源验收，不称为公网两台物理设备验收。


正式域名尚未加入来源，最终 HTTPS 来源恢复、费用上限、备份和响应日志保留、依赖 PR 合入与正式部署仍未完成。当前配置是限定探针联调状态，不是发布就绪结论。

## 证据与重试注意

- boundary-first.json：初次存储意外成功；boundary-restricted.json：收紧后拒绝及端口反例。其 overallPassed=false 保留原意。
- source-http-probe.json：认证来源比较。另一次函数路径预检 denied.localhost 返回 403，requestId 9aa5d502-1627-4157-8b52-951e229d4dee。
- storage-after.json、restricted/、functions-after.json、role-after.json、sources-after.json：配置回读；business-enabled.json：业务开关开启记录。
- sdk-boundary.ts.txt / boundary.html：仅供诊断的源码，必须先关闭业务再运行 disabled 断言；不要在当前开启状态直接重跑整页。不得重复进行上传成功测试。
- npm 不在本次运行环境，build-sdk.log 保留失败；随后直接调用仓库 Vite 入口构建成功，见 build-sdk-direct.log。

若停止联调，先将探针 GIFT_SDK_ENABLED=false，再移除此次添加的本地来源与命名函数授权，并关闭本轮开启的匿名登录。收紧后的匿名角色和存储禁止匿名写不应自动恢复为原宽权限；需要恢复非匿名行为时单独核实影响。

检查：SDK 构建、TypeScript、OpenSpec 10/10 与 git diff --check 通过。诊断源码按原样作为 .ts.txt 证据归档（使用 SDK 动态错误类型及旧存储 API），不作为应用源码参与编译；不将诊断实现当作正式业务代码。
