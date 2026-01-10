# 04｜工具系统与权限系统：解耦到可复用的 Core

本文件聚焦一个关键问题：**如何在不破坏任何现有能力的前提下，把工具与权限从“Ink/React 绑定”解耦出来，使 core 可被 WebUI/VSCode/daemon 复用。**

## 1. 当前耦合点（问题定义）

现状（以 `packages/core/src/tooling/Tool.ts` 为代表）：

- Tool 接口包含 `renderToolUseMessage/renderToolResultMessage`，返回 ReactNode
- 这使得任何想复用 tool runner 的 host，都不得不引入 React/Ink 依赖
- 同时，权限请求也常常以“UI 组件”形态出现，难以在 ACP/daemon 复用

目标：把“业务能力”与“呈现/UI”拆分成两套可插拔接口。

## 2. 目标接口（建议）

### 2.1 Tool 的三段式拆分

1) `ToolSpec`（给 LLM/MCP/外部列举工具时用）

- name、description、inputSchema/jsonSchema
- isReadOnly / isConcurrencySafe / needsPermissions 等纯逻辑信息

2) `ToolRunner`（只负责执行）

- `run(input, ctx) -> AsyncGenerator<ToolRunEvent>`
- ToolRunEvent 只能是可序列化 JSON（progress/result/error）

3) `ToolPresenter`（可选，host 侧）

- Ink presenter：把 tool events 渲染为 TUI 组件
- Web presenter：把 tool events 映射成 WebUI 卡片/组件

### 2.2 兼容层（必须）

为了保持现有工具实现不变（最小风险），迁移建议分两步：

- 第一步：用 adapter 把旧 Tool 包装成 `ToolSpec+ToolRunner+ToolPresenter(Ink)`
- 第二步：逐个工具把 ReactNode 输出迁移到 presenter，runner 只产出结构化 data

这样可以做到：

- 旧 CLI 体验完全不变
- 新 host（daemon/WebUI）可以先复用 runner + 默认文本 presenter

## 3. 权限系统的拆分

建议把权限同样拆成三层：

1) `PermissionPolicy`（纯逻辑）

- 输入：tool spec、input、安全模式、用户设置、历史决策
- 输出：`allow | deny | ask`

2) `PermissionBroker`（等待决策）

- `ask(request) -> Promise<decision>`
- 在 CLI host：调用 Ink 组件让用户点选
- 在 daemon：通过 WebSocket/HTTP API 把 request 发给 WebUI
- 在 ACP：通过 JSON-RPC request/response 往返（或 fail-closed）

3) `PermissionStore`（持久化与策略缓存）

- 记录用户对某工具/路径的 allowlist/denylist
- 记录会话内临时决策（一次允许/总是允许）

## 4. 对跨平台与高性能的影响点

工具与权限拆分后，可以系统性解决跨平台问题：

- 文件路径规则统一（Windows drive + UNC + path separator）
- spawn 行为统一（shell quoting、encoding、pty/非 pty）
- 避免依赖系统 `tar/unzip` 等（已在脚本侧出现需求）

性能方面：

- 工具 runner 可在 daemon 常驻进程里复用，显著减少冷启动成本
- 工具 schema 可缓存（避免每次都生成 JSON schema）

## 5. “需要用户交互”的工具（AskUserQuestion/PlanMode 等）

这类工具本质是“让 core 请求用户决策”：

- 在 CLI 中：展示对话框/选择器，返回用户选择
- 在 WebUI 中：展示 modal/确认按钮，返回用户选择

因此这类工具在 vNext 中更推荐：

- runner 只产出 `user_interaction_request` event
- host 决策后回传 `user_interaction_result`
- core 把结果再喂给 LLM 或继续执行

## 6. 迁移期间的原则（不破坏既有体验）

1. 默认 CLI 体验不变（包含输出格式、工具列表、命令 help、参数、协议细节）
2. 新接口先以 adapter 形式落地，允许旧实现“原样运行”
3. 任何“新增能力”（例如 WebUI link）必须默认关闭，避免改变旧输出/流程
4. 每次迁移都必须有对应的契约测试/回归测试
