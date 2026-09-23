# 配额事务争用修复与验证

Refs #88 / Draft PR #91。2026-09-24，代码提交 3abddff。修复上一轮真实六并发时限流计数返回业务409的问题，不调整全站120次/分钟测试阈值。

## 修改边界

只对 allowRequest 的明确 DATABASE_TRANSACTION_CONFLICT 做最多三次尝试，短暂抖动退避，并在每次事务执行时重算分钟桶。耗尽返回503「服务繁忙，请稍后重试」。未提交的配额计数可重试；未知网络错误不重试，留言及共同确认事务不重试，业务版本409不变。

## 本地证据

- 全量107项测试通过；新增覆盖跨分钟计数、最多三次争用耗尽503、未知错误不重试。原始沙箱监听EPERM失败单独保留，授权本机监听后全量通过。
- TypeScript、lint、主站build通过，规格严格校验10/10（既有creature-audio归档提示保留）。初次构建使用错误CLI文件路径而失败，改用包内声明的dist/cli.js后成功，未更改构建配置。
- PRD及OpenSpec设计已同步；不将本地通过等同真实云端容量通过。

## 测试部署

仅更新 the-living-wall / env-d1g2bv5sn355fc36e / ap-shanghai 的 xiaoying-gifts-sdk-probe。代码源3abddff，产物散列见manifest.json；操作者Codex，ZIP部署结果见deploy.log。回读Active、index.sdk、GIFT_SDK_ENABLED=true，见function-readback.json。

原HTTP函数、cleanup、生产主站、权限、来源和收费资源未更改。回退包为 /private/tmp/xiaoying-quota-deploy/rollback（此前d916ba6探针包）；回退时仅重新部署该具名函数，保持当前配置，不回退数据库内容。此为分支测试部署，不是生产发布。

## 真实 SDK 限流结果

北京时间04:26对应UTC20:26:00.503开始，六并发、最多144次无效路径GET探针。实际120次404（通过配额后由业务路径拒绝）后，同批6次429，立即停止。无409、无503；limitedAt=2026-09-23T20:26:40.577Z。首个429 requestId=e0983ee9-ac18-4fb2-e0bd-bda6dd922572。没有修改心意数据。

此时通过真实应用读取已验收心意，界面显示「测试站访问较频繁，请稍后再试」，未显示保存成功。该检查覆盖加载时429提示，不替代发送途中断网草稿恢复的专门验收。

下一分钟20:27:03.360Z读取恢复404（无效路径预期响应），requestId=f3c386a9-8405-492a-ec55-b281e4ca4c2a。随后刷新真实朋友页，测试甲身份、甲乙留言、俏皮和共同记录（1）全部恢复。结果见rate-result.json。此前三轮失败保留；此通过样本不外推大规模并发或正式容量。

修复后同一套12项真实SDK契约回归再次通过（14次调用），见contract-result.json；业务版本冲突409仍正确，未自动重放业务写入。正式容量、发送途中异常草稿恢复、最终HTTPS来源及备份/费用门禁继续保留。
