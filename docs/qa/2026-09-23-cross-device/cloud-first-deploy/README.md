# 首次 CloudBase 独立测试部署 · 2026-09-23

Refs #88 / Draft PR #91。部署操作者：Codex，使用用户本人完成的腾讯云官方 CLI 设备授权。应用源提交 `7e30d0bed878bcd570d538dd79484f15e3a4f75e`；本次新增验证脚本、证据和部署记录，未改变已部署应用代码。主站与旧 Pages 内存演示未发布更改。

## 开始最小测试

[独立测试首页](https://env-d1g2bv5sn355fc36e-1301641054.ap-shanghai.app.tcloudbase.com/)

1. 两台设备分别用普通浏览器打开首页，等待并点击腾讯云的「确定访问」。先都完成此步骤。
2. 发送方进入「送给朋友」，填写留言与可选称呼，生成分享链接，将「朋友的邀请链接」发给另一方。
3. 接收方在刚才确认过首页的同一浏览器中打开链接，点击「接受这份心意」，再回复；发送方保持页面打开，通常在下一轮 3 秒轮询后看到回复，网络耗时另计。
4. 测试共同选择：发送方选对话并提议，另一方确认；双方刷新后应仍能找回。
5. 测试完成，发送方在「管理这份心意」删除整份，接收方应无法继续读取。

无需注册。先用虚构称呼和文字；勿从确认过的浏览器切换到微信内置浏览器或无痕窗口，否则相当于新浏览器，需要重新确认首页。邀请只发给预期的一位接收者。

首次直接点击邀请的真实失败仍保留在 run-1、run-2，不能记为通过。平台访问提示页保留查询参数但丢弃 fragment，造成邀请凭证丢失。用户明确选择「先打开首页确认，再打开邀请」作为当前最小测试路径。自定义子域名的一次点击直达仍为待办；DNS 管理 API 返回未授权，未改动域名解析。

## 已运行验证

- run-3：真实云端、两个隔离浏览器上下文（桌面 1280×850 / 窄屏 390×844），三场景通过。安静陪伴→沉静；轻松打趣→俏皮；共同约定→仅纪念、原来的样子。包括主动认领、互发轮询、双方确认、展开记录、刷新、断网保留/重试、不重复发送、发送者删除、接收者失效。无页面异常；窄屏无横向滚动。截图在各场景目录。
- API：首轮真实文档数据库九项检查通过，见 api-results.json：创建幂等、竞争认领、角色隔离、竞争修改版本冲突、服务端角色及重复操作、双方确认、历史署名快照、外域拒绝、发送者删除。
- API 重跑曾被平台返回 429，见 api-repeat-rate-limit-failure.json，未伪记为并发冲突通过；复现脚本降低普通请求节奏（并发用例仍同时发送），不放宽网关限流。降低节奏后九项再次通过，见 api-slower-repeat-pass.json。
- 清理：每分钟 Timer 触发器处于 Available / Enable=1。首次人工过期探针缺少业务 id，清理报错（非正常应用写入）；补齐后未手动再次调用清理函数，后续查询为空，证明后台自动清除。该观测没有测出最坏清理延迟，不宣称已证明一分钟上界。
- 集合 xiaoying_gifts / xiaoying_limits 的权限回读为 ADMINONLY；清理函数的客户端 invoke=false 已回读。未绑定清理 HTTP 路由。真实匿名/登录客户端直读拒绝仍需补证。
- 本地 95/95 测试、类型检查、lint、构建通过；规格 9/9 通过（保留既有 local-sound-events/creature-audio 归档提示，非本任务修改）。

浏览器完整 trace 位于本机 outputs/cross-device-qa/cloud-run-2、cloud-run-3。它们含合成测试凭证，不进 Git；测试截图、结果、命令及日志入库。失败测试残留的两条虚构记录和配额索引已精确清理，成功流程由发送者删除测试心意。

## 重跑

使用项目规定的 Node.js 24 和已安装依赖，在仓库根目录运行：

```sh
QA_ORIGIN=https://env-d1g2bv5sn355fc36e-1301641054.ap-shanghai.app.tcloudbase.com QA_WARMUP_DEFAULT_DOMAIN=true QA_OUTPUT=outputs/cross-device-qa/cloud-new-run node prototypes/live-gift/qa-cross-device.mjs
QA_ORIGIN=https://env-d1g2bv5sn355fc36e-1301641054.ap-shanghai.app.tcloudbase.com node prototypes/live-gift/qa-cloud-api.mjs
```

每次浏览器重跑更换 QA_OUTPUT；API 结果默认输出 outputs/cross-device-qa/cloud-api.json，需按次归档。不要并行运行大量场景以免触发限流。远程模式只测浏览器刷新，不伪称执行了服务器重启；本地模式保留原 SQLite 重启用例。

## 部署配置与边界

- 环境 the-living-wall / env-d1g2bv5sn355fc36e / ap-shanghai / 个人版；文档实例 tnt-4tn13ikbi。其他项目 ai-future-letter 未修改。
- xiaoying-gifts-api：Event / Nodejs20.19 / index.main / 256MB / 15s，GIFT_ENV_ID 与 PUBLIC_ORIGIN 指向本独立来源。
- xiaoying-gifts-cleanup：同包 index.cleanup / 256MB / 60s，定时器 xiaoying-expiry-every-minute，cron `0 * * * * * *`。
- API /api 路由透传原路径，平台总 10 QPS、单 IP 5 QPS；应用全环境 120 请求/分钟。根路径 / 指向 staticstore，配置回读见 routes.json。
- 官方 CLI 3.8.4 的 routes add 预检拒绝默认域名；通过官方兼容 API 创建函数入口，修正路径透传，再用默认域名路由接口创建静态入口。静态上传成功，但 --verify 把带前导 / 的路径误报 missing；列表及真实浏览器确认文件已存在且可加载，不把该命令记为通过。
- 函数包清单 source=7e30d0b；本地交付 zip SHA256=e809a1507dec73ba7a1336b2ecb05adc6735de465f982551dc35ab71c2c84717。CLI 重新打包上传，不能将本地 zip 散列当作云端代码包散列。
- 云端 API 回读有 no-store / no-referrer / nosniff；默认域名拒绝静态路由自定义响应头，因此静态页完整响应头要求未验收，未默默改为通过。
- 账号读取显示自动续费及 EnableOverrun=true（超额使用已开启），本次未修改；请求限额不是费用硬上限。未另购数据库、服务器或升级套餐。
- 数据库返回非空可回档时间段，物理备份最终保留与删除边界仍未确认。七天到期不可访问及活动库清理，不等于保证云平台备份同步销毁。当前仅虚构内容联调，不做私密对话正式上线承诺。

## 未完成与回退

真实两台物理设备、人类审美/听感、函数冷启动或实例切换、最坏清理延迟、客户端直接越权、备份清理边界及静态完整安全响应头仍待验收；保留 Draft，不关闭 Issue。本次验证未同步主站后续音效提交（main 已推进至 623d277），合并前需要按依赖顺序同步并重测。

首次测试部署无上一测试版本；回退时停用本测试页面/API 路由，保留到期清理，不恢复已删除数据，不删除整个环境。源包保持在本机 outputs/gifts 和原工作区 outputs/cross-device-cloudbase，主站不变。
