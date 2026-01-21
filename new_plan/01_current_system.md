# 01｜当前系统完整拆解（基于关键模块阅读）

本文件用于“冻结理解”：描述当前 Kode 的目录分布、关键入口、主要运行链路、协议形态与痛点，为后续重构设计提供可验证的事实基础。

## 1. 目录与分层现状（代码地图）

当前仓库的核心代码主要集中在：

- `apps/kode/src/index.ts`：统一入口（轻量预解析 `--version/--help-lite`，再按需加载 CLI 或 ACP）
- `apps/kode/src/entrypoints/cli.tsx`：CLI 交互入口（Ink）
- `apps/kode/src/entrypoints/daemon.ts`：本地 daemon 入口（HTTP/WS + WebUI 静态托管）
- `apps/kode/src/entrypoints/*`：构建用 entrypoints（输出到 `dist/entrypoints/*`）
- `packages/core/src/`：核心编排 + 共享领域模块（query/engine/tooling/permissions/context + services/utils/constants/types/commands/tests）
- `ui/ink/src/`：CLI 交互层（Ink UI：components/screens/ui/hooks/context）
- `packages/host-*/src/`：host 适配层（CLI/ACP/MCP wiring）
- `scripts/`：构建与发布脚本（Bun build、ensure-ripgrep、binary compile、bench 等）

## 2. 关键入口与运行模式

### 2.1 统一生产入口：`apps/kode/src/index.ts`

- 目的：避免 `--version/--help-lite` 触发重 UI/LLM 初始化，提高冷启动与脚本调用性能。
- 行为：检测 `--acp` 则加载 `./entrypoints/acp.js`，否则加载 `./entrypoints/cli.js`（构建后路径）。

### 2.2 CLI 交互入口：`apps/kode/src/entrypoints/cli.tsx`

主要特征：

- Bun 作为 shebang：`#!/usr/bin/env bun`
- 启动阶段做环境与依赖准备：Yoga wasm、Sentry、配置系统 enable/repair、debug logger
- 非 TTY 场景读取 stdin 并尝试从 `/dev/tty` 恢复交互 stdin（Win32 特判）
- 最终进入 `parseArgs(inputPrompt, renderContext)` 进行 commander 解析与 UI/print 模式切换

### 2.3 ACP 入口：`apps/kode/src/entrypoints/acp.ts`

主要特征：

- ACP 必须保证 stdout 纯协议输出，因此一开始安装 `stdoutGuard`
- 通过 `JsonRpcPeer` + `StdioTransport` 建立 JSON-RPC over stdio
- `KodeAcpAgent` 作为协议适配层，将 ACP 方法映射到内部引擎能力

### 2.4 MCP Server 入口：`packages/host-mcp/src/server.ts`（实现）/ `apps/kode/src/entrypoints/mcp.ts`（构建入口）

主要特征：

- 使用 `@modelcontextprotocol/sdk` 启动 MCP server
- 通过“工具注册表适配”对外暴露工具能力（与 CLI/ACP 共用同一套内置工具实现）

## 3. Core 引擎（Query / Tool pipeline）

以 `packages/core/src/query/index.ts` 为中心的链路：

1. 组装系统提示词（context + output style + reminder + hooks 注入等）
2. 调用 LLM（lazy load：`packages/core/src/services/llmLazy.ts`）
3. 解析 assistant message 中的 `tool_use`（含 server/mcp tool use 变体）
4. 进入 `ToolUseQueue`：
   - 并发安全判定（`isConcurrencySafe`）
   - 排队、执行、合并 progress 消息、处理中断与 sibling 失败传播
5. 每次 tool_result 形成 user message，进入下一轮对话
6. 会话持久化：通过 `packages/core/src/utils/protocol/kodeAgentSessionLog.ts` 追加 jsonl

补充要点：

- `BunShell` 为后台任务提供渲染与状态通知附件（与交互 UI 有强关联）
- hooks（`packages/core/src/utils/kodeHooks.ts`）在多个阶段注入 system prompt、额外 context、以及 tool_use 前后钩子

## 4. 工具系统与权限系统现状

### 4.1 Tool 接口：`packages/core/src/tooling/Tool.ts`

现状特征：

- Tool 接口仍依赖 React/Ink 形态（`renderToolUseMessage`/`renderToolResultMessage` 返回 ReactNode）
- 这会阻碍“core 作为 SDK/headless”复用（WebUI/VSCode/daemon 想复用必须引入 React/Ink 依赖）

### 4.2 Tool registry：`packages/tools-builtin/src/registry.ts`

现状特征：

- 工具列表与顺序非常重要（影响对外 tool schema 与契约测试）
- 已经通过兼容 re-export 形式为后续迁移留出空间

### 4.3 Permissions：`packages/core/src/permissions/index.ts` + `packages/core/src/utils/permissions/*`

现状特征：

- 既有权限体系包含“设置/上下文/交互请求组件/规则引擎”
- `Bash` 有额外的 LLM gate/intent check（需保证 fail-closed 行为）

## 5. 协议形态（stream-json / session log / ACP / MCP）

当前同时存在多种“协议/输出通道”：

- CLI print 模式：`text/json/stream-json`，并有会话流式输入 `--input-format=stream-json`
- Session log：jsonl 文件追加
- ACP：JSON-RPC over stdio，要求 stdout guard
- MCP：MCP SDK server（tools/requests 的标准协议）

这意味着：要做“Core SDK + 多 Host”，需要一个统一的 **事件模型/数据模型**，并在各 Host 中做协议适配。

## 6. 配置 / 模型 / agents / plugins

关键点：

- 配置：`packages/config/src/index.ts` 提供分层配置（global/project/env/cli override），并有模型 profile 修复逻辑
- 模型：`packages/core/src/utils/model.ts` 管理 model pointers 与动态切换（main/task/reasoning/quick）
- agents：`packages/core/src/utils/agentLoader.ts` 支持多目录优先级加载（.claude/.kode + 用户/项目）
- plugins：`packages/core/src/services/pluginRuntime.ts`、`packages/core/src/services/skillMarketplace.ts` 做插件/技能动态扩展

## 7. 构建与发布

- Bun build：`scripts/build.mjs` 输出 `dist/*` 并生成可执行 wrapper（`cli.js`/`cli-acp.js`）
- binary compile：`scripts/build-binary.mjs` 使用 `bun build --compile`
- ripgrep vendor：`scripts/ensure-ripgrep.mjs`（已出现跨平台兼容性优化需求）

## 8. 已阅读的关键文件清单（≥20）

为满足“至少阅读 20 个关键模块/代表性文件”的要求，本次分析覆盖（节选）：

- 入口/构建：`apps/kode/src/index.ts`、`apps/kode/src/entrypoints/cli.tsx`、`apps/kode/src/entrypoints/acp.ts`、`packages/host-mcp/src/server.ts`、`scripts/build.mjs`、`scripts/build-binary.mjs`、`cli.js`、`scripts/cli-wrapper.cjs`
- CLI 主链路：`packages/host-cli/src/app/entrypoints/cli/cliParser.tsx`、`packages/host-cli/src/app/entrypoints/cli/interactive/renderers.tsx`、`packages/host-cli/src/app/entrypoints/cli/print/runPrintMode.ts`、`ui/ink/src/screens/REPL.tsx`
- Core：`packages/core/src/query/index.ts`、`packages/core/src/tooling/Tool.ts`、`packages/tools-builtin/src/registry.ts`、`packages/core/src/permissions/index.ts`
- 协议：`packages/protocol/src/agentEvent.ts`、`packages/core/src/utils/protocol/kodeAgentStreamJson.ts`、`packages/core/src/utils/protocol/kodeAgentStructuredStdio.ts`、`packages/core/src/utils/protocol/kodeAgentSessionLog.ts`、`packages/core/src/utils/protocol/kodeAgentStreamJsonSession.ts`
- ACP：`packages/host-acp/src/kodeAcpAgent.ts`、`packages/host-acp/src/protocol.ts`、`packages/host-acp/src/jsonrpc.ts`、`packages/host-acp/src/stdioTransport.ts`、`packages/host-acp/src/stdoutGuard.ts`
- 配置/模型/agents：`packages/config/src/index.ts`、`packages/core/src/utils/model.ts`、`packages/core/src/utils/agentLoader.ts`
- plugins/skills：`packages/core/src/services/pluginRuntime.ts`、`packages/core/src/services/skillMarketplace.ts`
- MCP：`packages/core/src/services/mcpClient.ts`、`packages/tools-builtin/src/tools/mcp/MCPTool/MCPTool.tsx`
- 权限：`packages/core/src/utils/permissions/toolPermissionSettings.ts`、`packages/core/src/utils/permissions/bashToolPermissionEngine.ts`
- AI：`packages/core/src/services/llm.ts`、`packages/core/src/services/llmLazy.ts`、`packages/core/src/services/modelAdapterFactory.ts`、`packages/core/src/services/ai/adapters/base.ts`

（说明：这里只列出“代表性关键文件”，实际阅读覆盖面更广。）

## 9. 主要结构问题（为后续设计提供动机）

1. **core 与 UI 耦合**：Tool 接口直接返回 ReactNode；core/query 内部也有 UI 相关渲染（例如 BunShell 附件），导致 headless 复用困难。
2. **多协议形态并存但缺少统一数据模型**：print stream-json / session jsonl / ACP / MCP 各自定义，未来 WebUI/VSCode 容易出现重复实现与兼容风险。
3. **Host 责任边界不清**：CLI、ACP、MCP 在入口层分开，但内部逻辑（工具集、权限、会话、日志）缺少明确“host 适配层”。
4. **发布与运行时策略需要系统化**：生产运行时以 Node.js 为基线，开发/构建可用 Bun；VSCode/生态（Node）需要明确的复用路径（SDK vs daemon）。
