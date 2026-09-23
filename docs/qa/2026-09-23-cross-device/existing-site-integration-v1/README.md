# 现有主站接入核验 · 第一版

2026-09-23，Refs #88 / PR #91。只读核验与发布路径纠正，无应用行为变化；未部署、未更改权限、未购买资源。

## 结论与纠正

用户要求在已上线的 thelivingwall.cn 增加朋友互动，复用已购 CloudBase 保存留言。此前把“独立 CloudBase 自定义域名”的备案路径当作普遍发布前提，范围过宽。购买和使用数据库不等于必须把网站迁入 CloudBase 或用该环境办理备案。暂停六个月续费、云托管开通及固定 IP 路线；这些只在最终选定相应备案接入方案时重新评估。

本记录纠正工程部署依赖，不作整个业务免除备案或其他合规义务的结论。不要通过转发开发测试域名规避平台的使用限制。

## 当前账号的直接证据

通过已登录控制台读取：

- [EdgeOne Makers 项目](https://console.cloud.tencent.com/edgeone/makers/project/makers-m2bkgxhijig7/index)：项目 the-living-wall，域名 thelivingwall.cn，区域“全球可用区（不含中国大陆）”，运行中。当前概览引用 main / 69b1bd5；PR #92 的 623d277 是历史发布记录，不能覆盖当前概览。
- Makers 用量页为免费版，Cloud Functions 显示 0 / 100 万请求、0 / 50 万 GB-s。这是当时额度视图，不是新接入后零费用承诺或实际函数运行成功证据。
- 项目设置：Vite，根目录 ./，输出 dist/client；安装命令 `npm ci && mv next.config.ts next.config.tencent.ts`；编译命令 `mv next.config.tencent.ts next.config.ts && npm run setup:assets && npm run build:tencent`；Node 24.18.0 是构建版本，不等于云函数运行时版本。
- 生产关联 main 且自动部署开启；预览分支自动部署关闭。不得用未经验证的 main 提交试验传输层；预览需显式发布。
- 当前环境变量列表为空。控制台描述环境具有独立变量范围；公开 Makers SDK 文档关于项目级变量的描述与 UI 不完全一致，实际写入前必须核对作用范围，不推断预览变量已隔离。
- [CloudBase 登录方式](https://tcb.cloud.tencent.com/dev?envId=env-d1g2bv5sn355fc36e#/identity/login-manage)：the-living-wall 独立个人版，允许匿名登入开关关闭。本轮未开启、未创建用户或密钥。
- CloudBase 安全管控显示环境 QPS 500、单函数限频列表为空；环境设置的“QPS 超限按量”未开启。它与之前套餐页的“超额使用”是不同设置，不相互替代，也不是费用硬上限。

## 接入候选与尚缺的验证

首选验证：保留主站静态托管，浏览器通过官方 Web SDK 调用 CloudBase 业务云函数，由云函数访问已有数据库。官方提供[匿名登录](https://docs.cloudbase.net/authentication-v2/method/anonymous)、[安全来源](https://docs.cloudbase.net/envconfig/security/intro)和[函数级权限](https://docs.cloudbase.net/cloud-function/security-rules)。这与把自有域名绑定到 CloudBase HTTP 网关不同；仅有公开文档不代表当前环境已可用。

- 业务仍凭独立邀请/参与者令牌决定能否读取或回复，不把匿名 SDK 身份或显示称呼当作消息访问权限。
- 当前服务是同源 HTTP 适配器。不能让客户端自行填入“可信 Origin”来替代来源校验；需要独立 SDK 入口和明确的认证边界，复用事务、角色验证、版本检查、幂等及限流。
- 数据库集合维持禁止客户端直读写；清理函数维持禁止客户端调用。只评估具体业务入口，不放开整个环境的函数权限。
- 当前匿名开关关闭；来源白名单、SDK 版本对应的网关策略、匿名限频及 MAU/资源用量影响仍需验证。SDK 初始化失败不算服务端 ACL 通过。
- 此路径尚未实施或打通，不承诺免配置、零费用或可直接正式上线。按 AGENTS.md，云端权限扩大要在代码和测试方案可审阅后取得具体确认，本次不提前改变开关。

备选：现有 EdgeOne Cloud Functions 经官方服务端 SDK 调用 CloudBase。平台有[Node 函数能力](https://pages.edgeone.ai/document/node-functions)，但当前项目并无已验证的 CloudBase 服务端凭证；需要最小权限凭证或受支持的身份机制、运行时适配及额外的请求费用核验。现有加速区域不含大陆，默认海外函数处理聊天内容会增加境外处理环节，应在选择部署地域与数据流前明确评估，不默默采用。不要把管理凭证放进网页或复制 CLI 登录凭证用作线上配置。

## 下一步顺序

1. 先在 #88 的现有 OpenSpec 明确 SDK 传输、来源和认证边界，再在隔离分支实现最小验证，本地验证凭证、错误映射、正文保护、并发与重复请求。保持原生产及现有测试路由不变。
2. 准备具体业务函数的权限差异、来源配置及回退清单；代码可审阅后，再确认必要的云端访问权限变更。未获确认不打开匿名访问或新增密钥。
3. 仅用虚构数据在预览来源完成创建、首次邀请、接受、双向回复、刷新恢复及直接访问数据库/清理函数拒绝验证；比较普通使用与限流时体验。
4. 可行后补齐验证证据并接入主站正式页面，按最终提交和来源回归。不可行则记录具体错误，再比较服务端方案，不自动返回购买资源路径。
5. 保留既有备份/平台日志保留、最终浏览器恢复及其他未完成验收；本次更正部署方向不将其标记通过。PR 保持 Draft。
