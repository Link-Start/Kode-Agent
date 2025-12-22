# vNext vs 线上版：差异剖面（Diff Profile）与合并路线（Consolidation Options）

> 输入依赖：  
> - `kode_agent_sdk_design/01_vnext_architecture_audit.md`（vNext 审计）  
> - `kode_agent_sdk_design/02_released_architecture_audit.md`（线上版审计）  
> 目标：把两者差异从“散点对比”升级为“结构剖面”，并提出 2~3 条可落地的合并路线（短期/中期/长期）。

## 0. 一句话总结（差异的本质）

两者的差异不是“工具多不多”，而是 **协议与可靠性模型是否已经升级到能支撑多宿主与长任务**：

- vNext：更接近“长期主线”（统一 progress chunk、ToolResultPayload、pending WAL、provider registry）  
- 线上版：更像“历史可运行版本”（离散 progress event、tool_result:any、pending 不落盘、Anthropic-only provider）

## 1. 差异剖面（按维度总结）

### 1.1 包名与发布形态（Packaging）

- vNext：`name: "kode-agent-sdk"`（`vNext/package.json`）  
- 线上版：`name: "@shareai-lab/kode-sdk"`（但 README 文案大量出现 `@kode/sdk`，存在命名漂移）

影响：
- 生态与迁移会被“包名不一致 + 同版本号 2.7.0”放大混乱；必须在合并路线中明确“哪个是权威包名”与“如何 versioning”。

### 1.2 Core API Surface（核心 API 面）

关键差异（会影响所有宿主）：

- `Agent.send()`：  
  - vNext：`async send()`（因为要写入 pending WAL + persistPendingMessages）  
  - 线上版：`send()` 同步返回 id（pending 仅内存）
- `StreamOptions.kinds`：  
  - vNext：过滤 `ProgressChunk['kind']`（text/thinking/tool_call/done/usage…）  
  - 线上版：过滤 `ProgressEvent['type']`（text_chunk_* / tool:* / done…）
- `ToolContext.agent`：  
  - vNext：`ToolAgentFacade`（最小暴露面）  
  - 线上版：直接传 `Agent` 实例（更强耦合）

结论：
- 如果你要做五端统一底座，vNext 的 API 更利于跨宿主事件转发与后续 kernel 化；线上版若继续演进，几乎必然会走向“补齐 vNext 的这些升级”，等价于重复造轮子。

### 1.3 事件模型（Event Model）

- vNext：progress 统一为 `ProgressEvent{ type:'chunk', chunk: ProgressChunk }`，用 kind/event/index/delta 表达流。  
- 线上版：progress 是多枚举事件（think/text/tool/done 分散）。

影响：
- UI/Host 集成：vNext 更像“统一流”，更容易在 CLI/VSCode/Web/桌面复用同一个渲染状态机；线上版更像“协议碎片”，长期演进会不断追加事件类型并引入兼容分支。

### 1.4 ToolResult / ToolRecord（工具结果与审计）

- vNext：`ToolResultPayload` 标准化（status/error/retryable/metrics/attachments/extra 等）。  
- 线上版：工具结果以 `{ ok?: boolean }` 约定为主，tool_result.content 是 `any`。

影响：
- policy/安全治理：vNext 能做“结构化错误 + 可重试性 + 建议 + 指标”统一处理；线上版更容易出现“工具返回形状不一致 → 错误被当成功”等隐患（MCP isError 是典型例子）。

### 1.5 Store/WAL 与恢复模型（Reliability）

- vNext：Store 接口包含 `savePendingMessages/loadPendingMessages`，JSONStore 对 `pending-messages` 也做 WAL。  
- 线上版：Store 接口不包含 pending messages；MessageQueue 内存队列，crash 会丢消息。

影响：
- 对 SaaS 与桌面/IDE：pending WAL 是“长任务”必备；没有它会把“断线重连、幂等恢复”变成产品级故障。

### 1.6 Provider 系统（模型适配）

- vNext：`infra/providers/*` + `ModelProviderRegistry`，支持 Anthropic/OpenAI/Mock，并把 stream 归一为 `ModelStreamEnvelope(kind=...)`。  
- 线上版：`infra/provider.ts` Anthropic-only，stream 输出为 Anthropic 原始事件类型（content_block_* / message_delta 等）。

影响：
- 多 provider、Key 安全托管（浏览器/前端宿主）、统一 usage/cost/tracing：vNext 明显更接近通用 SDK 的方向。

### 1.7 Tools/MCP（工具与 MCP 接入）

工具层差异相对小（fs/bash/todo/task 基本一致），主要差异在 MCP glue：

- vNext `src/tools/mcp.ts` 同时包含：
  - `createSdkMcpServer/loadSdkMcpServer`（in-process MCP 工具包装）
  - `getMCPTools`（连接外部 MCP server）
- 线上版 `src/tools/mcp.ts` 只有 `getMCPTools`

但两者的共同问题更关键（见 00b）：
- 结果仅 `{ content, isError }`，`isError` 不进入失败路径  
- session isolation 缺失（按 serverName 复用 client）
- 无 roots/elicitation/resources/progress/logging/prompts

结论：
- “把执行面抽到 MCP”这条路，不管你选 vNext 还是线上版，都必须补齐 MCP 适配层；vNext 更适合作为这层适配的承载者。

### 1.8 测试与文档成熟度（Quality）

- vNext：lint + c8 覆盖率门槛 + focused coverage runner、示例更丰富（含 UI/SSE、repo-guardian、listener/actions 等）。  
- 线上版：有较多“设计/迁移”文档（DESIGN_AUDIT_REPORT/MIGRATION_V2.7/ERROR_HANDLING），但整体工程化质量工具链更轻，且 README 与实现存在明显不一致（如 pending WAL）。

结论：
- vNext 更像长期维护的工程姿态；线上版更像“可运行 + 文档说明”但未完全对齐实现。

## 2. 合并路线（2~3 条可行路径）

> 注意：这里先给路线集合，不在本任务里做“最终拍板”（最终结论在 SDK_T06）。

### 路线 A（推荐）：以 vNext 为主线，线上版进入 LTS/Compat

**短期（1~2 个迭代）**
- 冻结线上版：只做 P0 bugfix（安全/隔离/错误映射），不再做能力扩展。
- 在 vNext 上补齐“对外发布的权威包名/README/迁移指南”，避免命名漂移。

**中期（2~4 个迭代）**
- 提供 Compat layer（仅做协议/事件/ToolResult 的适配）：
  - `LegacyProgressAdapter`：把 vNext progress chunk 映射回线上版 progress event（便于旧 UI 继续跑）
  - `LegacyToolResultAdapter`：把 `ToolResultPayload` 映射成旧 `{ ok, error, data }` 形状

**长期**
- 线上版停止维护或只保留安全补丁；所有新能力只在 vNext。

优点：
- 最符合“长期主线演进”的现实：vNext 已经完成关键协议升级。  
风险：
- 需要设计好 compat 的边界，避免“双协议长期并存”拖慢演进。

### 路线 B：双轨并行一段时间（vNext 新能力、线上版稳定生产）

**短期**
- 两个包都发，但明确：线上版用于现有生产系统，vNext 用于新产品线（或新宿主）。

**中期**
- 以“宿主优先级”推进迁移：先迁移 CLI/桌面（最接近 Node），再迁移 VSCode，最后迁移 Browser/SaaS。

**长期**
- 当五端都迁移完成后，线上版退役。

优点：
- 风险可控、不会一次性冲击生产。  
缺点：
- 维护成本高（重复修 bug、重复写文档、生态分裂）。

### 路线 C：抽取 Core Runtime 为新包，vNext/线上版都变为“适配层”

**思路**
- 把“最稳定的核心抽象”抽到一个新包（例如 `@kode/agent-runtime`）：
  - EventBus（统一 chunk 协议）
  - ToolResultPayload
  - Store 接口（含 pending messages）
  - Sandbox/Kernel 抽象（含 session isolation）
- vNext/线上版都只保留各自历史 API 的适配与 re-export。

优点：
- 长期最干净，适合你要服务五端的战略。  
缺点：
- 初期工程量最大，且需要严谨的版本/迁移策略（否则用户会迷路）。

## 3. 本 diff 对后续决策的直接输入（面向 SDK_T06）

在 SDK_T06 里需要明确量化的决策指标（建议权重）：

1) **跨宿主复用性（35%）**：事件协议、ToolResult 标准化、Store/Sandbox 可替换性  
2) **可靠性（25%）**：pending WAL、resume/seal、一致性与幂等  
3) **生态与迁移成本（20%）**：包名/版本、compat、文档一致性  
4) **执行内核外置（20%）**：MCP 适配层改造成本、session isolation 难度

