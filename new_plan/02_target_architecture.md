# 02｜目标形态：我最喜欢的“全局最优/最优雅”架构

目标：把 Kode 设计成一套 **可组合的产品族**：

- `core`：可复用的 headless 引擎（SDK）
- `hosts`：CLI（Ink TUI）、ACP（stdio JSON-RPC）、MCP（server）、daemon（本地服务）、WebUI（前端）
- `protocol`：所有 host 共享的 schema/事件模型/会话日志格式（协议优先）
- `tools`：内置能力作为可插拔包（builtin tools），并允许外部扩展

在此目标下，CLI 只是一个 host；WebUI/VSCode 也只是 host；核心能力都在 core 中复用。

## 1. 总体分层（抽象出的共性）

典型优秀结构会满足三条线：

1. **协议/数据模型** 独立（schemas/protocol）→ 让多端共享类型与兼容约束  
2. **核心引擎** headless（core）→ 不依赖 UI，不依赖终端，不依赖具体 transport  
3. **host 层** 只负责 I/O 与呈现（cli/web/vscode/mcp/acp）→ 可替换、可组合

在 Kode 场景里，我推荐的最终依赖方向为：

```
protocol  (types + schemas)
   ↑
core (engine + policies + session + hooks, headless)
   ↑
runtime-* (Node 基线 + 可选 Bun 适配)     tools-* (builtin toolset)
   ↑                 ↑
hosts-* (cli / acp / mcp / daemon)  ui-* (ink / web presenters)
```

## 2. 顶层目录结构（建议）

推荐采用 workspace/monorepo（以 `packages/` 分包方式组织）：

```
.
├─ apps/
│  ├─ kode/                # 统一 dispatch + 构建入口集合（`apps/kode/src/entrypoints/*` → `dist/entrypoints/*`）
│  ├─ cli/                 # 终端交互（Ink TUI）真正实现
│  └─ daemon/              # 本地 daemon（HTTP/WS + 静态 WebUI 托管）真正实现
├─ packages/
│  ├─ protocol/            # schema-first：事件、会话、RPC、工具 schema
│  ├─ core/                # headless 引擎：query/tool pipeline、hooks、session
│  ├─ tools-builtin/       # 内置工具集合（纯能力：可序列化事件/结果；不直接返回 UI）
│  ├─ host-cli/            # CLI host wiring（参数解析/命令注册/与 Ink UI 对接）
│  ├─ host-acp/            # ACP host/transport（JSON-RPC over stdio）
│  ├─ host-mcp/            # MCP host（server/client 适配）
│  ├─ daemon/              # daemon 复用实现（HTTP/WS + 静态资源托管）
│  ├─ config/              # 配置系统（profiles/pointers/repair）
│  ├─ runtime/             # 运行时抽象接口（types）
│  ├─ runtime-node/        # Node.js 运行时实现（基线）
│  └─ runtime-bun/         # 可选：Bun 运行时实现（用于打包/单文件二进制等场景）
├─ ui/
│  ├─ ink/                 # Ink UI 组件库（被 CLI host 复用：`apps/kode/src/entrypoints/cli.tsx` → `packages/host-cli`）
│  └─ web/                 # WebUI 前端（Vite/React），构建产物被 daemon 托管
├─ examples/
│  ├─ daemon-client-echo.ts # daemon client SDK 最小示例
│  └─ vscode/               # VSCode webview PoC（可抽离成独立仓库）
├─ scripts/
└─ ...
```

说明：

- `apps/*` 是最终可执行产物（bin/服务）。
- `packages/*` 是可复用库（可发布为单包的 subpath exports，或发布为多个 npm 包）。
- `ui/*` 是纯 UI 项目（尤其 WebUI 需要独立打包与资源管理）。

## 3. 模块职责拆解（核心包清单）

### 3.1 `packages/protocol`（协议优先）

职责：

- 定义 **统一事件模型**（用于 stream-json、WebSocket、SSE）
- 定义 **会话日志**（jsonl entry schema）
- 定义 **RPC 协议**（ACP 方法与参数 schema，daemon API schema）
- 定义 **工具 schema**（工具定义如何序列化/暴露给 LLM/MCP/客户端）

目标：任何 host（CLI/WebUI/VSCode）只要遵守 protocol，就能与 core/daemon 互通。

### 3.2 `packages/core`（headless 引擎 / SDK）

职责：

- 提供 `Engine`：对话编排 + tool queue + hooks + memory/context 管理
- 完全不依赖 Ink/React/TTY；只通过 protocol 定义的事件与 host 交互
- 对权限、日志、文件系统、进程执行等仅依赖 runtime 抽象

对外 API 建议：

- `createEngine({ runtime, toolRegistry, modelProvider, ... })`
- `engine.run({ input, mode }) -> AsyncIterable<AgentEvent>`

### 3.3 `packages/runtime*`（跨平台与性能关键）

职责：

- 抽象所有系统 I/O：fs、spawn、env、cwd、clock、fetch、tmpdir、platform
- `runtime-node` 为默认实现：生产运行时基线（npm 包直接运行）
- `runtime-bun` 为可选实现：可用于单文件二进制/特定性能路径（spawn、file I/O、fetch 等），但不作为生产运行时基线
- Node 生态（脚本/IDE）可优先通过本地 daemon + client 复用执行环境与会话能力（`packages/daemon/src/client.ts`），减少宿主侧差异

### 3.4 `packages/tools-builtin`（内置工具集合）

职责：

- “工具能力”本身：filesystem/system/search/network/mcp/interaction/ai 等
- 工具输出为结构化 data + tool events，不直接返回 ReactNode
- 工具的“呈现层”在 `ui/ink/src/toolPresenters`（TUI）与 `ui/web`（WebUI）实现

### 3.5 `packages/host-*`（协议适配器）

- `host-acp`：JSON-RPC over stdio（server + client），与 VSCode/daemon 共享协议实现
- `host-mcp`：MCP server/client 适配；把 tool registry 映射到 MCP tools

## 4. Tool/UI 解耦的关键规则（最重要的边界）

### 规则 A：core 不 import React/Ink

core 只能输出：

- `AgentEvent`（protocol 定义）
- 结构化结果（tool output data）
- “需要用户交互”的请求（permission prompt、ask user question、plan approval 等）

### 规则 B：UI 只做呈现，不做业务决策

UI 不应自己实现权限、工具执行或 session；这些在 core 中完成。UI 只：

- 渲染事件流
- 把用户输入/按钮点击变成 protocol 事件或 RPC 请求

## 5. 发布策略（兼容优先 + 渐进演进）

我最推荐的发布方式（兼顾优雅与落地成本）：

### 方案 1：单 npm 包 + subpath exports（优先推荐）

继续发布 `@shareai-lab/kode`（CLI 包）不变，同时在 `exports` 中暴露：

- `@shareai-lab/kode/core`
- `@shareai-lab/kode/protocol`
- `@shareai-lab/kode/acp`
- `@shareai-lab/kode/mcp`

优点：用户安装一个包即可；对外接口清晰；内部仍可使用 workspace 分包。

### 方案 2：多 npm 包（更“纯粹”但发布成本更高）

例如：

- `@shareai-lab/kode`（cli/daemon）
- `@shareai-lab/kode-core`
- `@shareai-lab/kode-protocol`
- `@shareai-lab/kode-acp`

## 6. 从当前仓库到目标结构的迁移映射（示例）

| 当前路径 | 目标归属 |
|---|---|
| `packages/core/src/query/*` | `packages/core/src/query/*` |
| `packages/core/src/tooling/*` | `packages/core/src/tooling/*`（最终去 React 依赖） |
| `packages/tools-builtin/src/tools/*` | `packages/tools-builtin/src/tools/*`（内置工具实现，供 hosts 复用） |
| `ui/ink/src/{components,screens,ui,hooks,context}` | `ui/ink/src/*`（Ink UI 与交互层） |
| `packages/host-acp/src/*` | `packages/host-acp/src/*` |
| `apps/kode/src/entrypoints/*` | `apps/*` |
| `packages/protocol/src/*` | `packages/protocol/src/*` |

## 7. 非功能性目标（Performance / Cross-platform / Node runtime）

1. **冷启动**：保持 `apps/kode/src/index.ts` 的轻量预解析策略；host/重 UI 懒加载
2. **跨平台**：所有 spawn/fs/path/newline/权限位操作必须经 runtime 抽象统一处理
3. **运行时基线**：生产运行时为 Node.js（不依赖 Bun）；开发/构建/测试可用 Bun；生态端（VSCode/WebUI/脚本）可通过统一 daemon + client 复用能力
