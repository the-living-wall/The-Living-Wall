# 无 OPA 的最小权限接入核验

**后续实测纠正**：第四版匿名上传探针揭示下文对 `READONLY` 的解释错误；它允许创建者写入，匿名用户也能创建文件。第一版真实边界检查已因此失败并关闭匿名入口，记录见 [第四版失败证据](../min-permission-v4/boundary-first.json)。函数和数据库拒绝检查通过，不能据此略过存储缺口。后续收紧为保留公开读、非匿名创建者写，拒绝匿名写；原错误段保留以追溯。

Refs #88 / Draft PR #91。2026-09-23，执行人 Codex。本轮为只读云端核验和接入方案准备，未修改云权限、部署、套餐或真实数据。工作分支 `livehighhigh/88-cross-device`，核验源 `b0de813`。OpenSpec 仍为 10/14，4.3 未完成。

## 结论

**已有依据优先试验具名函数安全规则，无证据证明必须切换 OPA 或购买资源。尚未完成真实匿名会话下的允许/拒绝验证，不能写成方案已经云端通过。**

当前环境为传统文档数据库个人版，不是 PostgreSQL。官方函数规则支持具名规则优先于 wildcard；HTTP API 的函数调用文档也明确受函数安全规则和身份认证控制。应用锁定 Web SDK 3.10.1，显式使用 `GATEWAY`；其函数模块调用 `request.gateWay`，path 为 `functions`。因此先保持当前鉴权引擎，以具名规则完成隔离测试是有依据的候选。

不能把匿名角色的 `ResourceType=apis` 的全部授权直接解释成全部 CloudBase HTTP API 或全部云函数放行。官方权限文档将 APIs/微搭与云函数安全规则分别列出；控制台扩展功能当前明确“暂无 APIs”，微搭列表“暂无应用”、发布数 0。它们也不能作为已经验证匿名安全的证据。为避免未来创建连接器/应用继承无关授权，候选试验先移除匿名角色这两条空资源范围的通配授权；若导致 SDK 拒绝，记录具体层级，不恢复全部授权来掩盖问题。

## 本轮实时回读

- 新函数 `xiaoying-gifts-sdk-probe`：Active，`index.sdk`，Nodejs20.19，`GIFT_SDK_ENABLED=false`。
- 匿名登录关闭；所有用户角色没有策略；匿名角色有 app/ apis 各一条 `Resource=*`、allow。
- 函数 wildcard 为 `auth != null && auth.loginType != 'ANONYMOUS'`；`xiaoying-gifts-cleanup` 为 `invoke=false`。新函数尚无具名授权。
- 两个集合 `xiaoying_gifts`、`xiaoying_limits` 均为 ADMINONLY。
- 云存储专用 API 回读 `AclTag=READONLY`，规则为空：公共只读，不是客户端可写，也不是完全私有。此处不存心意数据；若目标扩展为禁止所有公共素材读取，需要另行界定范围。
- 用户/扩展 Rego 均为空；旧网关策略列表为空；环境 `Meta=null`，未发现 CLI 用来识别 OPA 的 `authz_engine=opa` 标记。这是配置回读，不是服务器引擎行为证明。
- SDK 来源中没有 `127.0.0.1:4194` 或 `thelivingwall.cn`；没有新增来源。
- 对关闭的新函数发出一次无凭证空 POST，平台返回 `MISSING_CREDENTIALS`，requestId `660e9da8-9683-4bb3-89bd-5e699c1d365c`。这只证明无凭证请求被拒，不能替代匿名登录后的 ACL 验收。
- 原 HTTP 测试站 `/api/health` 返回 `{"ok":true}`；未重跑已通过的三场景或真机全流程。
- Issue #88 OPEN；PR #70/#77/#91 均 OPEN/Draft，base 分别为 main、#69 分支、#76 分支。远端 #91 head 与本地相同。fetch 已完成；main 为 `71c0b67`，本分支尚未包含其项目动态提交。没有合并或发布。

机器回读见 [readback.json](readback.json)。匿名角色详情请求 `2a4ff066-6de3-4f1e-8890-3233aeee788a`；所有用户详情 `1b38d44f-9899-4e86-82f2-ef74f007be47`；匿名登录配置 `9eeedb4d-8cae-4c93-8752-dae0a1182d5f`；存储专用请求 `15029caf-0124-47eb-866f-944ee82dd4f2`；旧网关列表 `610c3cdb-240e-48b1-804c-5a9460ddc2dd`。

## 可审阅的下一步配置（尚未执行）

仅目标环境 `env-d1g2bv5sn355fc36e` / 上海，保持当前鉴权引擎，分阶段执行：

1. 回读防止并发覆盖；从匿名角色移除现有两条 app/apis 通配 allow，其他角色不变。当前两类资源均为空。回读角色及旧 HTTP 健康。
2. 保留完整函数规则，只增加 `xiaoying-gifts-sdk-probe: {"invoke":"auth != null"}`；保留 wildcard 和 cleanup 原值。使用直接的函数资源规则接口；若报不支持，停止，不自动回退到 OPA。候选完整规则见 [function-rules.candidate.json](function-rules.candidate.json)。
3. 来源仅增加 `127.0.0.1:4194`；开启匿名登录。**匿名登录是环境级入口开关，虽具名函数有限制，仍须明确确认这一具体影响。** 不添加正式域名或通配来源。
4. 保持业务开关 false，先从真实本地 SDK 会话验证：新函数能到达关闭态并返回业务 503；原 API 函数和 cleanup 客户端调用拒绝；数据库直读写拒绝；存储上传拒绝；错误来源和未登录请求拒绝。请求不包含清理 Timer 事件，不操作真人记录。区分 SDK 本地失败、平台拒绝、业务响应；控制台规则回读不算行为通过。
5. 以上边界通过后才将新函数开关改为 true，以合成内容补验首次邀请、双向回复、刷新、相同请求重试、共同确认和越权拒绝。若基础规则不足，关闭新入口，记录具体缺口，再评估替代接入，不自动扩大权限或购买资源。

新增/允许会话与函数调用会消耗已购套餐额度，不承诺零费用；不变更超额计费或续费设置。正式站接入、最终来源与备份/平台日志保留仍是后续门禁。

## 回退与判定

失败时先关闭新函数业务开关，再撤具名调用授权、恢复匿名登录为 false、撤本轮新增来源；仅撤本轮差异，不用旧快照覆盖协作者改动。匿名角色两条旧授权记录保留，但不在匿名登录开启时盲目恢复；需恢复则先关闭新入口并核对资源清单。此方案不保存 Rego，不涉及旧鉴权引擎恢复问题。

没有本轮应用代码变化；不重复旧应用测试、类型、lint 或构建结果。本轮 `openspec validate --all --strict` 10/10 通过，保留既有 creature-audio 归档提示；`git diff --check` 通过。原 COS 上传失败、OPA 自动审批拒绝及 HTTP 首访丢失邀请等历史证据不删除。

## 官方依据

- [函数安全规则](https://docs.cloudbase.net/cloud-function/security-rules)：按函数名匹配，具名规则优先于 wildcard，支持登录用户规则。
- [HTTP API 函数调用](https://docs.cloudbase.net/http-api/functions/functions-post)：函数安全规则与身份认证共同约束调用；本轮搜索结果可读，全文打开失败，未据此虚构额外细节。
- [传统权限模型](https://docs.cloudbase.net/authentication-v2/auth/auth-control)：区分云函数、存储资源规则与 APIs/微搭资源策略。
- [云存储权限](https://docs.cloudbase.net/storage/data-permission)：公共只读与完全私有不同。
- [OPA](https://docs.cloudbase.net/envconfig/authz-opa/intro)：环境级请求鉴权；本轮未切换。
