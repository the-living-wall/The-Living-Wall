# GitHub 访问与 CLI 排查

关联 Issue：[#67](https://github.com/the-living-wall/The-Living-Wall/issues/67)。本说明只固定操作入口，不新增账户权限或改变产品行为。

## 已验证的路径（2026-09-22）

本机 GitHub CLI 已安装在原项目 `.runtime/gh-2.101.0/bin/gh`，未加入 PATH。其既有登录账号是 `livehighhigh`；仓库 API 返回当前账号有 admin/push 权限，且已成功更新 #65、#66 并创建 #67。后续环境和版本可能变化，执行前重新检查。

GitHub 连接器创建/更新 Issue 或 PR 返回 `403 Resource not accessible by integration`。连接器可见安装列表仅列出个人账号 `livehighhigh`，不足以证明组织仓库授权覆盖。CLI 成功不代表连接器修复；Git 推送成功也不能单独证明 API 写入权限。

## 每次任务的最短检查

1. 使用 `command -v gh` 查找命令；未找到时，用 `rg --files --hidden --no-ignore .runtime -g gh` 检查本项目运行目录。隔离 worktree 不一定带有被忽略的 `.runtime`，必要时检查原项目路径。
2. 检查 Git 配置中 `credential.helper`、`credential.https://github.com.helper` 指向的工具路径，只读取配置，不调用凭据导出接口。已验证的本机位置为 `/Users/livehigh/Downloads/ob_sync/102_living_wall/.runtime/gh-2.101.0/bin/gh`；不要假定其他成员机器路径一致。
3. 找到可执行文件后，使用其绝对路径执行 `--version`、`api user --jq .login`、`api repos/the-living-wall/The-Living-Wall --jq '{full_name,permissions}'`。这些命令只输出版本、账号和仓库权限，不输出令牌。
4. 若沙箱报 DNS/网络连接错误，通过正常网络审批重试同一操作；不要把网络限制误报为 GitHub 认证失败。若登录失效，使用正常浏览器登录流程，由用户完成必要的身份验证。
5. Issue/PR 命令显式使用 `--repo the-living-wall/The-Living-Wall`；原项目旧 remote 可能仍指向迁移前仓库，不能仅靠自动推断。

## 写入与验收

- 先查重；创建真实任务，不为测试权限生成无意义 Issue 或 PR。
- 正文写入临时 UTF-8 文件，以 `--body-file` 提交，避免 shell 展开和换行损坏。更新前读取已有正文，保留用户内容。
- 使用已登录 CLI 正常执行 `issue create/edit`、`pr create/edit`；这不要求读取或复制凭据。
- PR 默认面向 main，遵循 AGENTS 的 Issue、隔离分支、验证和合并规则；创建后将 URL 关联到当前任务。
- 写入后回读核对 URL、正文与状态；失败时区分网络、认证、账号仓库权限与 GitHub App 安装权限。
- 如果仅连接器失败，可以使用已验证 CLI 继续已授权工作。不要反复探测令牌、修改 credential helper、扩大权限或绕过审批拒绝。
- 要单独修复连接器，由组织管理员核对实际 GitHub App 安装覆盖、Issues/Pull requests 写权限与待批准权限更新；用户在 GitHub 网页能操作不代表该 App 也获授权。

本次不更改全局 PATH、Git 凭据配置、仓库权限或连接器设置。新环境仍需有效登录；本机可用路径并非永久权限保证。
