# 朋友互动生产发布过程

Refs #88 / PR #91。操作者 Codex，代表 livehighhigh。此文件记录实际结果，不以配置成功或合并代替生产验收。

## 当前执行范围

用户已在此前确认双浏览器留言、共同塑造及刷新恢复通过，并要求尽快完成生产发布。在 [三项具体决策](../2026-09-24-production-candidate/RELEASE-DECISIONS.md) 后回复「继续行动」，本轮按该范围执行：仅正式来源、指定 SDK 函数日志、关闭超额转按量、说明活动库与平台备份的区别。未授权或执行 OPA 切换、新购资源、其他环境操作、历史日志删除。

## 已完成配置

- 现有环境 env-d1g2bv5sn355fc36e / ap-shanghai：新增单一来源 thelivingwall.cn。第一次 CLI 停在无交互确认未写入，随后明确 --yes 返回成功。原来源保留，未添加通配符。
- ModifyEnvExtra 将 EnableOverrun 设为字符串 FALSE，请求 d496a229-7bdd-404f-88ec-e7101b68366c。回读为 false；个人版及 IsAutoRenew=true 保留，详见 billing-after.json。配额耗尽可能暂停服务；不承诺续费或其他费用归零。
- 仅 SDK 函数部署源96cb15d：状态/耗时诊断不含请求、返回体或正文。回退包为本机 /private/tmp/xiaoying-production-sdk-deploy/rollback-3abddff；不改原HTTP函数及定时清理函数。
- 首次部署代码已更新，但配置阶段报 InvalidParameter：CloudBase UpdateFunctionConfiguration 要求 IgnoreSysLog 为 string，CLI原样传boolean；请求 af52a621-dcff-434c-a2ff-054769a73768。查明 SCF 与 TCB 同名 API 类型不同后，使用官方 TCB 字符串 TRUE 重跑成功。函数 Active，IgnoreSysLog=true，见 sdk-config-after.json。未绕过权限拒绝。
- 新部署真实 Web SDK 创建合成心意 f03ab70423aaf404c89ffeabe2cdf913 成功，页面显示虚构日志验证文本；没有操作用户此前人工验收的心意。

## 日志核对与运维边界

- 管理员无业务凭证 Invoke 返回401，应用诊断 gift-sdk-result/status/durationMs 存在；但即时 Tail 仍包含系统 START/Response/END，不能由开关回读推定所有日志不含正文。请求34503152-a895-4cca-ac46-7cbc0e33e49a。
- SCF旧 GetFunctionLogs 返回0，不能作为无记录证明；TCB同名接口明确报告旧版本不支持（ba81d1e6-c916-4b66-96ce-efd829d61c1a）。
- 当前官方 SearchClsLog 按该函数和部署后时间查询，返回 ResourceNotFound.TopicNotExist（9b0bf329-339b-46fb-b830-f748d8459026）。需要结合控制台核对实际日志存储；不自动创建收费日志资源，也不将未查询到当作隐私验收完成。
- 随后在已登录的当前版 CloudBase 控制台核对：该函数日志页显示尚待「开启日志」，需同意日志付费模式；没有开通日志存储。此证据与 TopicNotExist 一致。没有新增日志资源或同意新计费条款。即时管理员 Invoke Tail 仍可能带返回体，不能称为所有路径绝不出现正文；正式 Web SDK 不启用该管理员调试路径。
- 同一具名函数监控页实际图表仍显示调用次数与资源用量，涵盖05:57部署后的调用；应用固定事件/状态/耗时也已在即时调用中回读。当前可用运行指标及按需诊断，但没有持久应用日志检索能力。不将这一运维限制隐去，不对既有历史日志作删除承诺。
- 依据：[TCB配置参数](https://cloud.tencent.com/document/api/876/137946)、[当前日志查询](https://cloud.tencent.cn/document/api/876/128127)。原始错误保留在本机，入库仅保留不含凭证的结论和请求ID。

## 页面与构建

创建及接受前、交流页右下折叠说明中明确：七天到期不可访问、活动数据清理、平台备份按平台周期清理，删除不意味着所有副本即时消失。保留个人成长本机隔离、朋友保存期限右下方和单一邀请复制入口。

- 108项测试通过；首次编排未把 tsc 加入PATH而中止，见 checks.log，未把后续检查标为已运行。
- 使用锁定CLI入口补跑 typecheck/lint/build/OpenSpec严格10/10通过，见 checks-fixed.log；既有声音规格归档提示保留。
- 完整腾讯主站＋朋友页构建通过，见 build-tencent.log；产物确有保存说明，QA故障注入未进入产物。
- 本机实际浏览器创建页显示完整保存说明及「朋友互动 · 七天到期 · 无站外通知」标签；已创建的虚构心意仍可在本机列表找回。

## 待完成

最终HTTPS来源首访与恢复、安全响应头、依赖PR合入、确定main提交的实际EdgeOne部署及回退版本。正式入口保持关闭，不关闭Issue。

## 合并及托管当前记录

依赖 #70 已解除 #77 的 base 引用并标为就绪，采用 merge commit 保留堆叠历史；#77 已改向 main，分支均保留。#70 head fb9ed00 的 CI 35926790850 已通过。项目动态机器人会因同步更新 main 文档，曾尝试取消仅信息汇总任务35926790853但它已完成，未取消代码CI或修改门禁。

EdgeOne Makers makers-m2bkgxhijig7 控制台回读：main 自动生产部署开启、预览自动部署关闭、生产环境变量为空。最近已知生产 a0fd5c5、部署dprku0pdfvfu（2026-09-24 06:07），仅为后续发布前的回退候选，正式发布前仍核对实际部署。未改变构建变量或DNS。

## 依赖合并与连接故障 · 后续执行

- #70 实际合并提交 1c500092b1ed135b0a96cab2dcf5a67e7a52c44d。#77 已改打 main，#91 先改回 main 后，#77 以 b51e7af9fda1eb58093d383a5b3040fc9df0814f 合并；工作树分支保留。
- #77 同步后 CI 35931343484 的类型检查失败：主线新增 movement 声音分类，原型控件缺少标签和试听映射；补齐与主线/#91 相同的快速移动/move 后，本机类型检查通过。最终 65a66b8 的完整 CI 35932473460 通过。此前失败保留。
- 信息汇总机器人随 PR 更新提交 main 文档，导致反复同步；仅取消对应 65a66b8 的项目动态任务 35932473388，代码 CI 完整运行。没有修改服务器门禁或使用管理员绕过。
- GitHub Git 端点低速超时和 443 连接失败，API 正常。用现有 gh 认证上传本地 Git 对象，核对 tree SHA 与 commit SHA 完全相同才非强制更新引用；#91 的 044dd57 与 1c398fb 均已准确推送。临时上传器最初未正确处理中文路径，在更新引用前退出，改用 NUL 分隔后成功。
- 浏览器 getState、已知控制台 getTab 均超时并重置，已请用户将任务切到前台并重新打开控制台。正式构建变量仍未保存。#91 对新 main 存在待解决冲突，不能合并。
- 两次自动审批等待超时后，按工具允许各重试一次成功；不是权限拒绝或绕过。
