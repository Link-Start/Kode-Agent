# 执行内核（Execution Kernel）MCP 化策略（跨宿主）

> 目标：在不破坏 vNext 的 agentic 编排机制（tool loop / 事件流 / 审批 / WAL / resume/seal）的前提下，把“文件/终端/进程/守护/回滚”等强环境能力外置为 MCP kernels，使 Kode Agent SDK 能服务五端产品，并尽量对齐 Claude Code-like 行为。  
> 参考：本仓库的 `unix_mcp.md` 与 `agent_sdk.md`（更偏“工具箱与 SDK 通用设计”），本文把它们落到“vNext 主线 SDK”的工程边界与接口契约上。

## 0. 结论（先给方向）

1) **推荐路线：Runtime 不动，Kernel 外置**  
   - vNext 保留：`Agent/EventBus/Store/MessageQueue/WAL/resume/seal/Hook/Permission/Todo`  
   - 外置为 MCP kernels：Unix/Browser/VSCode/RemoteWorker 的环境执行面  
2) **MCP 在这里的定位不是“动态工具插件”，而是“可插拔执行内核协议”**  
   - “插件工具”模式（`mcp__server__tool`）可以保留，但不应承载核心文件/终端语义（隔离、审计、恢复会变复杂）。  
3) **会话隔离键与 roots/elicitation/resources/progress/logging/prompts 的利用，是能否做出 Claude Code-like 的分水岭**  

## 1. Kernel 家族（按宿主拆分）

为覆盖你要的五端产品，建议至少有 4 类 kernel（可都用 MCP 协议实现）：

1) **Unix Tools Kernel（必选）**  
   - fs/grep/glob/edit/patch、shell/job/kill/logs、watch、checkpoint/影子 git、资源配额与审计  
2) **Browser Kernel（必选，浏览器扩展）**  
   - tab 管理、DOM/selector 操作、截图、导航、网络请求（受权限约束）  
3) **VSCode Kernel（强烈建议）**  
   - WorkspaceEdit、Diagnostics、Terminal API、Remote workspace 适配（SSH/DevContainer/Codespaces）  
4) **Remote Worker Kernel（SaaS 必选）**  
   - 多租户隔离执行（容器/VM/沙箱），与网关（Next.js）通过 SSE/WS/队列对接

> 关键原则：**不同 kernel 的 state 必须以 session 为边界隔离**（后台进程、watchers、readTokens、权限缓存、plan mode、checkpoint 栈都不能串）。

## 2. SDK / Host / Kernel：职责边界（必须收敛）

### 2.1 什么放进 Kernel（MCP Server）更合适

- 任何“真实会产生副作用/需要强安全裁决”的能力：fs 写、patch 应用、命令执行、后台任务、kill、watch、checkpoint、root 外访问  
- 任何“需要与执行环境同侧才能一致”的状态：进程表、watch registry、readTokens/etag、shadow git/checkout 点、quota 计数  
- 所有可观测事件的权威来源：工具审计、资源变更、job logs、资源配额超限

### 2.2 什么必须留在 Host/Agent builtin（不应塞进 MCP）

- **对话编排与 tool loop**（模型调用、消息队列、断点、resume/seal、context manager）  
- **UI 与审批呈现**（MCP 只能发起 `elicitation/create`，最终 UI 由宿主承接）  
- **plan mode 的交互/呈现**（进入/退出/查看/编辑的 UX 属于 Host；Kernel 只负责强制约束与计划文件资源）  
- **模型 provider 与 system prompt 治理**（避免把 MCP 变成 agent，边界会崩）

## 3. `McpSandbox` / `RemoteSandbox`（接口契约）

vNext 当前的 `Sandbox` 接口偏低阶（`fs.read/write/stat/glob` + `exec` + `watchFiles`）。为了对齐 Claude Code-like 与远端性能，建议采用“两层接口”：

### 3.1 第一层：保持兼容的 `Sandbox`（短期可落地）

用于“不大改 vNext 工具实现就能先跑起来”的过渡方案：

```ts
export interface RemoteSandbox extends Sandbox {
  kind: 'remote'
  session: { id: string; tenantId?: string; workspaceId?: string; rootHash: string }
  transport: { type: 'mcp-stdio' | 'mcp-sse' | 'mcp-ws'; endpoint?: string }
}
```

`McpSandbox` 作为 `RemoteSandbox` 的一个实现：
- `fs.read/write/stat/glob` → `tools/call`（由 Unix Tools MCP 提供对应工具或低阶 API）
- `exec` → `tools/call bash_exec`（短期可先用同步 exec，长期升级 job system）
- `watchFiles` → `resources/subscribe` + `notifications/resources/updated`（由 MCP server 推送变化）

缺点（必须在中期解决）：
- 远端 read 全文件/本地改 patch 会带宽浪费；  
- job/streaming/kill 的语义难以靠 `exec` 低阶接口表达。

### 3.2 第二层：面向 Claude Code-like 的 `Kernel`（中长期目标，强烈建议）

把高阶语义直接做成 Kernel API（或者说：把 “Claude Code tools” 变成 kernel 的权威实现）：

```ts
export interface ExecutionKernel {
  readonly kind: 'local' | 'mcp' | 'remote'
  readonly session: { id: string; tenantId?: string; workspaceRoots: string[] }

  // Files (authoritative)
  readFile(args: { path: string; offset?: number; limit?: number }): Promise<{ content: string; etag?: string }>
  writeFile(args: { path: string; content: string; etag?: string; mode?: 'create'|'overwrite' }): Promise<{ bytes: number; etag?: string }>
  editFile(args: { path: string; edits: any; etag?: string }): Promise<{ applied: number; etag?: string }>
  glob(args: { pattern: string; cwd?: string }): Promise<{ matches: string[] }>
  grep(args: { pattern: string; paths?: string[]; cwd?: string }): Promise<{ matches: any[] }>

  // Jobs / Shell
  run(args: { cmd: string; timeoutMs?: number; background?: boolean }): Promise<{ jobId?: string; code?: number; output?: string }>
  jobLogs(args: { jobId: string; since?: number }): Promise<{ chunks: Array<{ stream: 'stdout'|'stderr'; text: string; t: number }> }>
  killJob(args: { jobId: string; signal?: string }): Promise<{ ok: boolean }>

  // Watch / Resources
  watch(args: { paths: string[] }): Promise<{ watchId: string }>
  unwatch(args: { watchId: string }): Promise<void>

  // Checkpoints
  checkpoint(args: { label?: string }): Promise<{ checkpointId: string }>
  restoreCheckpoint(args: { checkpointId: string }): Promise<{ ok: boolean }>
}
```

这层接口可以：
- 本地实现（CLI/桌面）直接用 Bun/Node  
- MCP 实现（远端/隔离）通过 MCP tool calls 直达 server 的权威实现  

## 4. 会话隔离键（Session Isolation Key）

### 4.1 为什么必须定义“隔离键”

vNext/线上版目前的 MCP client 缓存按 `serverName`（见 00b）会导致：
- 多 agent 串后台任务/订阅/权限状态  
- 多租户串数据（SaaS 事故级别）

### 4.2 推荐的隔离键定义

**最小可用**（适合本地 CLI 单 workspace）：  
`isolationKey = serverName + sessionId`

**推荐**（覆盖五端场景）：  
`isolationKey = serverName + tenantId + workspaceRootHash + sessionId`

其中：
- `sessionId`：一次 agent 会话生命周期 id（断线重连可以复用或生成新 id，取决于 resume 语义）  
- `workspaceRootHash`：roots 归一化后 hash（顺序无关）  
- `tenantId`：SaaS 多租户必带  

硬约束：
- 一个 isolationKey 必须对应**独立 MCP 连接**（或独立 server side SessionContext）。  
- 任何可变 state（jobs/watch/readTokens/permissions/planMode/checkpoints）都必须挂在这个隔离域上。

## 5. 充分利用 MCP 原语（roots/elicitation/resources/progress/logging/prompts）

> 这里的核心思想是：**把 Kernel 的“硬状态”放在 MCP server**，把 Host 的“交互呈现”放在 client，并用 MCP 原语把两者粘起来。

### 5.1 roots（工作区边界）

- Host 是 workspace 定义者（CLI 当前目录 / VSCode workspaceFolders / SaaS per-tenant workspace / browser 选中的 repo）。  
- Kernel 必须“deny-by-default”：只允许 roots 内读写与执行；root 外必须走显式授权（elicitation）。

实现建议：
- SDK 的 MCP client 必须实现 `roots/list` handler：返回当前 session 的 roots（URI）。  
- roots 变更（切换 workspace）时，SDK 触发 `roots/list_changed`（如协议/SDK 支持）或重建连接。

### 5.2 elicitation（审批与问答）

用法定位：
- Kernel 需要用户确认（写文件、exec 命令、进入/退出 plan mode、扩展 roots、危险命令） → 发 `elicitation/create`  
- SDK/Host 弹 UI → 返回 accept/decline/cancel → Kernel 决定继续/拒绝

关键要求：
- **审批不能串 session**：elicitation 必须携带 session scoped id；SDK 必须把回包路由到正确的连接。
- SDK 需要把 elicitation 的 meta 映射到 Host 的权限 UX（批量授权/一次性授权/记住选择）。

### 5.3 resources + subscribe（文件守护 / job logs / plan file）

将 “持续变化的对象”建模为 resources，统一用 subscribe 推送：

- 文件变更：`resource://workspace/file/<path>`  
  - server 检测变更 → `notifications/resources/updated` → SDK 发 monitor.file_changed 并注入 system reminder（Claude Code-like）  
- job logs：`resource://jobs/<jobId>/logs`  
  - server 持续推送增量日志（或提供 cursor 拉取）  
- plan 文件：`resource://plans/<id>`  
  - plan mode 下的唯一可写资源（hard 模式可拒绝其它写）

### 5.4 progress（长任务进度）

`bash_run(background)`/大规模 grep/索引等长任务必须走 progress：
- server 在执行过程中发送 `notifications/progress`（或工具结果带 progressToken）  
- SDK 将其映射为 vNext 的 progress chunk（kind=tool_call 或 monitor log），保证 UI 可实时展示且可回放

### 5.5 logging（结构化日志与审计）

server→client `notifications/message` 用于：
- 审计：每次写/exec 的决策、权限来源、root 解析结果  
- debug：工具内部错误栈、性能统计、quota 命中  
SDK 应把这些进入 monitor 通道并写入 Store（SaaS 可入 trace）。

### 5.6 prompts / initialize.instructions（工具手册与 system reminder 对齐）

Claude Code-like 很依赖“系统提醒”（例如 plan mode active、不要泄露内部提示）。建议：
- Kernel 在 initialize 或 prompts 提供：
  - 工具手册（Tool Manual）
  - plan mode 说明
  - 安全策略声明（roots、危险命令）
- SDK 负责把这些以 **system** 形式注入模型输入（而不是混入 user/assistant 对话），并与 vNext 的 tool manual 注入机制统一。

> 注意：vNext 当前 `collectToolPrompts()` 只支持 string prompt；要充分利用 prompts，需要在 SDK 层补齐 async prompt/远端 prompt 的注入策略（见 00b 与 01）。

## 6. 交互模拟（普通 Agent ↔ Unix Tools MCP，尽量贴近 Claude Code）

### Flow A：连接与初始化（每 session 独立）

1) Host 创建 session（tenantId/workspaceRoots/sessionId）  
2) SDK 建立 MCP 连接（stdio 或 SSE）  
3) server→client `roots/list`（或 client 主动提交 roots）  
4) SDK 拉取 `tools/list`（Kernel API 工具 + 可选插件工具）  
5) SDK 拉取 `prompts/list/get` 或读取 initialize.instructions，注入 system

### Flow B：写文件（含审批与 readToken）

1) 模型请求写入 → SDK 调 `tools/call writeFile`（带 etag/readToken）  
2) server 判定需审批（例如 mutating + 非 bypass）→ `elicitation/create(kind=permission.write, path=...)`  
3) Host UI 展示差异/风险 → 用户 accept  
4) server 执行 write，更新 etag，返回 structured result  
5) SDK 更新本地 ContextState（readTokens、reminder、contextPatches/newMessages）

### Flow C：后台任务（bash_run background + logs + kill）

1) 模型调用 `run{background:true}` → server 返回 `jobId`  
2) server 持续 `resources/updated job logs` 或 `notifications/progress`  
3) SDK 映射到 progress/monitor，Host 实时渲染  
4) 模型调用 `killJob{jobId}` → server kill（只影响本 session）

## 7. 哪些能力“勉强/不应该”放进 MCP（必须明确）

以下能力不建议做成通用 Unix Tools MCP 的内置项（可作为 Host/Agent 的 builtin 或 addon）：

- LLM 采样（MCP sampling）：会让 MCP 从工具箱变成 agent，权限边界与成本控制更难。  
- 多 agent 编排（TaskTool/swarm/team）：属于产品差异化与宿主业务逻辑，放 MCP 会导致“所有接入方都被迫接受同一编排模型”。  
- UI 状态（plan editor、diff viewer、terminal UI）：应由 Host 决定（CLI/VSCode/Web/桌面差异巨大）。  

## 8. 与后续任务的关系

- 本文定义的是“执行内核 MCP 化”的策略与契约；  
- SDK_T08 将在此基础上展开安全/隔离/合规的硬约束（roots/symlink/secret/quota/审计）；  
- SDK_T09 会把 Runtime/Kernel/Host 的最终模块结构定稿，并对 vNext 的现有接口做最小侵入式演进规划。

