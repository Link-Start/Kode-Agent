# Kode Agent SDK：`issues.md` 复审与优先级（面向多宿主 + MCP 执行内核 + Claude Code-like）

> 目标：在“SDK 要同时服务 CLI / VSCode / Browser Extension / Desktop / SaaS(Next.js 网关 + Worker)”的前提下，重新审视 `/Users/baicai/Desktop/MyT/Kode/Kode_SDK/issues.md` 的结论与建议，指出仍然成立/需要修正/需要补充的点，并给出更可执行的优先级与修复落点（Host vs SDK Runtime vs MCP Kernel）。

## 0. 复审范围与总结（先给结论）

### 0.1 结论（清晰直接）

`issues.md` 的大部分判断依然成立，并且在“多宿主 + 外置 MCP execution kernels”路线下**重要性更高**：当前 vNext 与已发布线上版本（`/Users/baicai/Desktop/MyT/Kode/Kode_Dev/Kode-agent-sdk`）的 MCP 支持都属于“最小可用”，不足以承载你规划的 *Claude Code-like* 执行面，也不满足 SaaS 多租户隔离的最低要求。

需要修正/补充的关键点：

1) **“MCP 结果结构丢失 + 错误被当成功”是 P0 级 correctness bug**，不仅影响体验，更会把安全/审批/回滚策略全部绕过。  
2) **“只按 serverName 缓存 MCP client”是 P0 级隔离缺陷**：任何有状态 MCP（后台进程、watchers、权限缓存、计划状态、资源订阅）都会跨 session 串台。  
3) **“read-before-write”不是简单的 `FilePool.validateWrite` 返回值问题**：需要形成“写文件必须具备可审计的前置依据”的策略链（Host+SDK+Kernel 三层一致）。  
4) `issues.md` 里提到的 MCP 原语（roots/elicitation/resources/progress/logging/prompts）确实没用起来；但要注意：其中一部分应当成为 **Host 的责任**（尤其 roots 与审批 UI），SDK 只做桥接与协议统一。  
5) 需要补充：**symlink 逃逸、并发副作用队列、serverless/worker 部署边界、多租户的 trace/审计命名空间**，这些是面向你五端产品时不可回避的“系统性风险”。

### 0.2 我如何得出结论（证据链概览）

我用源码核对了 `issues.md` 的关键断言（至少覆盖 MCP、ToolResult 归一化、并发执行、FilePool、bash 背景任务）：

- vNext MCP wrapper 确实只返回 `{ content, isError }`，丢失 `structuredContent` 等扩展字段，且 `MCPClientManager` 缓存键只用 `serverName`：`/Users/baicai/Desktop/MyT/Kode/Kode_SDK/vNext/src/tools/mcp.ts:108-119, 131-164, 190, 245-257`
- vNext 的 `normalizeToolResultPayload` **不识别** `{ isError: true }`：`/Users/baicai/Desktop/MyT/Kode/Kode_SDK/vNext/src/core/agent.ts:1678-1760`
- vNext 的 `executeTools` 对同一轮 tool_use 采用 `Promise.all` + 全局 runner：`/Users/baicai/Desktop/MyT/Kode/Kode_SDK/vNext/src/core/agent.ts:1128-1163`
- vNext `FilePool.validateWrite` 在未记录 read 时直接 `isFresh: true`：`/Users/baicai/Desktop/MyT/Kode/Kode_SDK/vNext/src/core/file-pool.ts:62-80`
- vNext `bash_run` 的 background 只保存 promise 结果，不流式，且 `bash_kill` 只删 Map 不 kill 进程：`/Users/baicai/Desktop/MyT/Kode/Kode_SDK/vNext/src/tools/bash_run/index.ts:30-58`，`/Users/baicai/Desktop/MyT/Kode/Kode_SDK/vNext/src/tools/bash_kill/index.ts:16-30`
- 线上发布版本 `Kode-agent-sdk` 的 MCP 实现与 vNext 等价（仍为最小 MCP）：`/Users/baicai/Desktop/MyT/Kode/Kode_Dev/Kode-agent-sdk/src/tools/mcp.ts:86-96, 132, 187-199`

## 1. 逐条复审：哪些仍成立？哪些要修正？

### 1.1 MCP 集成不足（`issues.md` 断言：成立，且应升为 P0/P1）

#### A) “structuredContent 被忽略” —— 仍成立（P1），但需澄清其影响边界

- vNext：MCP tool exec 仅返回 `{ content, isError }`，完全不透传 `result.structuredContent`：`vNext/src/tools/mcp.ts:245-257`
- 线上版本：同样只返回 `{ content, isError }`：`Kode-agent-sdk/src/tools/mcp.ts:187-199`

需要澄清的点：
- 如果你只把 MCP 用作“第三方无状态工具”（例如搜索），丢 `structuredContent` 影响可控。
- 但如果你要实现“Unix Coding Tools MCP / Claude Code-like”，你会强依赖结构化结果（例如：文件 patch、可回放的新消息、readTokens、checkpointId 等），此时 **P1 直接升级为 P0（功能不可用）**。

建议修复路径：
- SDK 侧：把 MCP callTool 返回值做成 **可降级**的 envelope：
  - 优先解析 `structuredContent`（若存在）
  - 否则从 `content` 文本中解析/提取结构化 envelope（作为兼容兜底）
- Kernel 侧：为关键工具提供 `outputSchema` 与 `structuredContent`，避免“文本解析协议”成为长期维护成本。

#### B) “isError 不会被当成失败” —— 仍成立（P0 correctness）

原因非常明确：`normalizeToolResultPayload` 只识别 `status/ok/error` 等字段，不识别 `isError`：

- `normalizeToolResultPayload`：`vNext/src/core/agent.ts:1693-1737`
- MCP wrapper 返回：`{ content, isError }`：`vNext/src/tools/mcp.ts:254-257`

结果：MCP tool 即使 `result.isError === true`，也可能被当作 `status: ok` 的 payload，继而：
- tool_call record 可能被标记为成功
- 失败不会触发 retry/rollback/permission re-check
- “错误工具输出”可能直接进入对话上下文，引导模型继续在错误前提下写入文件/执行命令（连锁风险）

建议修复路径（SDK 侧即可彻底解决）：
- 在 MCP wrapper 内改成返回 `{ status: 'error' | 'ok', ... }` 或 `{ ok: boolean, error?: string }`，确保被 `normalizeToolResultPayload` 正确识别。

#### C) “MCPClientManager 是模块级单例且按 serverName 缓存” —— 仍成立（P0 isolation）

vNext：
- 连接缓存键只用 `serverName`：`vNext/src/tools/mcp.ts:131-164`
- `mcpManager` 为模块级变量：`vNext/src/tools/mcp.ts:190`

线上版：
- `const mcpManager = new MCPClientManager()` 同样是模块级单例：`Kode-agent-sdk/src/tools/mcp.ts:132`

在以下任何场景，这都会“天然串”：
- 多 agent 并行（room/pool）
- 多 workspace 同时打开（尤其 VSCode）
- SaaS 多租户并发（同 serverName 的工具箱 MCP 连接必然复用）
- 任何状态ful MCP（后台进程 id、watch id、权限缓存、root 边界、plan state）

建议修复路径（强烈建议按“隔离键”重构）：
- 缓存 key 必须至少包含：`serverName + sessionId + workspaceRootHash (+ tenantId)`  
- 并且 MCP “session 生命周期”应由 SDK Session 管理，而不是工具模块级静态变量。

#### D) “MCP 其它协议原语没用起来” —— 仍成立（P1），但需要明确谁来实现

`issues.md` 提到的 roots/elicitation/resources/progress/logging/prompts，目前 vNext 与线上版都没有把它们连到 runtime。

但这里要把责任分层说清楚（避免把所有能力硬塞进 SDK 或 MCP）：
- **roots**：应由 Host 定义（用户选择 workspace/允许目录），SDK 负责把 roots 传给 kernel（或回应 server 的 roots/list 请求）
- **elicitation**：请求来自 kernel/server，但 UI 必须由 Host 实现；SDK 只负责“协议 → 现有审批/问答机制”的桥接
- **resources subscribe**：非常适合承载 file watcher / indexer / plan state 等“持续变化的资源”，SDK 负责转成 runtime 的 file_changed / reminder 事件
- **progress/logging**：SDK 应统一映射到 progress/monitor 事件流并写入可回放 store
- **prompts**：可作为 Tool Manual 的来源；但为了 Claude Code-like 对齐，SDK 必须能把 prompts 转成“系统提示词注入策略”（不要让 prompts 直接污染业务对话）

### 1.2 Claude Code-like 执行语义差异（`issues.md` 断言：成立，但需要更系统化的修复）

#### A) read-before-write：`FilePool.validateWrite` 的语义需要改（P0 安全/一致性）

现状（vNext）：
- 未被 record 的文件，`validateWrite` 直接返回 `isFresh: true`：`vNext/src/core/file-pool.ts:67-69`

这里需要补充一个“你可能没显式写进 issues.md 的 nuance”：
- **新文件创建**：允许不读直接写（合理）
- **已存在文件覆盖**：不读直接写会绕过“上下文一致性”与“审计依据”，不符合 Claude Code-like 策略

因此，真正需要的是一个更强的 policy：
- 若 `stat(path)` 存在且 filePool 未记录 read → 视为 `isFresh: false`（或直接 `permission_required` / `tool_error`）
- 若 `stat(path)` 不存在 → 允许创建，但应记录“创建意图”并写入审计日志

同时建议把 read-before-write 作为**三层一致策略**：
- Host：UI 上提示“未读就写”的风险 + 一次性授权策略（避免频繁弹窗）
- SDK：FilePool/ToolRunner 在写工具入口做硬检查（可配置）
- Kernel：roots + policy 强制（对 SaaS/远端尤其重要）

#### B) bash 后台任务：目前只是“异步等待”，不是 Claude Code-like 的 job system（P1 功能缺口）

现状（vNext）：
- `bash_run(background)` 返回 `shell_id`，但不支持流式输出、也无法 attach logs：`vNext/src/tools/bash_run/index.ts:30-58`
- `bash_kill` 不 kill 进程，只删 Map：`vNext/src/tools/bash_kill/index.ts:16-30`

建议修复方向：
- 若坚持内置：需要从 `execPromise` 升级为 `spawn` + stdout/stderr 流式 + pid 管理 + 强 kill
- 若走 MCP kernel：把 job system 完整放到 Unix Tools MCP（使用 bun shell + process group + ring buffer logs + lease/TTL），SDK 只保留语义工具（bash_run/bash_logs/bash_kill）。

#### C) 并发策略：存在“副作用工具并发”的风险（P1）

`executeTools` 用 `Promise.all` 并行派发：`vNext/src/core/agent.ts:1142-1151`。即便 `toolRunner` 有全局并发上限，也缺少 Claude Code-like 的关键策略：
- 读工具可并发（fs_read/grep/glob）
- 写/副作用工具应串行（fs_write/fs_edit/bash_run/git_commit 等）
- 同一文件的写必须按文件级队列顺序执行（避免交错覆盖）

这会直接影响“对齐 Claude Code agent”的稳定性与可解释性（尤其在 SaaS 多租户里更致命）。

### 1.3 可移植性：Node 绑定与多宿主目标冲突（`issues.md` 断言：成立）

vNext `LocalSandbox` 绑定 Node `child_process`、`fs.watch`、本地 fs：`vNext/src/infra/sandbox.ts:1-215`。

但 `SandboxKind` 已经包含 `'remote'`：`vNext/src/infra/sandbox.ts:1`，这说明路线本来就是要支持外置执行面（remote/mcp/worker）。

因此 `issues.md` 的建议应当升级为更明确的“架构约束”：
- SDK Runtime 必须 host-agnostic（不能直接 import node builtin）
- 所有环境 I/O 都必须经由 Kernel/Sandbox 抽象注入
- 本地实现只是 kernel 的一个实现（LocalKernel）；Browser/VSCode/SaaS 应主要使用 McpKernel/RemoteKernel

## 2. 优先级（P0/P1/P2）与推荐修复落点

### 2.1 P0（必须先修，否则后续设计都会被“错误前提”污染）

1) MCP `isError` → ToolResultStatus 映射（SDK 层修）  
2) MCP client/session 隔离键（SDK Session 层修）  
3) roots 边界与越界访问（Host 定义 roots + Kernel 强制 + SDK 桥接）  
4) write-before-read 对“已存在文件”的硬策略（SDK 工具入口 + Kernel 双保险）  
5) SaaS 多租户下：所有缓存/日志/进程/订阅的 namespace 化（SDK+Kernel 联动）

### 2.2 P1（对齐 Claude Code-like 的关键能力缺口）

1) structuredContent/outputSchema 支持（SDK 解析 + Kernel 提供）  
2) resources/subscribe → file watcher / job logs / plan state（SDK 映射事件流）  
3) elicitation → permission/问答桥接（Host UI + SDK 协议适配）  
4) 工具并发队列：readonly vs destructive、file-level lock（SDK ToolRunner）  
5) 后台任务 job system：stream logs / kill / TTL（Kernel 更合适）

### 2.3 P2（体验/维护性/成本优化）

1) progress/logging 的统一与可回放（SDK store + trace）  
2) prompts 的标准化注入（减少“手写工具手册”的维护成本）  
3) 更强的危险命令治理（policy + allowlist/denylist + AST 级解析）

## 3. 哪些特性“放进 MCP”合适？哪些应留在 Agent/Host builtin？

### 3.1 强烈建议放进 MCP Kernel（通用、可复用、对齐 Claude Code 的关键）

- fs/shell/process/job/watch/checkpoint/snapshot 等“环境能力”
- 对这些能力的 hard policy（roots 边界、危险命令拒绝、资源配额、审计日志）
- 流式输出与后台任务日志（resources/subscribe 或 server push）

### 3.2 不建议放进 MCP（更应该是 Agent/Host builtin）

- 模型对话编排与 tool loop（Runtime 状态机，需与 UI/Store 紧耦合）
- plan mode 的“进入/退出/编辑/展示”UI 与交互（Host 承接）
- 用户审批策略（ask/allow/deny 的 UX、批量授权、一次性授权），MCP 只发起 elicitation，最终裁决必须由 Host 做
- 多 provider 的模型适配与系统提示词治理（属于 Agent Runtime 的核心能力）

> 关键原则：MCP Kernel 做“执行与裁决”，SDK Runtime 做“编排与可回放”，Host 做“交互与授权呈现”。

## 4. `issues.md` 未覆盖但必须纳入的新增关注点（后续任务要重点研究）

1) **symlink 逃逸**：`SandboxFS.isInside()` 使用 `path.resolve` + `relative`，对 symlink 指向 workDir 外的情况不做 `realpath` 校验（对 SaaS 是硬风险）。  
2) **会话恢复与封口（seal）与外部 job 的一致性**：MCP/remote job 在 agent 断线后如何“封口+续跑/终止/接管”。  
3) **serverless/worker 边界**：Next.js 不能承载长 task loop；需要 gateway + worker + resumable store（已在 00 文档给出需求约束）。  
4) **跨宿主一致的“system reminder / tool manual 注入”机制**：避免在不同产品里重复维护提示词；需要 prompts/skills 的统一来源与注入策略。  
5) **并发下的文件写冲突**：同一文件多个工具调用的原子性/事务性设计（可能与 checkpoint/影子 git 相关）。  

## 5. 立即可执行的行动计划（最小闭环）

1) 先完成 SDK_T03/T04：把 vNext 与线上版的 Runtime/Store/Tools/Sandbox/MCP 边界完整梳理清楚，确认哪些抽象已经存在、哪些需要新建。  
2) 以 P0 为门槛：不先修 `isError` 与 session isolation，就不要开始“把执行面抽到 MCP”大重构（否则 debug 成本爆炸）。  
3) 把“Kernel 能力清单”与“Host 承接点”写成接口契约（SDK_T07），再倒推 SDK 的最小改动面（SDK_T09）。  

