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
原型 SHALL 仅提供「一起塑造小莹」入口，默认保留现有表现。共同确认后保存纪念，选择新的表现时同时改变主性情。取消纪念不撤销形态或删除原对话。

#### Scenario: Keeping a moment
- **WHEN** 两个不同体验身份确认同一版本的记忆提议
- **THEN** 增加一条带来源与确认记录的纪念，当前主性情保持不变

### Requirement: Preview never implies agreement
原型 SHALL 将试看和共同生效分开；取消、关闭、切换体验身份或离开朋友视角均清除试看。沉静、俏皮、好奇各有可区分的动作或光感方案，预览状态可辨认。

#### Scenario: Cancel an unsubmitted preview
- **WHEN** 用户预览另一性情后取消
- **THEN** 画面恢复已生效方案，不增加历史或确认

#### Scenario: Preview a received proposal
- **WHEN** 用户在待确认提议中选择看看这个样子
- **THEN** 打开独立试看视图以免窄屏阅读内容遮挡小莹；返回提议、关闭或 Escape 均清除试看，保留待确认状态，不提交任何选择

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

#### Scenario: Revise a restoration after editing the original greeting
- **WHEN** 最初赠言已修改或清空，用户从历史提出恢复后继续改选
- **THEN** 编辑层与提交处理均以待确认提议的原片段快照为来源，可额外选取后来留言；不悄悄替换为新赠言，改选后仍由另一身份确认新版本

### Requirement: Presentation is isolated and accessible
共同性情 SHALL 只作用于朋友视角的展示，不修改普通成长、亲密度、触摸判定、生产音频或真实成长存档。受惊、恢复、休息时暂停附加动作；减少动态偏好下不播放附加位移/闪动。保留原声音入口，支持键盘、可关闭编辑层和窄屏滚动，不让长内容遮挡操作。

#### Scenario: Return to personal companionship
- **WHEN** 退出朋友视角回到个人陪伴
- **THEN** 停止共同性情展示，基础引擎和个人档案规则不变

#### Scenario: Reduced motion or creature rest
- **WHEN** 用户偏好减少动态或小莹正在休息/受惊/恢复
- **THEN** v2 不播放附加动作，但保留可辨认的静态光感；v1 保持原有行为，仍可通过文字了解当前选择并操作确认

#### Scenario: Long content on a narrow screen
- **WHEN** 片段、说明和历史较长
- **THEN** 内容可滚动阅读，关闭、提交、身份切换和原声音控件均可触达且无横向溢出

### Requirement: Unified expression and names
原型 SHALL 将开头、正文、给谁和落款放在同一表达区域；已编辑文字不自动被选项替换。称呼可选，最多 20 个 Unicode 字符，空值回退角色名；不承担认证。

#### Scenario: Preserve authored text
- **WHEN** 用户修改正文后切换开头
- **THEN** 正文保留，只有明确选择使用新开头才替换；返回编辑仍保留内容

#### Scenario: Rename after proposing
- **WHEN** 参与者在提议之后修改自己的称呼
- **THEN** 当前留言显示新称呼，待确认来源、历史原文署名及双方姓名快照不变；确认仍按固定角色 ID 判断

### Requirement: Experience rather than quantified shared growth
朋友创作与接收页 SHALL 不显示成长百分比、亲密条或成长大面板；个人页保持原有成长展示。共同记录默认收起，不引入共同等级。

#### Scenario: Conversation without a joint choice
- **WHEN** 用户持续聊天或抚摸小莹但未完成共同确认
- **THEN** 共同性情、纪念和历史不自动增加或变化

### Requirement: Continuous v2 identity during interaction
新增 v2 表现 SHALL 在首帧、静置、靠近和普通抚摸中保持可辨认的不同标记，原 v1 定义不变，历史使用确切版本。

#### Scenario: Interact with a selected temperament
- **WHEN** 用户确认或试看 v2 表现后靠近、抚摸、受惊再恢复
- **THEN** 普通互动保留对应光感与节奏，特殊状态暂停运动但保留静态特征，恢复后仍是所选表现；减少动态时呈现静态特征
