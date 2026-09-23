# 发布准备：云端验证第二版

2026-09-23，Refs #88 / Draft PR #91。操作者：Codex。只使用本轮生成的合成内容；不重复要求用户整轮人工走查，不代表生产发布。

## 环境及改动边界

- 独立环境：`the-living-wall` / `env-d1g2bv5sn355fc36e`，上海；正常 CLI 授权有效。
- 公共页面仍为前端源 `6e148f104c59a6d057ec6bbfa0befa94fad806ad`，API/清理函数仍为后台源 `7e30d0bed878bcd570d538dd79484f15e3a4f75e`。本轮没有覆盖应用代码或切换公共路由。
- 将现有 API 发布为不可变函数版本 `1`，描述 `release-prep-v2-coldstart-check`，平台创建时间 2026-09-23 18:21:13，用于直接调用和冷启动验证。版本保留；公共路由仍指向原函数配置。此操作不是前端部署或生产发布。
- 两个临时 SDK 探针页面已删除，托管列表为空；两个客户端探针 ID 在两集合中均不存在。见 [页面清理](temporary-pages-after-cleanup.json) 和 [探针无残留](client-probes-absent.json)。未读取用户已有对话。
- 两个复现脚本入库；原运行采用递归创建输出目录，入库时改为拒绝已存在的证据目录，避免覆盖历史。业务步骤不变，未为这一目录保护重复发起云端测试。

## 到期清理：两次周期边界通过

[原始观察](lifecycle.json)。创建两份合法完整心意，核对正文后，只把本轮 ID 的期限和对应配额项调整至分钟边界前后各 5 秒。未主动调用清理函数；回读定时器为每分钟启用。

- 两份到期前均返回 200；到期后的首次访问均返回 404。
- 两份活动库记录首次确认消失的时间上界分别为到期后 **13.624 秒、57.643 秒**，均在一分钟内。
- 第二份到期后，活动库中仍短暂存在但 API 已拒绝读取，区分了访问失效与后台删除。
- 时间为客户端请求区间，保留服务端 Date；不能将两个样本外推为长期最坏延迟保证，也未证明备份物理删除。
- 定时器清理已发生；脚本最后只核对本轮 ID 并清除其配额残项。

复现（已授权 CLI，指定新的输出子目录，父目录须存在）：

```sh
TCB_CLI=/path/to/tcb QA_OUTPUT=outputs/new-lifecycle-run node prototypes/live-gift/qa-cloud-lifecycle.mjs
```

## 冷启动恢复：云端 API 层通过

[原始结果](recovery.json)。公网创建、认领、回复并共同确认纪念，然后直接调用不可变版本 `1`，核对原状态、继续回复，再从现有公共路由重试相同操作 ID。

- 平台记录 `Coldstart: 677ms`，请求 ID `3d095d8b-9573-4f44-b916-3a54e58d6b08`，不是通过刷新页面推断冷启动。
- 原消息、revision、共同记录保持一致；旧的双方凭证仍可使用；新版本写入从原路由可见，重复操作只保留一条，纪念未丢失。
- 合成心意最后删除返回 200。
- 此项通过的是实际冷实例的 API 持久恢复。用户先前两台设备基本收发已经通过，但本轮没有在原来的两个物理浏览器里重复冷启动后的操作；最终来源浏览器补验仍保留，任务 3.4 不冒称全部完成。

复现需要已经存在的不可变版本；已暖版本不一定出现冷启动，脚本会报告 `partial-no-coldstart-evidence`，不能算完整通过。不会自动发布版本或改路由：

```sh
TCB_CLI=/path/to/tcb QA_FUNCTION_VERSION=1 QA_OUTPUT=outputs/new-recovery-run node prototypes/live-gift/qa-cloud-recovery.mjs
```

## 客户端权限：证据仍不足

固定官方 `@cloudbase/js-sdk@3.10.1`，无登录或管理凭据，对两个集合的精确合成 ID 尝试读写，并以非 Timer 数据调用清理函数。

- [Node 入口结果](client-node.json)：均为 `MISSING_CREDENTIALS`。
- [浏览器初次结果](client-browser-first-attempt.json)：错误格式化遗漏字符串异常，保留为失败方法记录。
- [浏览器改正后的结果](client-browser.json)：均为 `credentials not found`；[探针源码](client-probe-source.txt)。
- 这些是 SDK 前置拒绝，不能证明服务端安全规则实际执行。QA-05 保持未完成；没有为测试启用匿名登录、公开集合或增加客户端权限。
- 既有 ADMINONLY / cleanup invoke=false 配置回读及业务 API 越权测试继续有效，但不替代这项缺失证据。

## 备份、日志和正式域名

- [账号回档响应](backup-times.json) 有非空可回档时间范围。官方[备份说明](https://docs.cloudbase.net/database/backup)描述默认备份保留；不能由活动库删除推断所有副本已删除。物理保留和删除承诺仍待确认。
- Invoke Tail 实测包含返回体对应的 `Response RequestId` 行；入库证据已排除这些行，仅保留初始化、开始、结束和统计行。本轮全部为合成内容。[函数配置](function-config.json)的 CLS 标识为空，**不能证明平台没有其他响应记录**。正式真人交流前需核实平台日志内容、保留与可控选项；没有擅自关闭监控或删除日志。参考[平台日志说明](https://cloud.tencent.com/document/product/583/60336)。
- DNS 控制台可读取：主域 `@` 仍 CNAME 至 `thelivingwall.cn.pages.dnsoe4.com.`，TTL 600；另有域名验证 TXT，未见朋友子域。未修改 DNS。
- CloudBase 路由仍为默认来源的静态 `/` 与函数 `/api`，没有正式自定义域名。默认来源首次访问丢失邀请片段的问题仍存在；[自定义域名说明](https://docs.cloudbase.net/service/custom-domain)。
- 备案页需要创建 `Beian_QCSLinkedRoleInDescribeBeianResource` 服务角色才能继续查询；已向用户请求这项具体权限，尚无明确答复，未授权或提交备案。
- 账号自动续费和超额使用仍开启，本轮未更改。网关限流不是费用硬上限。

## 下一步

继续补客户端服务端拒绝证据、备份/日志保留边界和最终来源入口；最终域名确定后验证首次邀请、静态响应头、浏览器恢复及回退。主站 hydration 提示、限流体验及未逐项确认的人体验项目继续见[待验收清单](../PENDING-ACCEPTANCE.md)。保持 Draft，不关闭 Issue，不将记录待办等同于正式发布许可。

## 本轮仓库检查

两个新脚本的 `node --check`、全仓 lint、严格规格校验 10/10、`git diff --check` 通过。既有 creature-audio 归档提示保留。此次只新增复现脚本和文档，未改应用代码；应用测试/类型/构建仍以此前候选和本次最新 CI 为准，不将旧结果记为本轮重跑。
