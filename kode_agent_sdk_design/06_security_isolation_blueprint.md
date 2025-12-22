# 安全 / 隔离 / 合规蓝图（面向五端 + MCP Kernels）

> 目标：为 “vNext Runtime + MCP Execution Kernels” 架构提供一套可落地的安全与隔离标准，覆盖：多租户隔离键、权限模式与审批链路、roots 边界与 symlink 逃逸防护、secret 管理、审计与 trace、配额与 DoS 防护、serverless/worker 部署边界。  
> 上下文依赖：`kode_agent_sdk_design/05_execution_kernel_mcp_strategy.md`（Kernel 策略）。

## 0. 结论（先给最关键的安全原则）

1) **Kernel 必须是“裁决者（authoritative）”**：所有会产生副作用或越界的能力必须在 Kernel 侧做硬拒绝，Host/SDK 的审批只是“交互承接”，不是最终防线。  
2) **默认 deny-by-default + roots 强边界**：没有 roots 的访问一律拒绝；root 外访问只能通过显式授权扩 root。  
3) **隔离第一等公民**：多租户、multi-agent、multi-workspace 的隔离不能依赖“约定/命名”，必须依赖“连接/进程/容器”或严谨的 session key。  
4) **可审计、可回放、可追责**：所有副作用都要落审计事件（含审批来源、参数摘要、diff/bytes、耗时、配额命中）。

## 1. 威胁模型（Threat Model）

### 1.1 攻击面分类

- **路径越界**：`../`、绝对路径、symlink 指向 root 外、挂载点逃逸。  
- **命令执行**：破坏性命令、提权、管道执行远程脚本、fork bomb、资源耗尽。  
- **跨会话串台**：后台 jobId / watcherId / readToken / permission cache 在不同 session 复用。  
- **数据泄漏**：日志/trace 中包含 secrets、用户代码、跨租户事件混写。  
- **DoS**：无限 grep/glob、超大输出、过多并发工具调用、过多 watchers/job。  
- **供应链**：MCP server 插件化后引入第三方工具，存在后门风险。  

### 1.2 不同宿主的风险侧重

- CLI/桌面：主要是“误操作/危险命令/越界写”。  
- VSCode：remote workspace + 多根目录 + 文档模型差异，风险在“边界错配与越权编辑”。  
- Browser extension：权限系统（host permissions）与 DOM 操作，风险在“跨站/隐私/误触发”。  
- SaaS：对抗性最强（多租户、外部用户），必须假设恶意输入与滥用。

## 2. 隔离模型（多租户 / 多会话 / 多工作区）

### 2.1 三层隔离键（推荐）

- **tenantId**：SaaS 必选；本地可为空。  
- **workspaceId / rootHash**：一组 roots 的稳定标识（排序无关 + 规范化 + hash）。  
- **sessionId**：一次 agent 会话生命周期 id（与 vNext AgentId 不必相同，但必须可关联）。

在 Kernel 侧，任何 state 都必须挂在：
`(tenantId, workspaceId/rootHash, sessionId)` 的命名空间下。

### 2.2 进程/容器隔离优先级

隔离强度从强到弱：

1) **每 session 一个 Kernel 进程（stdio）**：本地 CLI 最推荐，天然不串。  
2) **每 session 一个容器/VM**：SaaS 侧推荐（成本更高但最安全）。  
3) **共享 Kernel 服务 + 每连接独立 SessionContext**：需要严格实现 session 分片与资源配额（容易踩坑，但可用于 SSE/WS）。

硬要求：
- 禁止“serverName 级别的全局单例缓存”（SDK 当前 MCP manager 就是反例，见 00b）。  

## 3. roots 边界与 symlink 逃逸防护（必须 Kernel 强制）

### 3.1 路径规范化流程（Kernel）

对任何来自 tools/call 的路径入参：

1) 规范化：去除 `..`、重复分隔符、处理 Windows/Unix 路径差异。  
2) 绝对化：转换为绝对路径或 canonical URI。  
3) `realpath`：解析 symlink（关键），得到真实落点。  
4) `isInsideRoots(realpath)`：判断是否在 roots 之内；不在则拒绝或触发“扩 root”审批。

### 3.2 symlink 策略（推荐默认）

- 默认：**deny symlink escape**  
  - 允许 root 内 symlink 指向 root 内  
  - 禁止 root 内 symlink 指向 root 外
- 对写操作更严格：写入路径的父目录也必须 `realpath` 在 root 内（避免“写到 symlink 指向外部目录”）。

### 3.3 roots 变更（扩权）

扩 root 是“高风险”操作：
- 只能通过 `elicitation/create(kind=roots.expand)`，并展示即将新增的绝对路径/URI 与风险解释。  
- 宿主可选择“仅本次 session”或“workspace 记忆”或“全局记忆”。  
- Kernel 必须记录审计事件：谁在何时、以何种范围授予了 root。

## 4. 权限模型与审批链路（Host 承接 UI，Kernel 做最终裁决）

### 4.1 分层权限（必须同时存在）

1) **Host 层权限**：OS/VSCode/Browser 的原生权限（不可绕过）。  
2) **SDK/Runtime 层策略**：permission mode（auto/approval/readonly）、tool metadata、并发队列。  
3) **Kernel 层硬策略**：roots、危险命令、配额、读写锁、plan mode 限制。

### 4.2 审批链路（标准流程）

1) Runtime 预判：根据 tool descriptor metadata（mutates/access/openWorld）决定是否“倾向 ask”。  
2) Kernel 预判：执行前再次判定（roots 越界、危险命令、配额、plan mode）。  
3) 若需要交互：Kernel 发 `elicitation/create`（携带 meta.kind、风险摘要、diff/command preview）。  
4) Host UI 展示并收集用户决策（accept/decline/cancel + 可选 note）。  
5) Kernel 根据决策继续/拒绝，并写入审计。

### 4.3 审批缓存（避免频繁弹窗）

建议支持 3 种 scope（由 Host 决定，Kernel 执行）：
- `session`：仅当前会话有效（默认）  
- `workspace`：对同一 workspaceRoots 有效（写入 workspace 配置）  
- `user/global`：对用户全局有效（写入全局配置）

注意：任何缓存都必须带 “tool + action + root scope” 的限定；不得出现“宽泛 allow-all”默认持久化。

## 5. Secrets 管理（跨宿主一致）

### 5.1 secrets 的边界

- Browser extension：不应持有长期 API keys；应通过后端网关或用户本机代理。  
- SaaS：每 tenant 的 secrets 必须隔离存储（KMS/Secret Manager），并最小化注入到 worker。  
- CLI/桌面：secrets 可能来自 env/本地 keychain，必须避免被写入日志/trace。

### 5.2 传递与脱敏

- Kernel 日志与审计必须做 **redaction**：  
  - env var 名单（`*_KEY`, `*_TOKEN`, `AUTH*`）  
  - URL query/header  
  - git credential helper 输出  
- 对工具参数：只记录摘要（hash/长度/前后片段），避免把文件全文写进审计（SaaS 尤其重要）。

## 6. 审计与 Trace（可回放、可追责）

### 6.1 必须记录的审计事件（最小集合）

- tool call：toolName、sessionKey、timestamp、durationMs、参数摘要  
- 权限：decision（allow/deny）、scope（session/workspace/global）、decidedBy（user/policy/hook）、note  
- 文件写：path（规范化后）、bytes、diff 摘要、checkpointId（如启用）  
- shell exec：cmd 摘要、exitCode、outputSize、jobId（如 background）  
- roots 变更：新增/移除 roots 的列表与原因  
- quota 命中：触发的限制类型（cpu/time/output/files）与阈值

### 6.2 事件隔离与存储

强制要求：
- 所有事件持久化必须按 tenant/session namespace 分区（目录/DB partition/key prefix）。  
- replay API 必须校验调用者权限（SaaS 必须鉴权）并只返回自己的事件。

### 6.3 数据保留与合规

建议提供：
- retention policy（例如 7/30/90 天）  
- “删除权”（按 tenant/session 清理所有 trace）  
- PII 分类：对 Browser extension 的页面内容/截图，默认短期保存或不保存

## 7. 配额与 DoS 防护（Kernel 负责强制）

### 7.1 必须做的硬限制

- 单次 tool 输出上限（stdout/stderr/grep results），超出截断并标记 `truncated=true`  
- 单次工具耗时上限（timeoutMs）与取消（kill/cancel）  
- 并发上限：jobs、watchers、tool calls  
- 文件读取大小上限、单次 glob/grep 扫描文件数上限  
- 写入速率限制：单位时间内写入次数/总 bytes

### 7.2 “副作用工具串行化”（跨宿主一致性）

Kernel 至少要提供：
- file-level lock（同一文件写串行）  
- mutating tool queue（写/exec/checkout 串行，读可并发）  

Runtime 可以做预调度，但最终必须 Kernel 也能保障（防止绕过）。

## 8. serverless / worker 部署边界（SaaS 必选）

### 8.1 必须区分“网关”与“长任务执行器”

不建议在 serverless request handler 内运行完整 agent loop：
- 连接不稳定、执行时长受限、watch/job 不可靠、成本高

推荐形态：
- **Next.js/Serverless = 网关**：鉴权、创建 session、事件转发（SSE/WS）、持久化状态写入  
- **Agent Worker = 常驻/弹性容器**：运行 vNext Runtime + Kernel（MCP）或连接到 Kernel  
- **Kernel = 隔离执行面**：容器内或独立服务

### 8.2 多租户隔离建议（SaaS）

最低建议：
- 每 tenant 至少独立 workspace 目录与 store namespace  
更强建议：
- 每 session 一个容器（或至少每 tenant 一个容器池）  

## 9. 与 plan mode / checkpoint / 影子 git 的关系（安全角度）

- plan mode：Kernel 可选择 hard enforcement（禁止任何非 plan 文件写/exec），确保“计划阶段不会误执行副作用”。  
- checkpoint/影子 git：建议 Kernel 在每次 mutating 操作前自动 checkpoint，并把 checkpointId 写入审计；这样“误操作”可回滚且可追责。

## 10. 本蓝图的落地验收标准（可测试）

1) 同一 Kernel 服务上并发 2 个 session：jobId/watchId/readToken 互不可见。  
2) roots 外路径读写：默认拒绝；通过 elicitation 扩 root 后才可访问。  
3) symlink 逃逸：root 内 symlink 指向 root 外，读写均拒绝。  
4) dangerous commands：默认拒绝（至少覆盖 `rm -rf /`, `sudo`, `curl|sh`, fork bomb）。  
5) 审计：对每次 write/exec/roots.expand 都能回放（含 decision 与摘要），且按 tenant 隔离。

