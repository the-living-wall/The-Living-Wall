# 主站朋友页发布候选

Refs #88 / PR #91。2026-09-24，操作者 Codex。基于 539de47（已合入 main f1ffc7c），本目录记录随后的 `/friends/` 接入改动。尚未生产发布，既有 SDK 测试函数仍为 3abddff；未购买资源、切换 OPA 或扩大云端权限。

## 已实现及验证

- `npm run build:tencent` 先导出主站，显式启用时再构建 `dist/client/friends/`。两部分使用同一组 VITE 配置；首页入口与朋友页返回个人陪伴使用完整页面导航，避免跨独立应用误用 Next 路由。
- 朋友功能默认关闭；开启必须选择 cloudbase 且提供环境、地域和函数名。缺失配置及 HTTP 回退均在构建前拒绝。关闭后串行重建验证：首页入口和旧 friends 目录均消失，见 artifact-check.json。
- 主站构建、开启和关闭的腾讯静态构建、107 项测试、typecheck、lint、严格规格校验 10/10 通过。CI 新增腾讯完整产物构建，使用不可调用的占位环境验证打包，不在 CI 登录云端或发送消息。
- Chrome 实际从 `http://127.0.0.1:4196/` 点击首页入口进入 `/friends/`，标题正确，创作表单可用，真实 SDK 创建合成心意 `7aace1778f02c9f910fa864124fa678b` 成功；显示“验收甲 / 验收乙”和“正式子路径验证：虚构留言。”。只证明当前本机来源，不冒称正式 HTTPS 通过。
- `/friends/` HTML 有 no-referrer；资源均位于正确子路径。edgeone.json 配置该路径 no-store、no-referrer、nosniff、禁止嵌入；线上响应仍须部署后回读。

## 失败与修正过程

1. 腾讯预渲染首次遇到沙箱本地监听 EPERM。保留 build-tencent-sandbox-failure.log，使用允许本机监听的执行环境后 build-tencent.log 成功。
2. lint 对两个普通 a 导航报 Next 路由规则错误。两处为独立静态应用之间的完整导航，已局部注明理由关闭该单条规则，lint.log 保留原报错，lint-fixed.log 通过。
3. 操作者曾将主站构建与关闭功能构建同时写入 dist，导致回退验证找不到预渲染产物。保留 build-disabled-concurrent-failure.log；随后串行重跑 build-disabled.log 成功。以后同工作区构建串行执行；此为测试编排错误，不以这次失败认定应用故障。
4. 用户中断时，刷新及云控制台跳转未取得最终结果；续做时浏览器工具返回“User unavailable”。没有用推测补写刷新/首次邀请/异常恢复结果，也没有绕过浏览器限制。

## 云端回读与发布限制

- billing-readback.json：现有个人版，2026-10-23 到期，自动续费 true、超额使用 true，环境 QPS 配额 500。QPS 配额不是费用硬上限；未改变这些设置。
- log-config-readback.json：SDK 函数 IgnoreSysLog=false，LogType=normal，LogFormat=tcb-default，CLS ID 为空。之前 Invoke Tail 已实测响应正文，不能声称“没有日志”。官方 SDK 支持 IgnoreSysLog，但会忽略系统日志上报，不能把它描述为只关闭聊天正文；需评估监控替代并验证实际输出。
- 官方数据库文档说明默认自动备份保留 7 天，账号存在可回档范围。这不是“创建后第 7 天所有副本消失”的证据；活动库到期拒绝/清理与备份保留必须分别说明，当前未擅自调整用户的数据承诺。
- 全站 120 次/分钟仍是测试阈值。每个前台页面每 3 秒轮询约 20 次/分钟；6 个页面的读取就会占满阈值，还未计写入。不是公开规模容量验收，不能默默加大限额并假设费用无影响。

依据：[EdgeOne 配置](https://pages.edgeone.ai/document/edgeone-json)、[CloudBase 备份](https://docs.cloudbase.net/database/backup)、[SCF 日志](https://cloud.tencent.com/document/product/583/60336)、[官方函数配置类型](https://github.com/TencentCloud/tencentcloud-sdk-nodejs/blob/master/src/services/scf/v20180416/scf_models.ts)。

## 待执行的生产步骤

1. 完成真实 SDK 发送后响应丢失/草稿重试界面验证，以及最终 HTTPS 来源的首次邀请、第三者拒绝、刷新和冷实例恢复。此前双方人工“测试通过”继续有效，只补变化部分。
2. 明确日志、备份保留及费用/容量方案后，再启用正式来源。现有授权只涉及本机来源；拟新增 `thelivingwall.cn`，不加通配域，不开放数据库和清理函数，不切换 OPA。
3. 按 #70 → #77 → #91 依赖处理 base、同步及最新 CI；主站 main 自动部署已开启，不提前打开朋友构建开关。保持 Refs #88，不能合并时提前关闭 Issue。
4. 主站 EdgeOne 项目 makers-m2bkgxhijig7 的生产构建变量为 VITE_GIFTS_ONLINE=true、VITE_GIFTS_TRANSPORT=cloudbase、VITE_GIFTS_CLOUDBASE_ENV=env-d1g2bv5sn355fc36e、VITE_GIFTS_CLOUDBASE_REGION=ap-shanghai、VITE_GIFTS_CLOUDBASE_FUNCTION=xiaoying-gifts-sdk-probe。均为公开配置，不得放入平台密钥。开启前重新核对实际部署及资源规则。
5. 按 main 确定 SHA 发布后，回读正式 HTTPS 页面/响应头、SDK 冒烟与部署 ID，才登记完成。回退先恢复前一托管部署，或关闭 VITE_GIFTS_ONLINE 并重建；验证已证明能撤下入口和页面。回退不恢复数据库备份，不撤销已删除数据。
