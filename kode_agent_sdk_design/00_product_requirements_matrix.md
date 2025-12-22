# Kode Agent SDK：多产品需求矩阵（Design Input）

> 目的：把你列出的 5 个产品形态（CLI / VSCode / Browser Extension / Desktop / Next.js SaaS）对 Agent Core/SDK 的共同需求与冲突约束一次性说清楚，作为后续架构审计与“100 分目标设计”的输入。

## 0. 术语与边界（先统一口径）

- **Agent Core / Runtime**：对话编排 + tool loop + 事件流（progress/control/monitor）+ 状态机（断点/恢复/封口）+ 多 agent（room/pool）。
- **SDK 层**：给宿主（CLI、扩展、Web、桌面、服务端）提供可复用的构建块：Runtime、Tool Registry、Policy/Permissions、Store、Model Provider、Sandbox/Kernel 抽象。
- **Execution Kernel（执行内核）**：承载“文件/终端/进程/守护/回滚”等强环境能力的实现体；可能是本地实现，也可能是远端服务（推荐 MCP 化）。
- **Host（宿主）**：真正的 UI 与权限交互载体（Ink/VSCode UI/Web UI/桌面 UI），以及 workspace 定义者。

> 关键原则：SDK 要能在不同宿主复用，因此 **必须把“编排（Runtime）”与“执行（Kernel）”分离**，并把宿主交互（审批/选择/文件 roots）做成可插拔回调/handler。

---

## 1) 场景需求矩阵（5 产品）

### 1.1 Terminal AI CLI（本地终端）

**环境**
- Runtime：Node/Bun（可控），可 stdio、可本地 spawn
- Workspace：本地文件系统（单/多 repo）

**核心需求**
- 强交互：流式输出 + 工具进度 + 审批弹窗（blocking UI）
- 本地执行：fs/search/shell/bg task/kill/watch
- 安全：默认最小权限、路径边界、危险命令拦截、plan mode
- 恢复：断线/崩溃后可 resume、auto-seal 未完成工具调用
- 可观测：本地日志、可导出 trace

**约束**
- 用户体验必须“零摩擦”：审批逻辑不能重复弹窗
- 终端环境差异大：shell、编码、Windows 兼容性、路径规范化

### 1.2 VSCode AI Coding 插件（扩展宿主）

**环境**
- Runtime：VSCode Extension Host（Node 运行时，受 VSCode API 约束）
- Workspace：可能是本地、SSH Remote、DevContainer、WSL、Codespaces

**核心需求**
- 文件操作需尊重 VSCode 的文档模型（TextDocument/WorkspaceEdit），而不只是裸 fs
- 终端执行可能通过 VSCode Terminal API（而非 child_process）
- 多 workspace folder + roots（workspace 边界）是第一等对象
- UI：审批/提示/计划在 VSCode UI 中呈现（非命令行）

**约束**
- 在 remote workspace 下，“本地 extension host”与“远端文件/终端”存在断层：必须支持 **远端执行内核**
- 插件市场与安全审查：需要可解释的权限请求与审计

### 1.3 Browser Extension（浏览器扩展：读网页 HTML、操作 DOM、tabs）

**环境**
- Runtime：浏览器扩展背景脚本（Service Worker）+ content scripts（页面上下文）
- Workspace：不是文件系统，而是“网页 + 标签页 + 选择的远端 repo/workspace”

**核心需求**
- 浏览器工具：读取 DOM/HTML、选择器操作、点击/输入、滚动、截图、tabs 管理、网络请求（受 CORS/permissions 影响）
- 多上下文隔离：不同 tab/frame 的 tool call 不能串
- 强事件：页面变化快，需要 watch/subscribe（DOM mutation、navigation、tab lifecycle）
- 与代码执行解耦：代码修改/运行通常必须走 **远端执行内核**（例如 Unix Tools MCP 在云端或用户本机）

**约束**
- 无法直接访问本地 fs/终端（除非借助 native messaging 或远端服务）
- 权限模型特殊（host permissions、activeTab、scripting、cookies 等），需要可审计的 approval 流

### 1.4 本地桌面客户端（Electron/Tauri/原生壳）

**环境**
- Runtime：取决于壳（Electron=Node；Tauri=Rust+WebView；原生=自定义）
- Workspace：本地文件系统 + 本地系统资源（可能更大权限）

**核心需求**
- 多 workspace + 项目切换 + 快速索引
- 后台任务：长时间 bash/编译/测试的可靠运行、kill、输出流
- 更强的可观测与稳定性：崩溃恢复、持久化、自动更新

**约束**
- 安全风险更大：需要更严格的 sandbox/policy（尤其是自动执行命令与写文件）

### 1.5 Next.js 线上 TOC 服务（大量用户 / 多租户 SaaS）

**环境**
- Runtime：Node server / serverless / edge（取决于部署）；高并发、多租户
- Workspace：每个用户/会话的隔离环境（临时目录、对象存储、DB）

**核心需求**
- 强隔离：用户 A 绝不能看到/影响用户 B（含缓存、MCP session、后台进程）
- 资源配额：CPU/内存/时长/并发/带宽，防滥用
- 连接与流：SSE/WS，断线重连与幂等（resume）
- 审计与合规：全链路 trace、权限/工具调用日志、可回放
- 可扩展：多执行后端（容器/远端 worker/沙箱），可按租户策略切换

**约束**
- **Serverless/Edge 的硬约束**（必须在架构层显式承认）
  - 请求生命周期短：函数超时（几十秒~几分钟）与无状态限制，与“单个 agent 连续 tool-call 运行几十分钟~数小时”天然冲突
  - 不能依赖本地持久进程：后台进程/文件 watcher/持久 shell 在 serverless 不可靠
  - streaming 能力差异巨大：Edge/Serverless 对 SSE/WS 支持与长连接成本/限制不同
- 因此：
  - **不应在 Next.js/Serverless request handler 内运行完整 agent loop**
  - “任意 shell/fs”能力必须外置到隔离执行内核（MCP/worker/container），Next.js 只做 API 网关 + 鉴权 + 事件转发
  - 高成本敏感：需要成本控制（token、工具调用、并行度）

**关于是否“放弃 serverless 支持”的建议（作为需求输入，不是最终决策）**
- 需要区分两件事：
  1) Next.js **作为前端/网关**部署在 serverless：这是可行且推荐的
  2) agent runtime/执行内核 **作为长任务执行器**部署在 serverless：通常不推荐
- 更成熟且性价比更优的全球通用路径是：**网关 serverless + 后台 agent-worker 常驻/弹性容器 + 可恢复存储 + SSE/WS 推送**。
- 如果必须“全 serverless”：只能走“工作流编排 + 可恢复状态机”（如 Temporal/Step Functions/Durable Objects 等）把 agent loop 拆成可中断步进，但复杂度与开发成本很高，且对 tool streaming/交互审批体验不友好。

---

## 2) 需求收敛：对 Agent Core / SDK 的“必须支持项”

### 2.1 Runtime 必须跨宿主（Host-agnostic）

SDK Runtime 需要做到：
- 不依赖 Node 内置模块（否则 browser extension/部分桌面壳无法复用）
- 所有环境能力通过 **Kernel/Sandbox 接口**注入
- 所有 UI/审批通过 **handlers/callbacks** 注入（而不是在 core 里写 UI）

### 2.2 执行能力必须可插拔（Local / Remote / MCP）

为了同时服务 CLI（本地执行）与 SaaS/Browser/Remote workspace（远端执行），SDK 需要：
- `Kernel` 接口稳定（fs/search/shell/watch/checkpoint…）
- 多实现：`LocalKernel(Node/Bun)`、`McpKernel(stdio/sse/ws)`、`RemoteWorkerKernel(http)` 等
- 统一的 **会话隔离键**（sessionId + workspaceRoots + tenantId + hostContext）贯穿 Kernel 与 Store

### 2.3 事件协议必须“可路由 + 可审计 + 可回放”

至少三类事件通道（对应你现有设计心智）：
- `progress`：流式文本、工具进度、UI 需要实时渲染
- `control`：审批、需要用户输入的交互（plan/permissions/questions）
- `monitor`：审计、成本、错误、trace、指标（面向可观测）

要求：
- 支持多传输：本地回调、SSE、WebSocket、postMessage/IPC
- 可重放：Store/WAL 里能复盘关键事件与工具调用

### 2.4 安全与权限是“多层”的

SDK 必须允许同时存在：
- **Host 层**权限（VSCode/Browser/OS 原生权限）
- **SDK 层**策略（permission modes、deny/ask/allow、safe mode）
- **Kernel 层**硬裁决（root 边界、危险命令拒绝、资源限制、隔离）

并且要避免“双重弹窗”：一个动作只能有一个权威裁决链路（推荐 kernel 权威 + host UI 承接）。

### 2.5 多租户/多会话隔离是第一等需求（不只是工程细节）

必须明确：
- session 之间：工具后台任务、watchers、权限缓存、MCP 连接不可串
- tenant 之间：存储路径、日志、trace、缓存 key 全部 namespace 化

---

## 3) 与当前问题的直接关联（为什么这张矩阵会驱动“选 vNext 还是线上版本”）

从需求矩阵可推导出一个硬标准：
- 若一个 SDK 把“执行能力”强绑定在 Node 本地（child_process/fs/watch），它就很难原生服务 Browser Extension 与 SaaS 多租户。
- 反之，如果 SDK 已经把执行能力抽象成 `Sandbox/Kernel` 并且支持 remote，它就天然适合继续演进为“多产品统一底座”。

因此后续审计（T02/T03）会特别聚焦：
- Sandbox/Kernel 抽象是否够干净、是否已经预留 remote
- MCP 能力是否足以承载外置执行内核（roots/elicitation/resources/progress/logging）
- 连接隔离与 structuredContent（context patches/newMessages）是否能做 Claude Code-like 对齐

---

## 4) 额外“你可能忽略但会很致命”的跨场景约束（先写入需求）

### 4.1 同一套 SDK 同时服务「交互式」与「批处理式」两类 agent

- 交互式：CLI/IDE/桌面，需要强实时流与频繁审批（human-in-the-loop）
- 批处理式：SaaS 后台任务/Repo Guardian，需要强幂等、可恢复、可重试、可审计（无人值守）

结论：Runtime 必须是“可暂停/可恢复/可重放”的状态机，而不是一次性函数调用。

### 4.2 “执行内核”必须支持多形态、且要可组合

- Browser extension 需要 Browser kernel（DOM/tabs）
- VSCode 需要 IDE kernel（WorkspaceEdit/Diagnostics/Terminal）
- CLI/桌面需要 Unix kernel（fs/shell/watch）
- SaaS 需要 Remote kernel（容器/worker），且必须 multi-tenant 隔离

结论：SDK 的关键不是“工具多”，而是 **Kernel 接口与会话隔离模型**是否足够强。
