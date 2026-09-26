# GitHub 协作保障

本文件说明如何落实 [协作约定](../AGENTS.md)。分支模型保持 `main + 短期任务分支`，规则、CI 与 GitHub 设置分别维护。

## 当前状态与完成条件

Issue [#30](https://github.com/the-living-wall/The-Living-Wall/issues/30) 的初始检查（2026-09-17）：`main.protected=false`、仓库 rulesets 为空；执行账号 `livehighhigh` 有 push 权限，无 admin 权限。此记录是检查时的快照，不代表之后的实时状态。

配置文件入库或 PR 合并均不会自动启用分支保护。管理员完成设置并读取验证结果后，在 #30 记录证据；其余验收也完成后才能关闭 Issue。

## 管理员启用 main 保护

目标配置是 [.github/main-branch-protection.json](../.github/main-branch-protection.json)：必须走 PR，必需检查 `test / typecheck / build` 成功且分支基于最新 `main`，解决审查讨论，禁止强推和删除，管理员同样受约束。

审批人数为 0，保留常规 PR 自检后自行合并的政策；人类负责结果验收、范围决策和进度管理，AI 负责实现与验证证据。权限扩大、生产数据删除或迁移、不可逆操作、费用、对外承诺和用户指定复核项须人类确认，由协作规则与 PR 模板落实；当前配置不自动识别变更类型。无管理员绕过例外。不强制线性历史，以保留有说明的 merge 选择。

由仓库管理员在本仓库根目录执行：

```sh
# 确认当前账号有管理权限；先检查已有保护和 rulesets。
gh api repos/the-living-wall/The-Living-Wall --jq .permissions
gh api repos/the-living-wall/The-Living-Wall/branches/main/protection
gh api repos/the-living-wall/The-Living-Wall/rulesets

# 先确认一次 PR CI 已成功报告下述同名检查。
gh pr checks <PR编号> --repo the-living-wall/The-Living-Wall

# 应用已审阅配置（需要仓库 Administration 写权限）。
gh api --method PUT repos/the-living-wall/The-Living-Wall/branches/main/protection --input .github/main-branch-protection.json

# 读取并核对结果，不使用强推或删除主分支来测试。
gh api repos/the-living-wall/The-Living-Wall/branches/main --jq .protected
gh api repos/the-living-wall/The-Living-Wall/branches/main/protection
```

若已有保护或 rulesets，先比较再应用，不能用本配置覆盖更严格的约束。读取保护返回 404 也可能是权限不足，应结合管理员权限、分支 `protected` 与 rulesets 判断。

验收：`protected=true`；保护响应中的必需检查名称、`strict`、审批政策、管理员约束、禁止强推/删除及讨论解决要求与配置一致。在 PR 页面确认必需检查被识别，无等待不存在检查的情况。

CI 工作名为兼容保护设置暂保留 `test / typecheck / build`，实际包含 test、typecheck、lint、资源准备和 build。改检查名时必须协调更新保护设置。当前 CI 验证默认构建，不据此声称腾讯云或其他目标环境构建、部署已通过。

## 合并与分支清理

普通独立任务默认 squash，但暂不禁用仓库的其他合并方式。保持自动删除分支关闭：有堆叠 PR 时按 AGENTS.md 先处理 base；确认没有未合入提交及其他工作区使用后，再人工删除任务分支。

## 发布记录

预览可使用任务分支；生产默认使用已合入 `main` 且验证通过的提交。例外按 AGENTS.md 记录原因、负责人和验证证据，以及修复如何回合主线；涉及需人类确认的影响时先取得确认。同一环境串行部署；紧急回退也记录实际回退产物及验证。

在对应 Issue/PR 留存：环境及入口、部署提交 SHA、操作者和时间、目标构建命令及产物标识、上线验证结果、可恢复的上一版本及回退操作。分支名会移动，不能单独充当发布版本。标签可辅助定位，但仍须确保回退产物实际可用。

## 参考

- [GitHub Flow](https://docs.github.com/en/get-started/using-github/github-flow)
- [GitHub 分支保护 API](https://docs.github.com/en/rest/branches/branch-protection#update-branch-protection)
- [Git push 与 force-with-lease](https://git-scm.com/docs/git-push)
