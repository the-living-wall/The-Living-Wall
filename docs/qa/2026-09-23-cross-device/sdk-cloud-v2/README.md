# SDK 云端联调第二版

2026-09-23，Refs #88 / Draft PR #91。代码源 `d916ba60d2a59ad5f0c0a25ab2973f6b5997b8ff`；本轮未改应用代码。环境仅 `the-living-wall` / `env-d1g2bv5sn355fc36e` / 上海。旧证据目录未覆盖。

## 已完成

- 回读匿名登录关闭、旧网关策略列表为空、用户/扩展 Rego 为空、具名清理函数禁止调用、wildcard 排除匿名、两个集合 ADMINONLY。见 `before.json`；安全来源完整快照为 `sources-before.json`。
- 运行 `npm run build:gifts:cloud` 和带明确环境参数的 `npm run build:gifts:sdk` 成功。云端代码散列见 `build-manifest.json`。
- 新建普通函数 `xiaoying-gifts-sdk-probe`，Nodejs20.19、256 MB、15 秒、`index.sdk`、`GIFT_SDK_ENABLED=false`；没有 HTTP 路由、没有替换原 API/清理函数。配置及平台回读为 `function-disabled.json`、`function-detail-disabled.json`。
- 管理员调用空请求确认返回业务状态 503（“连接配置尚未完成”），见 `invoke-disabled.json`；依赖加载和关闭开关实际生效。该调用没有进入数据库，不作为匿名会话或客户端 ACL 验收证据。
- 原测试站 `/api/health` 返回 HTTP 200、`ok=true`，见 `http-health-before.json`。这里只验证健康接口，不扩写为全链路回归通过。
- `npm run spec:validate` 为 10/10，保留既有 creature-audio 归档提示；`git diff --check` 通过。本轮只补部署与规格文档，没有改应用代码，因此没有重跑上一版的 104 项应用测试、类型检查和 lint，也不将其标为本轮通过。

## 失败与当前阻塞

1. 首次 COS 上传超时，见 `deploy-disabled.log`。回读函数列表仍只有原 API 和清理函数，未创建同名函数。随后改用小包 ZIP 直传，云端安装固定版本依赖，成功记录为 `deploy-disabled-zip.log`。
2. 准备保存 OPA 时，自动审批审查拒绝执行：保存会持久化切换环境级网关鉴权、使旧网关鉴权失效，先前授权没有明确覆盖该更广影响。没有调用平台保存 API；`policy-after-block.json` 确认用户策略仍为空。已向用户说明并请求对此切换明确确认。

尚未新增安全来源、修改函数规则、启用匿名登录或打开新函数业务开关；数据库与现有测试站部署未变。没有购买、续费、固定 IP、备案或 DNS 变更。

## 待继续

- 获得环境级切换确认后，保存并回读限制策略；先验证原 HTTP 首页/健康及合成业务流程，再开启本机来源与匿名调用。
- 使用两个隔离浏览器完成真实 SDK 匿名登录、三场景收发、首次邀请、双向回复、刷新、并发与幂等。
- 成功登录后验证数据库直读、清理函数、其他函数、错误来源及无业务凭证访问均拒绝；补验共享限流。
- 本机云端联调通过后，另行验证正式来源和物理设备。以上均尚未通过，OpenSpec 4.3 保持未完成，PR 保持 Draft。

具体差异、引擎切换影响及回退边界见 [SDK-VALIDATION.md](../../../../services/gifts/cloudbase/SDK-VALIDATION.md)。删除用户 Rego 不等于恢复旧网关鉴权引擎，目前不能承诺一键恢复旧引擎。
