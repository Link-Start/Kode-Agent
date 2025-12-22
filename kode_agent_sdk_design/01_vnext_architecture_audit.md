# Kode Agent SDK（vNext）架构审计报告

> 审计对象：`/Users/baicai/Desktop/MyT/Kode/Kode_SDK/vNext`  
> 审计目标：梳理 Agent runtime（事件总线/消息队列/断点/恢复/封口）、Sandbox/Store/Provider/Tools/MCP/FilePool/Permission 等模块边界与扩展点；评估其是否满足“多宿主 + 外置 MCP 执行内核 + Claude Code-like”路线，并给出可复用点与风险清单。

## 0. 结论（先给清晰、直接的回答）

### 0.1 vNext 是否“符合预期”？（结论）

**符合（作为 Agent Runtime/SDK 的骨架），但不完整（作为多宿主统一底座）**。

- **强项**：vNext 的 Agent Runtime 设计整体成熟：事件三通道（progress/control/monitor）、WAL 持久化、resume + auto-seal、工具调用审计（toolRecords）、权限模式与 Hook 扩展、Todo/Room/Scheduler 等“长任务 agent”常见能力都已具备，并且边界相对清晰。
- **硬缺口**：要支撑你列出的 5 个产品形态，vNext 当前仍然是 **Node-first**（LocalSandbox/JSONStore 默认实现依赖 fs/child_process），MCP 能力也仅停留在 `tools/list` + `tools/call` 的最小层（见 00b 复审）。

因此，如果你的目标是“任意宿主只要挂一个 MCP 就能 100% Claude Code-like”，vNext 的自然定位应该是：

- **保留**：Agent Runtime（编排、事件、状态机、审计、恢复）
- **外置**：执行面（fs/shell/watch/jobs/checkpoint 等）到 MCP Kernels（Unix/Browser/VSCode/Remote Worker）
- **加强**：MCP 适配层（structuredContent、session isolation、roots/elicitation/resources/progress/logging/prompts）

### 0.2 我如何得出结论（方法）

我按“从运行时闭环倒推模块边界”的方式阅读 vNext：

1) 先从 `src/core/agent.ts` 追踪完整闭环：`send → ensureProcessing → model stream → tool_use → tool_result → persist → resume/seal`  
2) 再对照基础设施层：`src/infra/store.ts`（WAL + events）、`src/infra/sandbox.ts`（边界 + exec + watch）、`src/infra/providers/*`（模型适配）  
3) 最后审计工具系统：`src/tools/*`（tool 定义、schema、prompt/manual 注入、task_run、mcp glue）

## 1. 总体架构图（模块边界与数据流）

### 1.1 分层（推荐理解方式）

vNext 基本符合“3 层”结构：

1) **Agent Runtime（编排层）**：`src/core/*`  
2) **Infra（可替换的执行/存储/模型层）**：`src/infra/*`  
3) **Tools（语义工具层）**：`src/tools/*`

对“多宿主统一底座”的含义：
- Runtime 应尽量 host-agnostic（只依赖可替换接口）
- Infra 用接口承接宿主差异（local/remote/mcp/worker）
- Tools 只表达“语义”，最终都应该落到 sandbox/kernel（而不是直接调用 Node builtin）

### 1.2 关键数据流（从 send 到 tool 与恢复）

1) `Agent.send()` 写入 WAL-backed pending queue：`src/core/agent/message-queue.ts` + `Store.savePendingMessages()`（JSONStore 使用 WAL：`src/infra/store.ts:269+`）。  
2) `Agent.ensureProcessing()` 驱动主循环（Agent 内部状态机：`READY/WORKING/PAUSED`，断点状态：`PRE_MODEL/TOOL_EXECUTING/...`，定义在 `src/core/types.ts:22-41`）。  
3) 模型输出走 `ModelProvider.stream()` → `ProgressChunk`（text/thinking/tool_call/usage/done）写入 `EventBus`（`src/core/events.ts`）并可落盘（`Store.appendEvent`）。  
4) tool_use 调用：`executeTools()` 并发派发（`Promise.all + ToolRunner`）：`src/core/agent.ts:1128-1163`。  
5) 每次工具调用都会写入 `ToolCallRecord`（带 auditTrail），并归一化为 `ToolResultPayload`（`normalizeToolResultPayload`）。  
6) 崩溃/中断恢复：`Agent.resume()` 读取 `meta + messages + toolRecords + pendingMessages`，并对未完成 tool call 执行 `autoSealIncompleteCalls()` 生成 synthetic tool_result（封口）：`src/core/agent.ts:665+、1605+`。

## 2. Agent Runtime（`src/core/*`）审计

### 2.1 `Agent`（核心编排 + 状态机 + 审计 + 恢复）

核心职责集中在 `src/core/agent.ts`：

- **状态机**：`AgentRuntimeState`（READY/WORKING/PAUSED）+ `BreakpointState`（PRE_MODEL/TOOL_PENDING/...）用于“可恢复的执行点”。  
- **消息队列**：`MessageQueue` 把用户消息与 reminder 分离，pending 持久化，flush 成功后才清空（避免丢消息）。  
- **工具生命周期**：`processToolCall()` 统一做：schema 校验 → policy/hook/approval → exec → normalize → record/persist → events。  
- **工具审计与可回放**：`ToolCallRecord` 带 auditTrail，完成后 emit `monitor.tool_executed`（携带 payload 与 duration）。  
- **恢复/封口（seal）**：resume 时对未完成工具生成 synthetic tool_result，避免“会话断在工具中间导致模型继续推断副作用”。这点对长任务非常关键。

可扩展点：
- Hooks（`src/core/hooks.ts`）支持 preToolUse/postToolUse/preModel/postModel/messagesChanged，可用于成本控制、策略注入、观测埋点。  
- PermissionMode（`src/core/permission-modes.ts`）支持 register 自定义模式，并提供 serialize/validateRestore（为 resume 做铺垫）。  
- Template Overrides：`AgentConfig.overrides` 可以覆盖 permission/todo/subagents/hooks（`src/core/template.ts`）。

审计发现的结构性问题（与“多宿主”强相关）：
- **工具说明书注入只支持 string prompt**：`collectToolPrompts()` 仅采集 `tool.prompt` 为 string 的情况，忽略 function/async prompt（`src/core/agent.ts:1931-1951`）。这会影响你后续用 MCP prompts 作为 Tool Manual 的能力。  
- **工具并发策略只有全局 concurrency**：`ToolRunner` 是全局队列，不区分 read-only vs mutating、也不做 file-level lock（`src/core/agent/tool-runner.ts`）。要对齐 Claude Code-like 行为需要更细粒度的调度策略（见 00b）。  

### 2.2 `EventBus`（三通道事件流 + replay + 持久化降级）

`src/core/events.ts` 的优点：
- progress/control/monitor 三通道统一 envelope（cursor + bookmark）；
- `subscribe({ since })` 支持 replay；
- 对关键事件持久化失败有“内存缓冲 + retry”降级机制（criticalTypes）。

对多宿主/多租户的启示：
- EventBus 是极好的“Host 路由点”：CLI/VSCode/Web UI 可以只订阅自己关心的通道，把事件转发到 SSE/WS/IPC。
- 但在 SaaS 多租户场景：必须保证 store 的 agentId/tenant namespace 绝不串；否则 replay 会泄漏。

### 2.3 `MessageQueue`（WAL-backed pending 队列）

`src/core/agent/message-queue.ts` 的设计是正确的：
- send 先写 pending，flush 成功后再从内存队列移除；
- restore 时把 WAL 的消息放队列最前面，保证先处理。

这是长期 agent 在“断线/崩溃”下保持一致性的关键。

### 2.4 `ContextManager`（上下文压缩 + 历史窗口 + 文件快照）

`src/core/context-manager.ts` 做了一个可审计的上下文压缩闭环：
- 保存 history window（messages + events + stats）
- 保存 compression record
- 可选保存最近访问文件内容（RecoveredFile）

注意点：
- token 估算是粗略的（char/4），摘要生成也是简单拼接，不调用模型；这更像“可用兜底”，不是“高质量压缩”。  
- 但接口边界清晰：可替换为真实 summarizer（特别是 SaaS 场景）。

### 2.5 `FilePool`（文件读写记录 + watcher）

`src/core/file-pool.ts` 的结构清晰：recordRead/recordEdit/validateWrite/checkFreshness + watchFiles。  
但与 Claude Code-like 语义对齐仍不足（见 00b）：
- `validateWrite` 对未记录的文件返回 `isFresh: true`（如果文件已存在但从未 read，会放行）。

### 2.6 Todo / Room / Scheduler / TimeBridge（长任务生态）

- Todo：`src/core/todo.ts` + `src/core/agent/todo-manager.ts`，能做周期提醒、空列表提醒、并写入 monitor 事件（便于 UI）。  
- Room：`src/core/room.ts` 通过 `AgentPool` 做多 agent 协作，偏 demo，但结构简单可扩展。  
- Scheduler/TimeBridge：`src/core/scheduler.ts` + `src/core/time-bridge.ts`，用于步数/时间/cron 的触发与 enqueue（适合做 repo-guardian、定时巡检类 agent）。

这些组件意味着 vNext 的定位更接近“长任务 runtime”，而不是单次请求 SDK，这与 Kode 产品线是一致的。

## 3. Infra（`src/infra/*`）审计

### 3.1 Store：接口足够通用，但默认实现强依赖 Node FS

`src/infra/store.ts` 的 Store 接口覆盖面很全：
- runtime：messages/toolRecords/todos/pendingMessages
- events：append/read（按通道）
- history：windows/compressions/recovered files
- snapshots：save/load/list
- meta：saveInfo/loadInfo
- lifecycle：exists/delete/list

JSONStore 的优点：
- 统一 WAL 策略（saveWithWal/loadWithWal）
- 目录结构清晰，利于排障与迁移

对多宿主的影响：
- Store 接口是“可替换”的：你可以用 Postgres/Redis/S3/IndexedDB 实现同一接口。  
- 但 JSONStore 本身无法用于 browser extension / edge runtime；如果你要让 Runtime 进浏览器，需要提供 BrowserStore 或 RemoteStore。

### 3.2 Sandbox：接口正确，但默认实现仍是“本地 Node 沙箱”

`src/infra/sandbox.ts` 定义：
- `SandboxFS`：resolve/isInside/read/write/temp/stat/glob
- `Sandbox`：exec/watchFiles/unwatchFiles/dispose
- `SandboxKind` 已包含 `'remote' | 'vfs' | 'docker' | 'k8s'`（为多宿主预留了位置）

`LocalSandbox` 实现特点：
- 边界：workDir + allowPaths + enforceBoundary
- exec：`child_process.exec` + timeout + maxBuffer + 简单危险命令 regex 拦截
- watch：`fs.watch`（文件级）

风险点（后续安全蓝图会展开）：
- `isInside` 基于 path 计算，不做 `realpath`，对 symlink 逃逸不敏感。  
- 对“长时后台任务”不友好：exec 模式没有 job id、流式日志、进程组管理。

### 3.3 Providers：模型适配边界清晰

`src/infra/providers/*` 做到了：
- provider registry（anthropic/openai/mock）
- stream/complete 统一抽象

对多产品的启示：
- VSCode/CLI/桌面可直接运行 provider；  
- Browser Extension/Next.js 网关可能更倾向把 provider 也放到后端（避免泄露 key），Runtime 只消费一个“模型网关 provider”（可作为新 provider 实现）。

## 4. Tools（`src/tools/*`）审计

### 4.1 工具定义机制（schema + descriptor + hooks）

`src/tools/tool.ts` 的模式很适合做“可审计、可治理”的工具系统：
- 参数用 Zod 定义并转换为 JSON Schema（`zodToJsonSchema`）
- exec wrapper 统一捕获异常并返回 `{ ok:false, error }`
- descriptor 里提供 `access`/`mutates` 等 metadata，为 PermissionMode 与并发调度提供依据

### 4.2 Builtin 工具集：fs/bash/todo/task

`src/tools/builtin.ts` 把核心工具分组输出：
- fs：read/write/edit/glob/grep/multi_edit
- bash：run/logs/kill
- todo：read/write
- task：task_run（子 agent）

### 4.3 Task delegation（子 agent）

`Agent.delegateTask()` 支持“工具内创建子 agent 执行任务”，并把 parentAgentId 等 metadata 写入（`src/core/agent.ts:620+`）。

这对 Kode 产品线非常关键：你可以用不同模板/工具集做分工（例如：安全审计 agent、重构 agent、测试 agent），且不破坏主 agent 的上下文与权限策略。

### 4.4 MCP：当前只是一层“工具发现/调用 glue”

`src/tools/mcp.ts` 既支持：
- `createSdkMcpServer/loadSdkMcpServer`（in-process 工具包装）
- `getMCPTools`（连接外部 MCP server，命名空间化成 `mcp__server__tool`）

但现状（见 00b 复审）：
- 仅 tools/list + tools/call
- 结果只返回 `{ content, isError }`
- client/session 以 serverName 缓存，隔离不足
- 无 roots/elicitation/resources/progress/logging/prompts

因此，vNext 的 MCP 目前更像“插件工具”而不是“执行内核协议”。

## 5. 多宿主预留点与阻塞点（vNext 的“通用化体检”）

### 5.1 已经做对的预留点（可复用）

- `Store` 接口足够强：可替换为 RemoteStore/BrowserStore。  
- `SandboxKind` 已含 remote/vfs/docker/k8s：说明路线是对的；只缺实现与契约细化。  
- event bus 三通道 + replay：天然适合 VSCode/Web UI/SaaS 的事件转发。  
- Tool system metadata：为 readonly/mutating、权限与并发治理提供基础。

### 5.2 当前阻塞点（需要明确改造）

1) **Node-first 默认实现**：JSONStore、LocalSandbox 强依赖 node builtin。  
2) **执行面能力不足**：后台任务/job、流式日志、kill、watch 的语义无法对齐 Claude Code-like。  
3) **MCP 适配不够**：不足以作为“通用执行内核协议层”。  
4) **工具手册注入的 async/prompt 能力弱**：无法承接 MCP prompts。  

## 6. 可复用点清单（如果要做“100 分 SDK”）

建议“尽量保留”的 vNext 能力：
- Agent 的工具审计与 auto-seal（封口）逻辑  
- EventBus（progress/control/monitor）与 replay/bookmark  
- MessageQueue + WAL 的幂等模型  
- ToolDefinition + descriptor metadata（作为 policy、并发队列、审批提示的统一输入）  
- Store 接口的覆盖面（只是默认实现需要多形态）

建议“抽离/重写到 Kernel”的能力：
- fs/bash/watch/job/checkpoint/snapshot 等“环境执行面”

## 7. 下一步建议（承接后续任务）

- SDK_T04：对线上已发布版本做同样审计，确认 vNext 与线上差异是否只在组织/文档/测试层，还是 runtime 抽象已分叉。  
- SDK_T05~T06：在两者差异之上做“主线选择/合并路线”。  
- SDK_T07：给出 Kernel（MCP）策略与会话隔离模型，这会决定 Sandbox/Store/Host 需要怎么拆分。  

