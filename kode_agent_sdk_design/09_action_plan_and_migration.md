# 行动计划与迁移路线（2~4 阶段落地）

> 目标：给出一份可以“马上开干”的落地计划，覆盖：五端接入、保持现有 agentic 机制不变、逐步迁移到 MCP kernels、以及发布/版本/迁移策略（含回滚）。

## 0. 总体策略（不破坏 agentic 机制）

1) **Agent Runtime（vNext）保持主循环与事件流不变**：所有改造优先落在 “Kernel/MCP 适配层 + Policy/Concurrency” 这两个可插拔层。  
2) **以 feature flags + compat adapters 去风险**：允许同一版本同时支持 local kernel 与 mcp kernel（按 session 选择），允许旧事件/旧 tool result 通过 adapter 过渡。  
3) **先让 CLI 跑通，再迁移 VSCode/SaaS/Browser**：按宿主复杂度与风险递增推进（见 08 playbooks）。

## Phase 1（基础修复与 MCP 适配层最小闭环）

### 目标

- 修复 `00b` 的 P0：MCP isError 映射、session isolation、structuredContent 透传/解析。  
- 在 SDK 内实现 MCP 的 roots/elicitation/resources/progress/logging/prompts handler 桥接（至少跑通 UnixToolsKernel 的最小形态）。  
- 不改变现有 Agent loop 的外部行为（工具名/事件通道保持一致）。

### 改动范围

- MCPClientManager：由“serverName 缓存”改为“按 isolationKey 缓存/或每 session 独立连接”。  
- ToolResultEnvelope：统一解析 structuredContent，并把 `isError` 映射为 `payload.status='error'`。  
- RootsManager / ElicitationBroker / ResourceSubscriber / ProgressRouter：作为 SDK 模块引入。  
- Tool manual 注入：支持 async prompt / MCP prompts 作为来源（修复 vNext 仅 string 的限制）。

### 验收标准

- 并发 2 个 session 连接同一 MCP server：后台进程/订阅/权限状态不串。  
- MCP tool 返回 `isError=true` 时，Runtime 进入失败路径（toolRecord=FAILED，monitor.error 可见）。  
- roots 外访问默认拒绝，且能通过 elicitation 扩 root（仅 session scope）。  
- progress/logging 能从 kernel 推到 Host UI（CLI demo 可见）。

### 风险与回滚

- 风险：MCP SDK 对 server→client requests 的 handler 在不同 transport 下行为差异。  
  - 回滚：保留旧 `tools/list+call` 路径作为 fallback（不启用 roots/elicitation 等高级能力）。  

## Phase 2（Kernel 化：把执行面从 Sandbox 迁移到 ExecutionKernel）

### 目标

- 引入 `ExecutionKernel` 抽象（见 07）与 `McpKernel/LocalKernel` 双实现。  
- 核心内置工具（fs/bash/watch/checkpoint）改为调用 kernel，而不是依赖 Node 本地执行。  
- 实现 Claude Code-like 的关键语义：job system、file-level lock、mutating 串行、read-before-write（对已存在文件）。

### 改动范围

- 工具实现：`fs_read/fs_write/fs_edit/fs_grep/fs_glob/bash_run/bash_logs/bash_kill` 的执行路径替换为 `ctx.kernel.*`。  
- ConcurrencyScheduler：readonly 并发、mutating 串行、同文件锁。  
- Plan mode：Runtime 注入 system reminders；Kernel hard enforcement（禁止非 plan resource 写/exec）。  
- Checkpoint/shadow-git：Kernel 侧自动 checkpoint + 可恢复。

### 验收标准

- 远端 kernel（MCP SSE）下仍能完成“读→改→测→回滚”的完整闭环。  
- `bash_run(background)` 可 attach logs、可 kill、可在断线后通过 resources/replay 续流。  
- 同一文件两次写工具并发：最终内容一致且可解释（锁生效）。  

### 风险与回滚

- 风险：重构工具实现可能引入行为差异。  
  - 回滚：工具层保留 `legacySandboxPath` feature flag，可回退到旧 sandbox 执行（仅本地）。  

## Phase 3（五端 Host Adapters 落地）

### 目标

按 08 playbooks 接入五端：
- CLI：stdio UnixToolsKernel（每 session 一进程）  
- Desktop：IPC + 本机 kernel  
- VSCode：VSCodeKernel（WorkspaceEdit/Terminal）+ remote unix kernel（必要时）  
- Browser Extension：BrowserKernel + 远端 UnixToolsKernel  
- SaaS：网关 + agent-worker + kernel（同 pod/sidecar）

### 改动范围

- HostAdapter SDK：统一 `EventBridge`、`ApprovalBroker`、`RootsProvider` 接口。  
- VSCode/Browser：实现各自的 roots/approval UI 与事件转发。  
- SaaS：实现 session API（create/resume/decide/events），Worker 运行 runtime。

### 验收标准

- 五端均能：启动 session、流式输出、审批、断线重连、seal 未完成工具。  
- Browser 侧 tab 隔离：切 tab 不串会话状态。  
- VSCode remote workspace：写入必须走 WorkspaceEdit（不绕过编辑器）。

### 风险与回滚

- 风险：各宿主权限模型差异导致 UX 分裂。  
  - 回滚：HostAdapter 保留最小“通用审批 UI”fallback（modal/confirm），逐步增强体验但不阻塞功能。

## Phase 4（发布、迁移与合规强化）

### 目标

- 发布策略落地：vNext 主线（建议新 major），线上版进入 LTS。  
- 提供 Compat adapters（旧 progress/旧 tool result/旧 export path）。  
- SaaS 合规：审计/trace/retention、KMS secrets、quota 与滥用防护。

### 改动范围

- 包名与版本：确定权威包名；发布 `v3`（承载协议升级）。  
- MIGRATION 文档：按五端分别给出迁移指南与示例。  
- 合规与安全：补齐 06 蓝图里的验收条目，并增加自动化测试/压测脚本。

### 验收标准

- 新旧调用方可在一个版本周期内共存（通过 adapters）。  
- SaaS 多租户隔离验收：tenantA 无法读取 tenantB 的事件/文件/日志。  
- 审计可回放：任意 write/exec 都能追溯 decision 与摘要。

### 风险与回滚

- 风险：一次性发布新 major 影响现网。  
  - 回滚：保持 LTS 分支可用；新 major 通过 feature flag 可切回 local kernel（仅 CLI/桌面）；SaaS 可按 tenant 灰度。

## 立即可执行的下一步（建议从本周开始）

1) Phase 1：先把 MCP isError + session isolation + structuredContent 透传做成最小 PR（P0 门槛）。  
2) 同步搭一个“UnixToolsKernel 最小服务”（stdio）用于 CLI demo，验证 roots/elicitation/progress/logging 的协议闭环。  
3) 以 CLI 作为金丝雀：跑通 plan mode + job logs + kill + checkpoint 的最小链路，再扩到 VSCode/SaaS。

