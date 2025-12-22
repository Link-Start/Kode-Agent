# Kode Agent SDK（线上已发布版本）架构审计报告

> 审计对象：`/Users/baicai/Desktop/MyT/Kode/Kode_Dev/Kode-agent-sdk`（README 宣称为 `@kode/sdk`，仓库/包名另见 `package.json`；代码内 `CONFIG_VERSION = v2.7.0`）  
> 审计目标：评估其对“多产品宿主（CLI/VSCode/Browser/Desktop/SaaS）+ 长期维护 + MCP 外置执行内核”目标的适配度，并与 vNext 做结构性对照（差异的系统性原因，而非逐行 diff）。

## 0. 结论（清晰直接）

### 0.1 线上版本是否“满足我们的长期目标”？（结论）

**不推荐作为主线继续演进**（除非你愿意承担一次“协议/类型/持久化模型”的大规模迁移成本），原因是它在三个关键维度上明显落后于 vNext：

1) **事件协议更老**：Progress 由多种离散事件组成（`text_chunk_* / tool:* / done`），不如 vNext 的 `ProgressChunk` 统一 envelope，跨宿主转发与 UI 状态机更难维护。  
2) **工具结果缺少强类型**：`tool_result.content` 是 `any`（`src/core/types.ts`），而 vNext 已统一到 `ToolResultPayload(status/brief/error/retryable/metrics/attachments/extra)`，这直接影响策略/审计/重放的稳定性。  
3) **可靠性缺口**：MessageQueue 不持久化 pending 队列（`src/core/agent/message-queue.ts`），README 中关于“WAL 收件箱”的说法与实现不一致，长任务 crash/重启会丢消息风险更大。

它仍然有价值：作为“可运行的历史版本”用于兼容与回归参考、验证迁移行为、以及对照 API breaking changes。

### 0.2 我如何得出结论（证据链概览）

关键差异来自以下源码事实（仅列最关键的结构点）：

- Progress 事件协议：`src/core/types.ts` 定义 `ProgressEvent` 为多个事件类型，而非统一 chunk；vNext 则在 `vNext/src/core/types.ts` 中引入 `ProgressChunk`（kind=text/thinking/tool_call/done/usage…）。  
- tool_result 类型：线上 `src/core/types.ts` 中 `tool_result.content: any`；vNext 则是 `ToolResultPayload`。  
- MessageQueue：线上版 `MessageQueue` 没有 pending 的 store 持久化；vNext 通过 `Store.savePendingMessages/loadPendingMessages` + WAL 实现幂等恢复（对长任务关键）。  
- Model Provider：线上版 `src/infra/provider.ts` 仅提供 `AnthropicProvider` 且 stream 输出是 Anthropic 原始事件类型；vNext 的 `src/infra/providers/*` 已将 stream 归一为 `ModelStreamEnvelope(kind=text/thinking/tool_call/usage/done)` 并支持 OpenAI/Mock。  
- MCP：线上版 `src/tools/mcp.ts` 仍为 `tools/list + tools/call` 的最小 glue（见 00b 复审）；并且 `isError` 不会触发失败路径。

## 1. 总体架构：与 vNext 的相同点

线上版本与 vNext 的宏观分层一致：

- **core**：Agent / EventBus / FilePool / ContextManager / Permission / ToolRunner / Pool/Room/Scheduler/Todo  
- **infra**：Store / Sandbox / Provider / SandboxFactory  
- **tools**：fs/bash/todo/task + tool/schema/prompt + MCP glue

因此，很多“概念层的设计”是可继承的；问题主要集中在“协议与持久化模型是否已升级到能支撑多宿主 + SaaS 长任务”的级别。

## 2. 关键差异点（与 vNext 的架构演进方向）

### 2.1 Progress 事件协议：离散事件 → 统一 chunk（差异：显著）

线上版 ProgressEvent（`src/core/types.ts`）是：
- `think_chunk_start / think_chunk / think_chunk_end`
- `text_chunk_start / text_chunk / text_chunk_end`
- `tool:start / tool:end / tool:error`
- `done`

问题不在“能不能用”，而在长期维护：
- 每个宿主（CLI/VSCode/Web UI）都要写更复杂的聚合逻辑来还原文本与工具状态；
- 对 SSE/WS 断线重连的 replay 更难做“幂等 UI 重建”；
- 后续想引入更多 chunk（usage、tool_arguments delta、structured tool_call、system reminders）会持续扩展事件枚举，升级成本更高。

vNext 的统一 `ProgressChunk` 本质上是一次“协议升级”，对多宿主与对齐 Claude Code-like 更有利。

### 2.2 ToolResult：`any` → `ToolResultPayload`（差异：显著）

线上版的 tool 结果只要求 `{ ok?: boolean }`，并把任意对象塞进 tool_result：
- `processToolCall()` 通过 `ok` 判断成功/失败（`src/core/agent.ts:1169+`）
- 成功时回 `{ ok:true, data: outcome.content }`，失败时回 `{ ok:false, error, errorType, retryable, data, recommendations }`

这会带来两个系统性问题：
- 不同工具的“语义字段”不统一，审计/回放/策略很难做强约束；
- MCP 等外部工具返回结构稍有不同（如 `{ content, isError }`），很容易走错分支（即使 isError=true 也被当成功）。

vNext 的 `ToolResultPayload` 把“成功/失败/重试/建议/指标/附件”全部规范化，使得：
- policy、UI、审计、重放都可以只依赖 `status/error/retryable/metrics`
- 工具内部可以自由返回任意结构，但最终都归一到统一 envelope

### 2.3 MessageQueue：未持久化 pending（差异：关键可靠性缺口）

线上版 `MessageQueue`：
- `send()` 只是 push 到内存队列；
- `flush()` 成功后从内存里移除；
- **没有** `persistPending/restore`（`src/core/agent/message-queue.ts`）。

这与 README 中“协作收件箱/WAL”表述存在落差，也意味着：
- crash/重启会丢 pending 消息；
- SaaS 多租户长任务的“断线重连、幂等恢复”难以保证；
- VSCode/桌面场景下也更容易出现“用户已提交输入但 agent 不再处理”的体验 bug。

vNext 的 pending-messages WAL 属于“长任务 agent 的必备基础设施”。

### 2.4 Model Provider：Anthropic-only + 原始 stream 事件（差异：可移植性/扩展性不足）

线上版 provider：
- 只实现 `AnthropicProvider`（`src/infra/provider.ts`）
- `stream()` 产出 `ModelStreamChunk`，是 Anthropic SSE 的原始 event types

这导致 Runtime 里会有更多 provider-specific 分支，且不利于：
- 多 provider（OpenAI/其他）适配；
- 把 provider 下沉到“安全后端”（Browser Extension/前端宿主通常不应持有 key）；
- 做统一的 usage/cost 统计与 tracing。

vNext 把 provider 抽象、注册表、normalized stream envelope 都补齐了，更贴近“通用 SDK”目标。

### 2.5 ToolContext 的 agent 注入：强耦合 vs facade（差异：架构洁净度）

线上版在 tool context 中直接传 `agent: this`（`src/core/agent.ts:1062+`），意味着工具能访问 Agent 的更多内部能力。  
vNext 改为 `createToolAgentFacade()`（限制暴露面，避免工具与 runtime 内部状态强耦合）。

对长期维护与“把执行面外置”来说，facade 更优：
- 降低工具对 Agent 内部结构的依赖
- 有利于把工具迁移为“kernel 调用”时维持同一语义 API

### 2.6 Checkpointer：存在但未纳入 Agent 主流程（差异：设计噪音）

线上版本导出 `Checkpointer`/`FileCheckpointer`/`RedisCheckpointer`（`src/core/checkpointer.ts` 与 `src/core/checkpointers/*`），但 Agent 核心执行链路中并未使用它。

这会带来：
- API surface 噪音（用户会误以为这是核心机制）
- 维护成本（需要测试/文档保证与 store/snapshot 的语义一致）

vNext 选择“以 Store + WAL + snapshot 为唯一真源”更利于收敛复杂度。

## 3. 对“多产品宿主 + 长期维护”的综合评估

### 3.1 多宿主适配度（CLI/VSCode/Browser/Desktop/SaaS）

线上版可以支撑 CLI/Node 服务端的 demo，但要成为五端统一底座会遇到更高的迁移成本：
- 事件协议升级（progress event 合并）
- tool_result 协议升级（any → ToolResultPayload）
- pending queue 持久化补齐
- provider registry 与 normalized stream 引入

这些改造都属于“基础协议层变更”，会对生态示例/文档/调用方造成连锁影响。

### 3.2 长期维护与演进成本

线上版当前更像“历史可运行版本”：
- 代码结构清晰，但协议较旧、可靠性缺口明显；
- README 与实现存在不一致点，长期会导致贡献者与用户误判。

相对而言，vNext 已经完成了一次关键的“协议与可靠性升级”，更像你要的长期主线底座。

## 4. 本报告给出的立即行动建议（承接后续任务）

1) 在 SDK_T05 做 vNext vs 线上 diff 时，把“协议升级项（事件/ToolResult/MessageQueue/Provider）”单独作为一类 breaking changes，避免被大量小 diff 淹没。  
2) 在 SDK_T06 决策文档中，把“迁移成本”按五端分别量化（尤其 VSCode/Web/SaaS 侧的事件转发与恢复成本），这会直接影响主线选择。  
3) 如果仍需保留线上版作为兼容：建议把它冻结为 LTS 分支，用于 bugfix 与迁移对照，不再在其上新增能力。

