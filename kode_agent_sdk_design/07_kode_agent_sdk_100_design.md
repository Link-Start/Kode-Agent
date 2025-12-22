# “100 分”Kode Agent SDK 目标架构（面向五端 + MCP Kernels）

> 本文是“丢掉包袱、面向长期”的目标架构设计（不是现状描述），但要求：**可从 vNext 平滑演进**，不破坏既有的 agentic 运行机制（tool loop、事件流、审批、WAL/resume/seal）。  
> 输入：`kode_agent_sdk_design/00~06*.md` + `issues.md` 复审结论（见 `00b`）。

## 0. 一句话愿景（为什么是“100 分”）

让 Kode 的五端产品（CLI / VSCode / Browser Extension / Desktop / SaaS）共享同一套 **可回放、可恢复、可审计、可隔离** 的 Agent Runtime；同时把所有强环境能力抽象成可插拔的 **Execution Kernels（优先 MCP 化）**，做到：

- Host 只负责 UI 与权限呈现  
- Runtime 只负责编排与状态一致性  
- Kernel 只负责执行与硬裁决（roots/配额/危险命令/隔离）

## 1. 设计目标与硬约束

### 1.1 设计目标（必须同时满足）

1) **跨宿主复用**：同一 Runtime 能在 Node/ExtensionHost/Browser(受限)/Desktop/Server worker 运行（或至少同一 API 面）。  
2) **长任务可靠性**：断线/崩溃可恢复；pending message 不丢；工具中断可封口（seal）；事件可 replay。  
3) **安全默认正确**：deny-by-default、roots 边界、symlink 防逃逸、危险命令治理、配额与 DoS 防护。  
4) **MCP 充分利用**：roots/elicitation/resources/progress/logging/prompts 真正用起来（不仅仅 tools/list+call）。  
5) **多租户隔离**：SaaS 场景下 tenant/session/workspace 绝不串（包括缓存、MCP 连接、后台任务）。  
6) **Claude Code-like 体验对齐**：system reminders、plan mode、read-before-write、后台任务日志、审批 UX 可实现对齐。

### 1.2 关键硬约束（来自现状痛点）

对应 `00b_issues_reaudit.md` 的 P0/P1：

- MCP `isError` 必须进入失败路径（不能被当 success）  
- MCP client 必须按 session 隔离（不能只按 serverName 缓存）  
- read-before-write 对“已存在文件”必须可强制  
- 后台任务必须有 job system（logs/kill/TTL/attach）  
- 并发必须分层：readonly 并发、mutating 串行、file-level lock  
- tool manual / prompts 必须支持 async、且能来自 MCP prompts

## 2. 总体架构（Runtime / Host / Kernel 三分法）

```
┌──────────────────────── Host Adapter ────────────────────────┐
│ CLI UI / VSCode UI / Web UI / Browser UI / Desktop UI         │
│  - 渲染 progress                                                │
│  - 弹出审批（elicitation）                                      │
│  - 定义 workspace roots                                         │
└───────────────▲───────────────────────┬───────────────────────┘
                │                       │
                │ control (elicitation) │ progress/monitor stream
                │                       │
┌───────────────┴───────────────────────▼───────────────────────┐
│                    Agent Runtime (SDK Core)                    │
│  Agent/Session/Room  +  MessageQueue(WAL) + EventBus(replay)    │
│  ToolLoop + Policy + ConcurrencyScheduler + ContextEngine       │
│  Store (pluggable) + Tracing/Observability                      │
└───────────────▲───────────────────────┬───────────────────────┘
                │ tools (semantic)      │ kernels (execution)
                │                       │
┌───────────────┴───────────────────────▼───────────────────────┐
│                 Execution Kernels (prefer MCP)                 │
│ UnixToolsKernel / VSCodeKernel / BrowserKernel / WorkerKernel   │
│  - roots 硬裁决、symlink 防逃逸、quota、dangerous cmd            │
│  - fs/shell/jobs/watch/checkpoint/shadow-git                    │
│  - resources/progress/logging/prompts                           │
└────────────────────────────────────────────────────────────────┘
```

关键：Runtime 与 Kernel 之间的边界必须是“协议/接口”，而不是“直接调用 Node builtin”。

## 3. 核心抽象（TypeScript 契约）

> 这里的接口是“目标 API”，允许分阶段落地（vNext 先兼容 Sandbox，再引入 Kernel）。

### 3.1 Session（隔离与生命周期的一等对象）

```ts
export type TenantId = string
export type SessionId = string

export type WorkspaceRoot = { uri: string; name?: string }

export type IsolationKey = {
  tenantId?: TenantId
  sessionId: SessionId
  workspaceRootHash: string
  kernelId: string // e.g. "unix", "vscode", "browser"
}

export interface AgentSession {
  readonly isolation: IsolationKey
  readonly store: Store
  readonly eventBus: EventBus
  readonly kernel: ExecutionKernel
  readonly policy: PolicyEngine
  readonly tools: ToolRegistry
  readonly model: ModelProvider

  close(): Promise<void>
}
```

设计要点：
- 一切“可能串”的东西（MCP 连接、后台 job、watchers、readTokens、权限缓存）都必须挂在 `AgentSession` 下。
- Host 切换 workspace = 变更 roots = **新 session** 或至少新 isolationKey。

### 3.2 Agent（编排与状态机，不做环境执行）

```ts
export interface AgentRuntime {
  readonly agentId: string
  readonly session: AgentSession

  send(text: string, opts?: SendOptions): Promise<string>
  subscribe(channels?: Channel[], opts?: SubscribeOptions): AsyncIterable<AgentEventEnvelope>
  decide(callId: string, decision: 'allow'|'deny', note?: string): Promise<void>

  resume(opts?: { strategy?: 'auto'|'crash'|'manual'; autoRun?: boolean }): Promise<void>
  snapshot(): Promise<SnapshotId>
  fork(snapshotId?: SnapshotId): Promise<AgentRuntime>
}
```

vNext 已经非常接近这个抽象；主要变化是把“执行面”完全经由 session.kernel（或兼容层）提供。

### 3.3 ExecutionKernel（执行内核：权威执行 + 硬裁决）

```ts
export interface ExecutionKernel {
  readonly kind: 'local' | 'mcp' | 'remote'
  readonly kernelId: string // unix/vscode/browser/worker
  readonly roots: WorkspaceRoot[]

  // Files
  readFile(args: { path: string; offset?: number; limit?: number }): Promise<{ content: string; etag?: string }>
  writeFile(args: { path: string; content: string; etag?: string; mode?: 'create'|'overwrite' }): Promise<{ bytes: number; etag?: string }>
  editFile(args: { path: string; edits: any; etag?: string }): Promise<{ applied: number; etag?: string }>
  glob(args: { pattern: string; cwd?: string }): Promise<{ matches: string[] }>
  grep(args: { pattern: string; cwd?: string; paths?: string[] }): Promise<{ matches: any[] }>

  // Jobs
  run(args: { cmd: string; timeoutMs?: number; background?: boolean }): Promise<{ code?: number; output?: string; jobId?: string }>
  jobLogs(args: { jobId: string; since?: number }): Promise<{ chunks: Array<{ stream:'stdout'|'stderr'; text:string; t:number }> }>
  killJob(args: { jobId: string; signal?: string }): Promise<{ ok: boolean }>

  // Watch / Resources
  watch(args: { paths: string[] }): Promise<{ watchId: string }>
  unwatch(args: { watchId: string }): Promise<void>

  // Governance & State
  checkpoint(args?: { label?: string }): Promise<{ checkpointId: string }>
  restoreCheckpoint(args: { checkpointId: string }): Promise<{ ok: boolean }>
  getPolicyState?(): Promise<any> // debug / audit
}
```

关键点：
- Kernel 必须能表达 job system 与 watch（Claude Code-like 的关键差异）。  
- Kernel 必须 enforce：roots、symlink、防危险命令、quota、plan mode。

### 3.4 PolicyEngine（权限/并发/风险治理）

```ts
export interface PolicyEngine {
  permissionMode: 'auto' | 'approval' | 'readonly' | 'bypass' | 'plan'

  evaluateTool(call: ToolCallContext): { decision: 'allow'|'deny'|'ask'; reason?: string }
  classifyTool(tool: ToolDescriptor): { mutates: boolean; openWorld?: boolean; idempotent?: boolean }

  // Optional: decision caching rules
  cacheDecision?(scope: 'session'|'workspace'|'global', entry: any): Promise<void>
}
```

这层要同时喂给：
- Runtime（决定是否先 ask、如何排队并发）  
- Kernel（最终硬裁决仍在 kernel，但 policy 可参与“预判与 UX”）

## 4. 事件协议（progress/control/monitor + tracing）

### 4.1 统一 Envelope（可路由、可回放、可追踪）

```ts
export type TraceCtx = { traceId: string; spanId?: string; parentSpanId?: string }

export type EventEnvelope<E> = {
  cursor: number
  bookmark: { seq: number; timestamp: number }
  channel: 'progress'|'control'|'monitor'
  trace?: TraceCtx
  session: { agentId: string; sessionId: string; tenantId?: string; workspaceRootHash: string }
  event: E
}
```

vNext 已有 cursor/bookmark；“100 分版本”要把 trace 与 session namespace 变成一等字段（SaaS 必备）。

### 4.2 progress：统一 chunk（对齐 Claude Code-like）

- `text`/`thinking`/`tool_arguments`/`tool_call`/`usage`/`done`  
核心要求：Host 只需要一个“chunk 聚合器”就能重建 UI 状态。

### 4.3 control：统一交互（审批/问答/plan）

- `permission_required` / `permission_decided`  
扩展建议：
- `elicitation_required`（更通用，允许非权限类表单）  
- `plan_required`（进入/退出 plan mode 的专用 UX）

### 4.4 monitor：审计与指标（可合规）

- tool_executed（携带 ToolResultPayload + duration + checkpointId）
- file_changed / todo_changed / agent_resumed / storage_failure / quota_hit / policy_decision

## 5. 工具系统（Tool Catalog / Result Envelope / Concurrency）

### 5.1 工具定义与元数据（必须结构化）

每个工具必须具备：
- name/description/inputSchema  
- **annotations/metadata**：mutates、openWorld、idempotent、readOnlyHint、dangerLevel、resourceCostHint  
- outputSchema（强烈建议，至少对 kernel 工具）

原因：并发调度、审批提示、审计、重试策略都依赖这些元数据。

### 5.2 ToolResultEnvelope（解决 MCP structuredContent / isError / patches）

统一的结果 envelope（无论工具来自本地还是 MCP）：

```ts
export type ToolResultEnvelope = {
  payload: ToolResultPayload
  contextPatches?: Array<any>       // 影响下一轮采样（allowedTools、permissionMode、planMode…）
  newMessages?: Array<Message>      // 需要注入对话的系统/开发者消息
  reminders?: Array<{ type: string; content: string; priority: 'low'|'medium'|'high' }>
  readTokens?: Array<{ path: string; etag: string }>
}
```

必须修复的历史缺陷（来自 00b）：
- MCP 的 `isError` 必须映射到 `payload.status='error'`（否则错误会被当成功）  
- `structuredContent` 必须透传/解析；若没有 structuredContent，至少提供 JSON 文本降级解析

### 5.3 并发模型（Claude Code-like）

建议 Runtime ConcurrencyScheduler：

- 读工具：可并发（grep/glob/read）  
- 写/副作用：串行（write/edit/bash/run/checkout）  
- 同一文件：file-level lock 串行（避免交错覆盖）  
- plan mode：默认禁止副作用工具（或只允许写 plan resource）

Kernel 也必须具备“最后防线”：
- 即使 Runtime 调度失误，Kernel 仍按 mutates/planMode/locks 拒绝或排队。

## 6. MCP 适配层（把协议能力真正用起来）

### 6.1 两种 MCP 接入模式（都要支持，但定位不同）

1) **Kernel Mode（核心）**：SDK 通过 McpKernel 承载环境执行内核（Unix/Browser/VSCode/Worker）。  
2) **Plugin Mode（辅助）**：SDK 通过 `getMCPTools` 动态注册第三方工具（无状态/弱状态），工具名 `mcp__server__tool`。

### 6.2 必须支持的 MCP 原语（对齐 Claude Code-like）

- roots/list：Host 提供 workspace roots，Kernel 硬裁决  
- elicitation/create：Kernel 发起审批/问答，Host 承接 UI  
- resources/list/read/subscribe + notifications/resources/updated：watch、job logs、plan file  
- notifications/progress：长任务进度  
- notifications/message：结构化日志  
- prompts/list/get + initialize.instructions：工具手册与系统提醒来源

## 7. plan mode（进入/退出/限制：对齐 Claude Code 的关键体验）

### 7.1 plan mode 的状态机（建议）

```
disabled
  └─(enter_plan, user_accept)→ planning
planning
  ├─(exit_plan, user_accept)→ executing
  └─(cancel)→ disabled
executing
  └─(enter_plan)→ planning  // 允许回到规划阶段
```

### 7.2 限制策略（软约束 + 硬约束结合）

- 软约束（Claude Code-like）：Runtime 在 system reminder 注入：
  - “当前处于 plan mode：只做只读探索与计划文件编辑，不要执行副作用”  
- 硬约束（更安全）：Kernel 在 planMode=true 时拒绝所有 mutating 工具（或只允许写 plan resource）。

### 7.3 进入/退出的审批

- enter_plan：Kernel 通过 `elicitation/create(kind=plan.enter)` 请求用户确认  
- exit_plan：Kernel 通过 `elicitation/create(kind=plan.exit)` 请求用户审批计划，并可选择后续 permissionMode（default/approval/readonly/bypass）

> 这解决了用户反复追问的“plan mode 怎么进入/退出、怎么限制”的不确定点：进入/退出是明确的 control 流；限制既有系统提醒（软）也有 kernel hard enforcement（硬），两层一致。

## 8. 五端 Host Adapter（差异只留在最边缘）

### 8.1 CLI Host

- 适配：stdio kernel（每 session 一进程）  
- UI：Ink/终端输出，审批弹窗，diff 展示  
- 事件：subscribe progress → 渲染；monitor → 日志/导出 trace

### 8.2 VSCode Host

- roots：workspaceFolders（多根目录）  
- Kernel：优先 VSCodeKernel（WorkspaceEdit/Terminal），必要时连接 remote unix kernel  
- 权限：VSCode UI 承接 elicitation（避免频繁打断）

### 8.3 Browser Extension Host

- Kernel：BrowserKernel（tabs/DOM）+ 远端 UnixKernel（云端或本机代理）  
- 关键：tab/frame isolation 与 session isolation 必须绑定（不同 tab 不串）  

### 8.4 Desktop Host

- Kernel：LocalKernel 或本机 UnixKernel（stdio daemon），可提供更强的本地索引与后台能力  
- 风险：权限更大，必须默认更严格的 policy（readonly/approval）

### 8.5 SaaS Host（Next.js）

- Next.js 只做网关（鉴权/创建 session/事件转发），**不跑完整 agent loop**  
- Agent Worker 常驻/弹性容器：运行 Runtime + Kernel（或连接 Kernel）  
- 多租户隔离：tenantId 强制进入 isolation key 与所有存储/日志/连接 namespace

## 9. 从 vNext 平滑演进（保证“原本运行机制不破坏”）

### 9.1 最小侵入的演进序列（建议）

1) 修 P0：MCP isError 映射、session isolation key、structuredContent 透传（不改 Agent loop）  
2) 引入 Kernel 接口与 McpKernel（先让核心 fs/bash 工具走 kernel，但工具名/语义不变）  
3) 引入 ConcurrencyScheduler（readonly vs mutating + file-level lock）  
4) 引入 plan mode 状态机与 kernel enforcement（先软后硬）  
5) 完成五端 Host adapters 与 SaaS worker 化

### 9.2 兼容层（避免五端重复适配）

- LegacyProgressAdapter（旧 progress event）  
- LegacyToolResultAdapter（旧 ok/data 形状）  
- 保留旧 export path（必要时）并标注 deprecated

## 10. 未决疑点（需要进一步研究/验证）

1) MCP SDK 对 server→client requests（roots/elicitation）与 notifications 的 handler 机制在不同 transport 下的实现差异与可靠性边界。  
2) structuredContent/outputSchema 在 MCP 生态中的兼容性：是否需要“双编码”（structuredContent + 文本 JSON fallback）。  
3) VSCode remote workspace 与 Unix kernel 的最优分工：哪些能力必须在 VSCodeKernel 做（WorkspaceEdit），哪些可以外置。  

