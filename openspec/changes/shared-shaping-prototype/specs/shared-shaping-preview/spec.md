# Spec Delta

## Purpose

在朋友互动的本地原型中，让两位模拟参与者从明确选取的交流片段出发，主动预览并共同确认小莹的性情与记忆。区分试看、待确认和已生效，保留选择来由，同时保护个人陪伴档案并诚实展示同机演示的边界。

## ADDED Requirements

### Requirement: Local roles and conversation stay explicit
原型 SHALL 明确标记本页模拟两位参与者、没有真实发送、刷新清空；允许切换体验身份并来回留言，选取至少一条真实输入的片段，不自动推断性格或调用 AI。

#### Scenario: Switching the simulated participant
- **WHEN** 用户切换体验身份并提交非空留言
- **THEN** 新留言显示其模拟署名，旧留言保留，切换本身不接受任何提议，试看效果被清除

#### Scenario: Empty source
- **WHEN** 未选取交流片段就尝试提出记忆或性情提议
- **THEN** 原型提示先选择片段，不创建提议

### Requirement: Memory and temperament are independent
原型 SHALL 分别提供「留下这一刻」与「一起塑造小莹」。共同记忆生效不改变主性情；主性情初始保留原样，只能从固定目录或历史选择中主动选择。

#### Scenario: Keeping a moment
- **WHEN** 两个不同体验身份确认同一版本的记忆提议
- **THEN** 增加一条带来源与确认记录的纪念，当前主性情保持不变

### Requirement: Preview never implies agreement
原型 SHALL 将试看和共同生效分开；取消、关闭、切换体验身份或离开朋友视角均清除试看。沉静、俏皮、好奇各有可区分的动作或光感方案，预览状态可辨认。

#### Scenario: Cancel an unsubmitted preview
- **WHEN** 用户预览另一性情后取消
- **THEN** 画面恢复已生效方案，不增加历史或确认

### Requirement: Both roles approve the exact proposal version
原型 SHALL 只保留一项待确认提议；提出者的提交记录自己的选择，只有另一体验身份明确确认同一版本才能生效。修改内容或方案 SHALL 生成新版本、撤销旧确认并把修改者视为新提出者。旧版本操作与重复确认不得再次生效。

#### Scenario: One role tries to accept its own proposal
- **WHEN** 提出者尝试确认自己的待确认提议
- **THEN** 维持原状态，提示等待另一体验身份选择

#### Scenario: A counterproposal replaces prior agreement
- **WHEN** 另一体验身份改选性情或纪念文字并提交
- **THEN** 原确认失效，需要最初的提出者确认修改后的版本

#### Scenario: Stale or duplicate confirmation
- **WHEN** 已修改、撤回或已生效版本的确认被重复提交
- **THEN** 共同性情、记忆和历史均保持不变

### Requirement: Nonagreement preserves the current result
原型 SHALL 允许接收提议的一方选择保持现状，提出者可撤回待确认提议；不显示催促、倒计时、亲密分数或缺席惩罚。预览不因提出提议而成为共同状态。

#### Scenario: Decline or withdraw
- **WHEN** 另一方选择先保持现在，或提出者撤回
- **THEN** 待确认状态清除，原性情与记忆不改变

### Requirement: Results retain provenance and version
生效记录 SHALL 保留来源片段快照、说明、两位确认者、固定表现版本和此前性情。目录中的新方案不得自动覆盖已有选择。恢复历史表现与取消一条纪念 SHALL 作为新提议由双方确认，不能因单方点击立即修改共同结果。

#### Scenario: Restore a prior appearance
- **WHEN** 一方提出恢复历史表现
- **THEN** 原表现继续生效，直到另一体验身份确认；确认后新增历史且保留原记录

#### Scenario: Cancel a shared memory
- **WHEN** 双方确认取消某条现有纪念
- **THEN** 该纪念不再展示为当前共同纪念，原对话不被冒充已删除，性情保持不变

### Requirement: Presentation is isolated and accessible
共同性情 SHALL 只作用于朋友视角的展示，不修改普通成长、亲密度、触摸判定、生产音频或真实成长存档。受惊、恢复、休息时暂停附加动作；减少动态偏好下不播放附加位移/闪动。保留原声音入口，支持键盘、可关闭编辑层和窄屏滚动，不让长内容遮挡操作。

#### Scenario: Return to personal companionship
- **WHEN** 退出朋友视角回到个人陪伴
- **THEN** 停止共同性情展示，基础引擎和个人档案规则不变

#### Scenario: Reduced motion or creature rest
- **WHEN** 用户偏好减少动态或小莹正在休息/受惊/恢复
- **THEN** 不播放附加动作，仍可通过文字了解当前选择并操作确认

#### Scenario: Long content on a narrow screen
- **WHEN** 片段、说明和历史较长
- **THEN** 内容可滚动阅读，关闭、提交、身份切换和原声音控件均可触达且无横向溢出
