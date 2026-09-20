# 本次联调服务来源

Issue #50 / PR #51 为保证单分支拉取可复现，纳入 2026-09-19 现场使用的 Issue #25 服务子集。来自 `3013038780-design/25-depth-regions` 的提交 `bd167a1`：detector.py、server.py、index.html、guide.mjs、entity.html 及对应测试。保留原始实现，不引入 PR #52 后续手部识别/诊断功能。

核心文件与现场临时副本的 SHA-256 一致：

- server.py: `e2d28b528633a7b505064bea3bc06b01635ade133b2d9e1430b5ddf5ee369419`
- detector.py: `a5fe1f6cad801b39fc6a208c231a79931a9bea2fa78a4a0094c1217b66f746a3`

本分支另增加 test_frontend_contract.py，以真实服务快照通过前端适配器验证协议；test_guide.mjs 仅补 await 以通过主仓库 lint。后续合并 PR #52 时须核对重叠文件，不能用本子集覆盖其新增功能。虚拟环境、SDK 安装产物、设备记录不入库；依赖由 requirements.txt 重建。旧实测记录中的 `.runtime/depth-lab-v2` 表述为当时事实，后续使用本目录服务。
