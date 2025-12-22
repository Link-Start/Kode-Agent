# 五端接入 Playbooks（CLI / VSCode / Browser Extension / Desktop / Next.js SaaS）

> 目标：把 `07_kode_agent_sdk_100_design.md` 的目标架构落到每个产品形态的“可执行 user flow + 事件流 + 审批承接 + roots + kernel 隔离策略”。

## 0. 共用组件（五端都复用的最小拼装块）

1) **SessionManager**：创建/恢复 AgentSession（tenantId/sessionId/rootHash/kernelId）。  
2) **KernelManager**：按 isolationKey 建立/缓存 kernel 连接（stdio/SSE/WS），并注册 roots/elicitation/resources/progress/logging/prompts handlers。  
3) **EventBridge**：把 Runtime 的 progress/control/monitor 转发到宿主 UI（IPC/SSE/WS/postMessage）。  
4) **ApprovalBroker（Host UI）**：承接 `elicitation/create`，并把用户决策回传 Kernel。  
5) **StoreAdapter**：本地（JSONStore）或远端（DB/Redis/S3）实现统一 Store 接口，支持 replay/resume。

## 1) Terminal CLI（本地终端）

### 1.1 推荐 Kernel

- 默认：**UnixToolsKernel（stdio）**，每个 session 一个子进程（最强隔离）。  
- 备选：UnixToolsKernel daemon（本机常驻）+ 每 session 独立连接（需要额外隔离逻辑）。

### 1.2 User Flow A：启动 → 选 workspace → 对话

1) CLI 解析 cwd 或用户选择的 repo 作为 `workspaceRoots`。  
2) `SessionManager.create()` 生成 sessionId/rootHash。  
3) `KernelManager.spawnStdioKernel()`，并在 initialize 期间响应 `roots/list`。  
4) Runtime 拉取 tools/prompt（tool manual、system reminders）并注入 system。  
5) CLI 订阅 `progress` 渲染流式文本；订阅 `monitor` 写入 `.kode/logs`；订阅 `control` 处理审批弹窗。

### 1.3 User Flow B：改代码（read→edit→test）

1) 模型调用 `fs_read/fs_grep/fs_glob`（readonly 并发）。  
2) 模型提出 patch → 调用 `fs_edit/fs_write`（mutating 串行 + file lock）。  
3) Kernel 若需审批（write/exec）→ `elicitation/create(permission.write)`；CLI 展示 diff/路径/风险 → 用户批准。  
4) 模型调用 `bash_run("bun test")`，输出通过 progress/resource logs 流式展示。  
5) 完成后写入 `monitor.tool_executed` + `monitor.step_complete`，CLI 可提供“导出 trace”。

### 1.4 User Flow C：Plan Mode（对齐 Claude Code）

1) 用户输入 `/plan` 或模型调用 enter_plan 工具。  
2) Kernel 发 `elicitation/create(plan.enter)` → 用户确认进入。  
3) CLI UI 切换“Plan 面板”（只读探索 + 仅允许编辑 plan file）。  
4) 用户 `/apply` 或模型 exit_plan → `elicitation/create(plan.exit)` 审批计划 → 选择 permissionMode。  
5) 进入执行阶段，恢复写/exec 能力。

### 1.5 事件流落地（CLI）

- 本地 UI：直接消费 `Agent.subscribe(['progress','control','monitor'])`。  
- 若需要外部 UI（例如 Web dashboard）：CLI 额外启动 SSE/WS，把事件转发出去（不改变 Runtime）。

## 2) VSCode 插件（IDE 宿主）

### 2.1 推荐 Kernel

优先：**VSCodeKernel（MCP）**  
- 文件改动用 WorkspaceEdit/TextDocument（避免绕过编辑器状态）  
- 终端执行用 VSCode Terminal API  
- roots = workspaceFolders

在 remote workspace（SSH/DevContainer/Codespaces）下：
- VSCodeKernel 自身运行在 extension host（可能远端）  
- 如需 Unix 工具（grep/git/构建）可选择：  
  - 直接走 VSCode Terminal（仍在 VSCodeKernel）  
  - 或连接远端 UnixToolsKernel（Worker/daemon），但必须确保与 workspace 同侧执行

### 2.2 User Flow A：打开工作区 → 自动恢复 session

1) extension 激活时读取 workspaceFolders，计算 rootHash。  
2) `SessionManager.resumeOrCreate()`：  
   - 若存在未完成 session：`Agent.resume(strategy='crash')` 并 auto-seal。  
   - 否则创建新 session。  
3) 注册 VSCode UI：Progress 以输出面板/Chat view 流式渲染；Control 以 QuickPick/Modal 承接审批。

### 2.3 User Flow B：编辑文件（保持编辑器一致性）

1) 模型请求写入 → VSCodeKernel 生成 WorkspaceEdit（可展示 diff preview）。  
2) `elicitation/create(permission.write)` → 用户在 diff UI 中 approve。  
3) applyWorkspaceEdit → 文档 dirty 状态可见 → 可选自动保存。  

### 2.4 User Flow C：终端任务（build/test）

1) 模型调用 `run(cmd)` → VSCodeKernel 创建 terminal 并执行。  
2) logs 通过 resources/progress 推送 → UI 展示并可 attach。  
3) killJob → 终端终止。

### 2.5 事件流落地（VSCode）

- 内部：extension host 直接消费 Runtime events。  
- 外部（可选）：把 monitor/progress 转发到本地服务或 SaaS（用于团队可观测）。

## 3) Browser Extension（浏览器扩展）

### 3.1 推荐 Kernel 组合

- **BrowserKernel（extension 内部）**：tabs/DOM/screenshot/navigation。  
- **UnixToolsKernel（远端）**：代码执行与仓库操作（因为浏览器无法直接访问本地 fs/终端）。

### 3.2 隔离策略（必须）

- sessionId 绑定到：`(browserProfile, tabId, workspaceRootHash)`（至少 tab 级隔离）。  
- BrowserKernel 的所有 state（activeTab, frameId, permissions）必须按 session 分片。  
- 远端 UnixToolsKernel 按 tenant/session 隔离（SaaS 用户尤其重要）。

### 3.3 User Flow A：在网页上触发 agent → 读取 DOM → 生成代码变更

1) 用户点击扩展按钮 → 创建 session（tabId + userId）。  
2) BrowserKernel 提供 page snapshot（DOM/HTML/URL/screenshot）。  
3) 模型分析后决定改 repo：调用远端 UnixToolsKernel（fs/grep/edit/test）。  
4) 审批：  
   - 浏览器侧负责展示 UI（弹窗/side panel）  
   - Kernel 通过 elicitation 请求确认写/exec

### 3.4 User Flow B：跨标签页操作

1) 模型调用 `tabs.list`，选择目标 tab。  
2) BrowserKernel 切换 activeTab 并重新绑定 session。  
3) 防串：旧 tab 的 subscriptions/watchers 必须自动取消。

### 3.5 事件流落地（Browser）

- extension service worker → side panel：用 `chrome.runtime.connect` 或 `postMessage` 转发 events。  
- 与远端 worker：用 SSE/WS 拉取 session events（断线重连以 bookmark 续读）。

## 4) Desktop 客户端（Electron/Tauri）

### 4.1 推荐 Kernel

优先：LocalKernel/UnixToolsKernel（stdio 或本机 daemon）。  
桌面端可以提供更强的后台与索引能力，但风险更大，默认 policy 应更严格（approval/readonly）。

### 4.2 User Flow A：多 workspace 管理

1) 桌面端允许用户管理多个 repo/workspace。  
2) 每个 workspace 独立 roots/rootHash，并可并行存在多个 session（必须隔离）。  
3) UI 提供 session 切换与恢复列表（从 Store 列出 agentId/sessionId）。

### 4.3 User Flow B：后台任务与通知

1) 用户触发长任务（build/test/scan）。  
2) Kernel 运行 background job 并推送 progress/logs。  
3) 桌面端支持系统通知（完成/失败/需要审批）。

### 4.4 事件流落地（Desktop）

- Electron：main process 运行 Runtime + kernel 连接；renderer 通过 IPC 订阅 events。  
- Tauri：Rust side 做 kernel 或桥接；WebView 订阅事件。

## 5) Next.js SaaS（网关 + Worker）

### 5.1 关键原则（必须）

- **Next.js/Serverless 只做网关，不跑完整 agent loop**（长任务不适合 request handler）。  
- Worker 常驻/弹性容器运行 Runtime + Kernel（或连接 Kernel）。  
- 所有资源（workspace、store、logs、MCP 连接）必须 tenant/session namespace 化（见安全蓝图）。

### 5.2 推荐部署拓扑

```
Browser/UI ── SSE/WS ──> Next.js Gateway ── queue/rpc ──> Agent Worker (Runtime)
                                         └─────────────> Kernel (MCP, same pod or sidecar)
```

### 5.3 User Flow A：创建任务 → 实时流式 → 断线重连

1) UI 发起 `POST /api/agent/sessions`（tenant auth）→ 返回 sessionId。  
2) UI 建立 `GET /api/agent/sessions/:id/events`（SSE），带 `since=bookmark` 支持重连。  
3) Worker 运行 Runtime：  
   - 每一步把 progress/control/monitor 写 Store + 推送到 event stream  
4) 断线后 UI 重连：Gateway 从 Store replay 或从 Worker 转发续流。

### 5.4 User Flow B：审批（elicitation）

1) Kernel 发 `elicitation/create` → Worker 转成 control event → UI 弹窗。  
2) UI `POST /api/agent/sessions/:id/decide` → Gateway → Worker → Kernel。  
3) 审批事件必须落审计（monitor）。

### 5.5 User Flow C：多租户配额与滥用防护

1) Gateway 先做 rate limit（请求级）。  
2) Worker/Kernel 做强配额（CPU/time/output/files/jobs/watchers）。  
3) 命中配额：emit `monitor.quota_hit` 并终止/降级工具调用。

## 6. 五端通用的“验收清单”（建议每端都跑）

1) 断线重连：SSE/WS bookmark 续读能重建 UI 状态。  
2) plan mode：进入/退出链路可用，plan 阶段禁止副作用工具（至少 Kernel hard）。  
3) 隔离：同时开两个 session，jobId/watchId/readToken 不串。  
4) roots：root 外访问默认拒绝，扩 root 需审批且可审计。  

