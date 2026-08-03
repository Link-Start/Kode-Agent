# packages/

内部可复用模块集合。

注意：当前仓库对外仍发布为单一 npm 包 `@shareai-lab/kode`。`packages/*` 是 monorepo 风格的内部模块分层（通过 TypeScript paths + 构建脚本组合产物）。

## 目录说明（当前实际状态）

| 包                        | 职责                                                     |
| ------------------------- | -------------------------------------------------------- |
| `packages/agent`          | Agent/SubAgent 类型定义、加载、注册                      |
| `packages/ai`             | AI 模型提供者集成（Anthropic/OpenAI/Gemini/Bedrock）     |
| `packages/builtin-skills` | 内置技能包 (SKILL.md 文件)                               |
| `packages/client`         | 连接本地 daemon 的 client SDK helpers                    |
| `packages/config`         | 配置系统（profiles/pointers/repair/migrations）          |
| `packages/context`        | 上下文管理（AGENTS.md/git status/目录结构注入）          |
| `packages/core`           | headless 引擎（编排/权限/工具流水线/MCP server+client）  |
| `packages/engine`         | AI 查询编排器（orchestrator/turn runner）                |
| `packages/hooks`          | 钩子系统（会话生命周期事件）                             |
| `packages/host`           | Host/transport 适配（CLI/ACP/MCP 场景统一入口）          |
| `packages/permissions`    | 权限管理与安全控制                                       |
| `packages/protocol`       | schema-first 协议（AgentEvent/会话日志/RPC/工具 schema） |
| `packages/runtime`        | 运行时抽象接口 + Node.js/Bun 实现                        |
| `packages/tool-interface` | 工具接口类型定义（Tool/PermissionMode/ToolUseContext）   |
| `packages/tools`          | 内置工具集合（能力实现 + 可序列化输出）                  |
| `packages/kode-bin-*`     | 按平台分发的原生 CLI 二进制 (npm optionalDependencies)   |
| `packages/kode-ripgrep-*` | 按平台分发的 ripgrep 二进制 (npm optionalDependencies)   |

## 依赖规则（约束边界）

- `packages/core` 不依赖 UI 层；所有交互通过事件/host 层呈现
- `packages/tools` 不依赖 Ink UI；工具呈现由 host 层承接
- `apps/*` 只承载可执行入口

## 对外 SDK（subpath exports）

- `@shareai-lab/kode/protocol`：协议与 schema (`dist/sdk/protocol.*`)
- `@shareai-lab/kode/daemon-client`：连接本地 daemon 的 client SDK (`dist/sdk/daemon-client.*`)
- `@shareai-lab/kode/core`：headless 引擎能力 (`dist/sdk/core.*`)
- `@shareai-lab/kode/tools`：工具定义与注册 (`dist/sdk/tools.*`)
- `@shareai-lab/kode/runtime`：运行时抽象接口 (`dist/sdk/runtime.*`)
- `@shareai-lab/kode/runtime-node`：Node.js 运行时实现 (`dist/sdk/runtime-node.*`)
