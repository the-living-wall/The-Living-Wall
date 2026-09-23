# 现有主站的 SDK 最小验证

Refs #88 / Draft PR #91。状态：本地实现完成，尚未开放云端权限或部署 SDK 函数。现有 HTTP 测试站和主站不变。验证结果见 [SDK 第一版证据](../../../docs/qa/2026-09-23-cross-device/sdk-validation-v1/README.md)。

## 具体资源与权限差异

只涉及 `the-living-wall` / `env-d1g2bv5sn355fc36e` / 上海，复用已购个人版及文档数据库，不涉及 `ai-future-letter`。下面是待确认后执行的完整范围，不是已生效配置：

1. 新建普通函数 `xiaoying-gifts-sdk-probe`，使用现有云端构建包，入口 `index.sdk`，Node.js 20.19、256 MB、15 秒；不绑定 HTTP 访问路由，不更新 `xiaoying-gifts-api` 或清理函数。函数变量为 `GIFT_ENV_ID=env-d1g2bv5sn355fc36e`、`GIFT_SDK_ENABLED=true`，运行角色复用当前环境，无新增长期密钥。
2. 开放匿名登录（当前关闭）。这会在 CloudBase 创建浏览器访客会话，用户无需填写账号；访客身份只用于平台调用，不替代心意自己的邀请/双方凭证，也不同步个人成长。
3. SDK 安全来源只新增 `127.0.0.1:4194`，保留现有条目，不添加通配符或正式域名。CloudBase 的 SDK 安全来源与绑定自定义网站域名是不同配置。
4. 新函数客户端规则为 `{"invoke":"auth != null"}`。保存前回读并保留其他命名规则及 wildcard，原 `xiaoying-gifts-cleanup` 继续 `invoke=false`，原 wildcard 继续排除匿名。不得用一条宽松 wildcard 替换整份规则。
5. v3 采用官方 HTTP API 通道；配套 [OPA 草案](sdk-probe-policy.rego) 只允许匿名 POST 到上述命名函数，并处理来自本地来源的 OPTIONS。其他匿名/未登录资源请求通过明确 deny 收紧，不扩大平台所有 APIs 角色授权；旧 HTTP 网关路由、管理员和平台内部定时器不在这段规则的范围。Origin 是浏览器来源限制，不能当作不可伪造的身份认证。
6. 两个现有集合 `xiaoying_gifts`、`xiaoying_limits` 维持 ADMINONLY；数据库直读写、清理客户端调用必须实际拒绝。业务云函数继续检查高熵独立凭证、7 天有效期、版本、容量与事务限流。

2026-09-23 只读控制台：匿名角色已有“所有 APIs / 允许全部方法”及“所有应用 / 允许全部页面”，OPA 显示暂无策略。没有修改这些条目。仅开启匿名登录可能扩大默认可用能力，因此必须连同上面的收紧规则一起验证；不能只开开关就宣布安全。OPA 草案尚未经平台保存校验，不宣称平台 ACL 已通过；若平台不接受具体规则或实际链路不同，保持功能关闭并修正草案，不改为全部放行。

## 本地构建与验证入口

使用仓库锁定依赖。Web SDK 3.10.1 仅动态加载 auth/functions 模块，不打包数据库或云存储调用组件。下列公开环境 ID、地域及函数名不是凭证；任何 secret/token 不得写入 VITE 变量。

```sh
VITE_GIFTS_CLOUDBASE_ENV=env-d1g2bv5sn355fc36e \
VITE_GIFTS_CLOUDBASE_REGION=ap-shanghai \
VITE_GIFTS_CLOUDBASE_FUNCTION=xiaoying-gifts-sdk-probe \
npm run build:gifts:sdk
npm run build:gifts:cloud
python3 -m http.server 4194 --bind 127.0.0.1 --directory outputs/gifts/sdk-site
```

`build:gifts` 默认继续走 HTTP；`build` / `build:tencent` 不自动添加朋友模块。SDK 缺少环境/地域/函数配置时构建失败；未设置 `GIFT_SDK_ENABLED=true` 时函数返回 503。客户端 12 秒超时、429 或授权故障保留原始请求 ID 与正文，重试相同请求，不能误显示创建成功。选择 SDK 通道不会把网页迁往 CloudBase。

## 开放后的联调顺序

- 先回读并留存匿名登录、来源、函数规则、OPA、DB 规则的原值，核对环境与新函数名。确认 CLI 当前授权可用；不导出 CLI 凭据。
- 函数先以 `GIFT_SDK_ENABLED=false` 部署。先保存收紧规则、来源、命名权限，再开启匿名登录和函数开关；任一失败停在关闭状态，不留下半开放配置。
- 在两个隔离浏览器用合成文字：首次匿名会话、创建、独立邀请主动接受、双向回复、改名快照、同版双方确认、刷新恢复、同请求重试及版本冲突。缺少平台本次调用 `TCB_UUID` 必须拒绝，不能退回读取可能残留的进程身份变量。
- 从已成功登录的客户端补验无业务凭证/跨心意访问拒绝、数据库直接读取拒绝、清理函数调用拒绝、其他函数及错误来源拒绝。必须区分平台拒绝与 SDK 尚未登录的提前失败。验证 OPTIONS 后只发一次业务请求。
- 观察限流、资源用量及 7 天清理。现有限额跨两个业务函数共享，测试可能触发现有 120 请求/分钟上限。先使用小量合成数据，重试同一请求；不调整套餐、超额或自动续费设置。访客会话与函数/数据库调用会计入已有套餐用量，不承诺零消耗，也不把应用限流称为费用硬上限。
- 本地到云端通过后，再单独准备现有 EdgeOne 主站来源的预览、首次邀请和真机验证。本轮 localhost 验证不等于正式来源、两台物理设备或生产发布通过。

## 回退

先把新函数 `GIFT_SDK_ENABLED` 改为 `false`，撤掉该函数客户端 invoke 授权，恢复本轮新增 OPA/安全来源和匿名登录原值。保留原 API、清理定时器及集合，不删除环境或真人记录。移除匿名入口前记录合成测试 ID；需要清理时仅用测试发送者凭证删除本轮自建的合成心意。若有人在测试期间修改配置，逐项比对差异，不能用旧快照覆盖他人的更改。

现有测试站前端/后端版本及主站不需要回退，因为本轮不替换它们。若 SDK 联调失败，独立 HTTP 测试继续使用原链接；保留失败日志，不降级成客户端数据库直写。

依据：[Web SDK 函数调用与本次上下文](https://docs.cloudbase.net/api-reference/webv3/functions)、[匿名登录](https://docs.cloudbase.net/authentication-v2/method/anonymous)、[安全来源](https://docs.cloudbase.net/envconfig/security/intro)、[命名函数规则](https://docs.cloudbase.net/cloud-function/security-rules)、[OPA 覆盖与 deny 优先](https://docs.cloudbase.net/envconfig/authz-opa/intro)。
