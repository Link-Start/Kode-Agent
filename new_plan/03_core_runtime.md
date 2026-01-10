# 03｜Core（SDK）运行时：内部运转原理与事件模型

本文件定义“core 的最小闭环”：在不引入 UI 的情况下，core 如何执行一次对话、如何调度工具、如何进行权限决策、如何把所有过程用协议事件输出给 host。

## 1. Core 的产品定义（headless engine）

### 输入

- 用户输入（文本/结构化输入）
- 当前会话状态（messages/context/memory）
- 可用工具集合（tool registry）
- 运行时能力（runtime：fs/spawn/env/cwd）
- 配置与策略（safe mode、permission mode、model pointers）

### 输出

- `AgentEvent` 流（可用于 CLI、WebUI、VSCode 统一渲染/订阅）
- 可持久化的 session log entry（jsonl）

## 2. 统一事件模型（建议协议）

建议用一个强类型 union 作为系统唯一“对外可观察面”（概念示例）：

```
AgentEvent =
  | { type: "assistant_message"; message: NormalizedMessage; ... }
  | { type: "tool_call"; toolName; toolUseId; input; ... }
  | { type: "tool_progress"; toolUseId; content; ... }
  | { type: "tool_result"; toolUseId; output; ... }
  | { type: "permission_request"; requestId; request; ... }
  | { type: "permission_decision"; requestId; decision; ... }
  | { type: "error"; scope; error; ... }
  | { type: "session_meta"; sessionId; cwd; ... }
```

约束：

- event 必须可序列化为 JSON（为了 stream-json/WS/SSE/日志）。
- UI（Ink/Web）只能消费事件，不得通过“读内部对象”来渲染。

## 3. 对话编排（Query pipeline）抽象

把当前 `src/core/query/index.ts` 的逻辑收敛为 engine 的一个核心 loop：

1. **Build context/system prompt**
   - context manager/hook additions/output styles/reminders
2. **Call model**
   - model provider 统一接口（支持多模型 profile 与动态切换）
3. **Normalize assistant output**
   - 抽取 `tool_use` blocks
4. **ToolUseQueue 调度**
   - 生成 `tool_call` event
   - 触发权限检查（见下）
   - 执行 tool runner，产出 progress/result
5. **Append tool results into message stream**
6. **Persist session**
7. **Stop condition**
   - max turns / user interrupt / tool error policy / stop hooks

## 4. 权限系统在 core 中的位置

建议把权限分成三层：

1. **Policy（纯逻辑）**：根据 tool、输入、模式、历史决策 → 得到 allow/deny/ask
2. **Broker（交互桥）**：当需要 ask 时，向 host 发 `permission_request` event，并等待 `permission_decision`
3. **UI（presenter）**：Ink/Web 把 request 渲染成对话框，并回传 decision

在 headless 场景（ACP/MCP/daemon）：

- 默认不得弹 UI → `shouldAvoidPermissionPrompts=true` 时，policy 返回 ask 必须 fail-closed（deny）
- 或由 host 提供明确的自动批准策略（仅在用户显式配置时）

## 5. 工具调度与并发（ToolUseQueue）

需要被协议化/可测试化的关键点：

- 并发安全：`isConcurrencySafe(input)` 决定是否可并行执行
- sibling 关系：同一 assistant message 里多个 tool_use 互相影响的错误传播
- 中断：用户 Ctrl+C 或 host cancel → abortController，所有 tool runner 必须支持取消
- 进度：tool 可以持续产出 progress event（而不是直接打印）

推荐：把 tool runner 视为 `AsyncGenerator<ToolRunEvent>`，与当前实现保持一致，只是事件结构化。

## 6. 会话与日志（Session）

建议将 session 分成：

- **运行态 session state**：messages、tool states、model state（如 GPT-5 response id）
- **可持久化 log**：append-only jsonl（用于诊断/重放/审计）

关键要求：

- log schema 固化在 `protocol` 包中（对外兼容契约）
- host 只选择 log 位置（例如 `~/.kode/...`），不定义 log 内容

## 7. Runtime 抽象（Node runtime + cross-platform）

core 不直接使用：

- `Bun.spawn`、`Bun.file`
- `process.cwd()`、`process.env`
- OS 特殊路径（`/dev/tty` 等）

而是经由 runtime 接口：

- `runtime.fs.readFile/writeFile/exists/...`
- `runtime.process.spawn(...)`
- `runtime.os.platform/arch/tmpdir`
- `runtime.env.get/set`

这样：

  - CLI/daemon 以 Node.js 运行时为基线（`dist/` 产物可直接由 Node 执行）
  - 可选提供 `runtime-bun` 用于单文件二进制/特定性能路径（不影响 Node 基线）
  - VSCode/Node 侧可选直接连接 daemon（推荐）或直接跑 core（需要明确 runtime 边界）

## 8. 与现有实现的兼容策略

为保证“功能/流程/体验/外部调用方式”不变，迁移必须满足：

- 保留现有入口与命令（`cli.js`、`kode`、`kode-acp` 等）
- 通过兼容层把旧的 Tool/UI 逐步适配到新 event 模型
- 以契约测试（tools list、CLI help、build smoke、protocol schema）作为 gate
