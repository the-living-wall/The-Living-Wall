# CloudBase 文档数据库测试部署

Refs #88。目标是用户新建的 `the-living-wall` 独立个人版环境 `env-d1g2bv5sn355fc36e`，自带共享文档实例 `tnt-4tn13ikbi`。不得操作 `ai-future-letter`。本目录是待部署包配置，不代表已部署。

## 已准备与未验证

已实现服务端事务、同版本双方确认、幂等请求、独立访问凭证、七天有效期及定时清理适配；本地契约测试模拟 SDK 事务内对象/事务外数组的返回结构及乐观冲突。它们不证明云端事务、权限、触发器或网关已生效。

用户截图确认集合列表可访问且为空；回档提示未开启。数据库物理副本、备份保留未核实，公开采集真人对话前需确认删除边界。先用合成文字验证，不以“没有回档按钮”推断没有备份。

## 构建

在仓库根目录，使用锁定依赖：

```sh
npm run build:gifts
npm run build:gifts:cloud
cd outputs/gifts/cloudbase
npm ci --ignore-scripts --no-audit --no-fund
zip -qr ../xiaoying-cloudbase-functions.zip index.js service.cjs package.json package-lock.json node_modules manifest.json
```

`build:gifts:cloud` 将业务代码编译为 Node.js 20 可运行的 CommonJS，不包含 SQLite。固定 CloudBase SDK 3.18.3；包不含个人凭据。构建清单记录源 HEAD、未提交改动及业务文件散列；依赖完整性由锁文件约束。前端静态产物单独位于 `outputs/gifts/site`。

## 控制台步骤

1. 在上述独立环境创建两个集合 `xiaoying_gifts`、`xiaoying_limits`，均设为客户端不可读、不可写：自定义规则 `{"read":false,"write":false}`。仅后台云函数通过运行角色访问。不要使用公开读写规则，也不需要用户注册。
2. 创建普通云函数 `xiaoying-gifts-api`，选择 Node.js 20.19（或平台提供的兼容 Node 20 版本），上传 zip。入口 `index.main`，初始内存 256 MB、超时 15 秒；使用当前环境运行角色，不在代码/前端填长期密钥。配置 `GIFT_ENV_ID` 为上述环境 ID；`PUBLIC_ORIGIN` 为最终独立 HTTPS 来源（不带路径或末尾斜杠）。入口缺少明确来源时拒绝启动。
3. 同包创建普通云函数 `xiaoying-gifts-cleanup`，入口 `index.cleanup`，仅每分钟定时触发（平台 7 段 cron：`0 * * * * * *`），超时 60 秒；配置相同 `GIFT_ENV_ID`，不绑定 HTTP 路由，不向客户端开放调用权限。需观察平台真实 Timer 事件及执行日志来确认触发；日志不输出对话、请求头或凭证。清理查询 `expires`，按控制台提示创建所需索引。
4. 在独立 HTTP 网关来源下，`/api` 前缀路由到 API 函数，静态页面路由到测试静态托管。实际路径必须保留 `/api/gifts`；启用函数集成响应以保留 statusCode/headers/body。根据平台当前界面配置后，必须通过真实请求核对，不能仅凭配置文件认定成功。若当前默认来源不能组合静态与函数路由，改用明确独立测试域名后再部署，不把主站改为此后台，也不放宽跨域来源。
5. 校验页面与 API 同源、HTTPS、`no-store`、无第三方脚本；静态资源同样设 `Referrer-Policy: no-referrer` 和 `X-Content-Type-Options: nosniff`。创建后地址中的邀请片段会移除；公开邀请只发给预定的一位接收者。

同一代码包不意味着两个函数权限相同；API 只允许 HTTP 请求进入，清理入口只执行到期删除。客户端仍需后台校验的独立 Bearer 凭证；不要公开数据库管理权限。

## 容量与数据

- 单份心意是一个文档：对话、权限散列、共同选择、幂等摘要一起事务提交；删除整份文档即移除这些业务记录，无单独孤立请求表。
- 创建 ID 由高熵管理凭证散列派生，确保响应丢失后重试同一份；ID 不具有管理权限。
- 单份 100 条消息、300 次成功修改、256 KiB 业务状态；全环境最多 1000 份未到期心意、每小时 100 份创建。限额文档只含计数、心意 ID 和到期时间，无正文或称呼。
- 小范围测试全站每分钟最多 120 次 API 请求；限流在数据库事务内，跨函数实例共享。不将费用完全等同于请求限额：恶意请求仍可能触发函数及数据库计费，公网开放前另核对平台入口限流、预算告警及按量设置。
- 每次读取/写入检查七天有效期，定时器负责清理到期文档与配额索引；一次最多清理 1000 份。定时器失败、超时或未配置都不能宣称物理清理已完成；需云端验证一分钟清理目标，物理备份另核实。

## 云端验收与回退

必须补验：空集合初始化、客户端越权拒绝、首次认领与竞争认领、重复操作、双方并发、函数实例切换后读取、来源拒绝、真实定时清理、网关不记录正文与凭证。仍重跑安静陪伴、轻松打趣、共同约定三个场景，两台真机使用不同浏览器凭证；不能将同机隔离上下文称为两台真机。

验证前仅使用明确的合成测试数据；删除仅本任务创建的测试心意。失败时关闭本测试网关路由并回退本函数代码版本，保留清理任务，不恢复已删除或到期数据。不得删除整个 CloudBase 环境或影响其他项目。发布记录写明环境、部署 SHA/包散列、操作者、URL、验证与回退版本。

依据：[事务](https://docs.cloudbase.net/database/transaction)、[HTTP 访问](https://docs.cloudbase.net/service/access-cloud-function)、[普通云函数](https://docs.cloudbase.net/cloud-function/how-coding)。
