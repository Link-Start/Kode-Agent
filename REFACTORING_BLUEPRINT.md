# Kode 仓库架构蓝图

> 单仓库 / 多端统一 / SDK 优先

---

## 一、仓库定位

```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│   Kode = AI 编程助手的「核心引擎 SDK」+「官方全端客户端」                 │
│                                                                         │
│   对外：提供 SDK，第三方可构建自己的 AI 编程工具                          │
│   对内：CLI / Web / VSCode / Desktop 作为官方实现和主力产品              │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 1.1 核心价值

| 价值点 | 说明 |
|--------|------|
| **SDK 是护城河** | `@kode/core` 让第三方基于引擎构建工具 |
| **全端覆盖** | 终端、浏览器、VSCode、桌面，同一引擎 |
| **开源心智统一** | 一个仓库 = 一个 Star = 一个社区 |
| **Node.js 优先** | 100% Node.js 兼容，npm/VSCode/Electron 直接集成 |

### 1.2 为什么单仓库

| 考量 | 单仓库优势 |
|-----|-----------|
| 代码共享 | packages/ 直接引用，零成本 |
| 接口变化 | 一个 PR 同步所有端 |
| 版本一致 | 避免 "core v2 + vscode v1.8" 混乱 |
| 开源心智 | 用户看到完整产品线 |
| 贡献者体验 | 不用跳多个仓库 |

### 1.3 UI 策略

**各端独立实现 UI，不做跨端共享抽象。**

原因：
- CLI (Ink) 和 Web (React) 差异大
- 强行抽象会变成最大公约数
- 各端有自己的设计语言

---

## 二、目录结构

```
kode/
│
├── packages/                    # 核心能力层（SDK，对外发布）
│   │
│   ├── core/                    # 引擎核心
│   │   ├── package.json
│   │   └── src/
│   │       ├── index.ts         # 公共 API
│   │       ├── engine/          # 查询引擎
│   │       │   ├── orchestrator.ts      # 编排器（<300行）
│   │       │   ├── message-pipeline.ts  # 消息处理
│   │       │   └── query-executor.ts    # LLM 查询
│   │       ├── permissions/     # 权限系统
│   │       │   ├── engine.ts    # 权限引擎（<400行）
│   │       │   └── policies/    # 策略实现
│   │       ├── context/         # 上下文构建
│   │       └── session/         # 会话管理
│   │
│   ├── protocol/                # 协议定义（类型优先）
│   │   └── src/
│   │       ├── index.ts
│   │       ├── events.ts        # AgentEvent 类型
│   │       ├── messages.ts      # 消息格式
│   │       └── tools.ts         # 工具 Schema
│   │
│   ├── tools/                   # 内置工具集
│   │   └── src/
│   │       ├── index.ts         # 工具注册表
│   │       ├── bash/
│   │       ├── filesystem/
│   │       ├── search/
│   │       ├── ai/
│   │       └── interaction/
│   │
│   ├── runtime/                 # 运行时抽象
│   │   └── src/
│   │       ├── index.ts         # Runtime 接口
│   │       ├── types.ts
│   │       ├── node.ts          # Node.js 实现
│   │       └── bun.ts           # Bun 实现（可选）
│   │
│   ├── config/                  # 配置系统
│   │   └── src/
│   │       ├── index.ts
│   │       ├── loader.ts
│   │       └── schema.ts
│   │
│   └── client/                  # 客户端 SDK（UI 与 Core 的桥梁）
│       └── src/
│           ├── index.ts
│           ├── types.ts         # KodeClient 接口
│           ├── direct.ts        # DirectClient（进程内）
│           └── http.ts          # HttpClient（HTTP/WS）
│
├── apps/                        # 应用层（各端独立实现）
│   │
│   ├── cli/                     # 终端应用
│   │   ├── package.json
│   │   ├── bin/
│   │   │   └── kode.js          # npm bin 入口
│   │   └── src/
│   │       ├── index.ts         # 入口
│   │       ├── app.tsx          # 主应用
│   │       ├── commands/        # CLI 命令
│   │       │   ├── index.ts
│   │       │   ├── config.ts
│   │       │   └── doctor.ts
│   │       └── ui/              # Ink UI（此端专属）
│   │           ├── components/
│   │           │   ├── Input.tsx
│   │           │   ├── Message.tsx
│   │           │   └── PermissionDialog.tsx
│   │           ├── screens/
│   │           │   ├── REPL.tsx
│   │           │   └── Settings.tsx
│   │           └── hooks/
│   │               ├── useChat.ts
│   │               └── usePermission.ts
│   │
│   ├── server/                  # API 服务器（headless）
│   │   ├── package.json
│   │   └── src/
│   │       ├── index.ts         # 入口
│   │       ├── server.ts        # HTTP/WS 服务器（<200行）
│   │       ├── routes/
│   │       │   ├── index.ts
│   │       │   ├── chat.ts      # POST /api/chat
│   │       │   └── session.ts   # /api/sessions
│   │       ├── handlers/
│   │       │   ├── chat.handler.ts
│   │       │   └── shell.handler.ts
│   │       ├── ws/
│   │       │   ├── connection.ts
│   │       │   └── events.ts
│   │       └── static/          # 构建时 web 产物复制到这里
│   │
│   ├── web/                     # Web 前端（独立开发）
│   │   ├── package.json
│   │   ├── vite.config.ts
│   │   ├── index.html
│   │   └── src/
│   │       ├── main.tsx         # 入口
│   │       ├── App.tsx          # 根组件（<300行）
│   │       ├── pages/
│   │       │   ├── Chat.tsx
│   │       │   └── Settings.tsx
│   │       ├── components/
│   │       │   ├── MessageBubble.tsx
│   │       │   ├── InputArea.tsx
│   │       │   └── PermissionModal.tsx
│   │       ├── hooks/
│   │       │   ├── useChat.ts
│   │       │   └── useWebSocket.ts
│   │       └── store/
│   │
│   ├── vscode/                  # VSCode 扩展
│   │   ├── package.json         # VSCode 扩展 manifest
│   │   └── src/
│   │       ├── extension.ts     # 扩展入口
│   │       ├── commands/
│   │       │   └── startChat.ts
│   │       ├── providers/
│   │       │   └── chat.provider.ts
│   │       └── webview/         # Webview UI（此端专属）
│   │           ├── index.html
│   │           ├── main.tsx
│   │           └── App.tsx
│   │
│   └── desktop/                 # Electron 桌面客户端
│       ├── package.json
│       └── src/
│           ├── main/            # 主进程
│           │   ├── index.ts
│           │   ├── window.ts
│           │   └── ipc.ts
│           ├── preload/
│           │   └── index.ts
│           └── renderer/        # 渲染进程 UI（此端专属）
│               ├── main.tsx
│               └── App.tsx
│
├── docs/                        # 文档
│   ├── README.md
│   ├── getting-started.md
│   ├── sdk/
│   │   ├── core.md
│   │   ├── protocol.md
│   │   └── client.md
│   └── apps/
│       ├── cli.md
│       ├── web.md
│       └── vscode.md
│
├── examples/                    # 示例（展示 SDK 用法）
│   ├── custom-tool/
│   ├── headless-agent/
│   └── vscode-extension/
│
├── scripts/                     # 构建脚本
│   ├── build.mjs
│   ├── build-cli.mjs
│   ├── build-server.mjs
│   └── build-web.mjs
│
├── package.json                 # 根 package.json
├── pnpm-workspace.yaml          # pnpm workspace
├── tsconfig.json
└── turbo.json                   # Turborepo（可选）
```

---

## 三、依赖关系

```
┌─────────────────────────────────────────────────────────────────────────┐
│                       DEPENDENCY GRAPH                                   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Layer 3: Applications (apps/)                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                                                                 │   │
│  │   cli ──────┬──→ @kode/core                                     │   │
│  │             └──→ @kode/client (DirectClient)                    │   │
│  │                                                                 │   │
│  │   server ───┬──→ @kode/core                                     │   │
│  │             └──→ @kode/protocol                                 │   │
│  │                                                                 │   │
│  │   web ──────┬──→ @kode/client (HttpClient)                      │   │
│  │             └──→ @kode/protocol                                 │   │
│  │                                                                 │   │
│  │   vscode ───┬──→ @kode/core                                     │   │
│  │             └──→ @kode/protocol                                 │   │
│  │                                                                 │   │
│  │   desktop ──┬──→ @kode/core (main)                              │   │
│  │             └──→ @kode/client (renderer, IPC)                   │   │
│  │                                                                 │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                              │                                          │
│  Layer 2: Client SDK                                                    │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │   @kode/client ──→ @kode/protocol                               │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                              │                                          │
│  Layer 1: Core Engine                                                   │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │   @kode/core ───┬──→ @kode/protocol                             │   │
│  │                 ├──→ @kode/tools                                │   │
│  │                 ├──→ @kode/config                               │   │
│  │                 └──→ @kode/runtime                              │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                              │                                          │
│  Layer 0: Foundation                                                    │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │   @kode/protocol   (零依赖，纯类型)                              │   │
│  │   @kode/runtime    (零依赖，运行时抽象)                          │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘

依赖规则：
1. 上层依赖下层，下层不依赖上层
2. 同层之间避免循环依赖
3. apps/ 不互相依赖
4. @kode/protocol 是类型枢纽
```

---

## 四、SDK 对外接口

### 4.1 package.json exports

```json
{
  "name": "@kode/kode",
  "version": "2.0.0",
  "exports": {
    ".": "./dist/cli/index.js",
    "./core": "./dist/sdk/core.js",
    "./protocol": "./dist/sdk/protocol.js",
    "./client": "./dist/sdk/client.js",
    "./runtime": "./dist/sdk/runtime.js",
    "./tools": "./dist/sdk/tools.js"
  },
  "bin": {
    "kode": "./dist/cli/bin/kode.js"
  }
}
```

### 4.2 SDK 使用示例

```typescript
// 第三方开发者使用 Kode SDK

// 1. 创建 headless agent
import { createEngine } from '@kode/kode/core'
import { nodeRuntime } from '@kode/kode/runtime'
import type { AgentEvent } from '@kode/kode/protocol'

const engine = createEngine({
  runtime: nodeRuntime,
  model: 'claude-3-sonnet',
})

for await (const event of engine.query('重构这个函数')) {
  console.log(event)
}

// 2. 使用 HTTP Client 连接远程 server
import { HttpClient } from '@kode/kode/client'

const client = new HttpClient('http://localhost:3000')
for await (const event of client.sendMessage('你好')) {
  console.log(event)
}

// 3. 注册自定义工具
import { registerTool } from '@kode/kode/tools'

registerTool({
  name: 'my_tool',
  description: '自定义工具',
  parameters: { /* ... */ },
  execute: async (params) => { /* ... */ }
})
```

---

## 五、各端数据流

### 5.1 CLI 模式

```
用户输入
    │
    ▼
apps/cli/src/ui/screens/REPL.tsx
    │
    ├──→ useChat() hook
    │       │
    │       └──→ DirectClient
    │               │
    │               │ 进程内直接调用
    │               ▼
    │           @kode/core/engine
    │               │
    │               ├──→ @kode/tools
    │               └──→ LLM API
    │
    ◀── AgentEvent ──────────────
    │
    ▼
Ink 渲染到终端
```

### 5.2 Web 模式

```
用户输入 (浏览器)
    │
    ▼
apps/web/src/App.tsx
    │
    └──→ useChat()
              │
              └──→ HttpClient
                        │
                        │ WebSocket
                        ▼
═══════════════ 网络边界 ═══════════════
                        │
                        ▼
              apps/server/routes/chat.ts
                        │
                        └──→ @kode/core/engine
                                  │
                                  └──→ LLM API
                        │
    ◀── AgentEvent (via WS) ─────────
    │
    ▼
React 渲染到浏览器
```

### 5.3 VSCode 模式

```
用户输入 (Webview)
    │
    ▼
apps/vscode/src/webview/App.tsx
    │
    │ vscode.postMessage()
    ▼
═══════════════ Webview 边界 ═══════════════
    │
    ▼
apps/vscode/src/extension.ts
    │
    └──→ @kode/core/engine (扩展进程内)
              │
              └──→ LLM API
    │
    ◀── AgentEvent (via postMessage) ───
    │
    ▼
Webview React 渲染
```

### 5.4 Desktop (Electron) 模式

```
用户输入 (渲染进程)
    │
    ▼
apps/desktop/src/renderer/App.tsx
    │
    │ ipcRenderer.invoke()
    ▼
═══════════════ IPC 边界 ═══════════════
    │
    ▼
apps/desktop/src/main/ipc.ts
    │
    └──→ @kode/core/engine (主进程内)
              │
              └──→ LLM API
    │
    ◀── AgentEvent (via IPC) ───────
    │
    ▼
渲染进程 React 渲染
```

---

## 六、@kode/client 设计

### 6.1 接口定义

```typescript
// packages/client/src/types.ts

import type { AgentEvent, Session } from '@kode/protocol'

export interface KodeClient {
  // 核心交互
  sendMessage(message: string): AsyncGenerator<AgentEvent>
  cancelRequest(): void

  // 工具权限
  approveToolUse(toolUseId: string): Promise<void>
  denyToolUse(toolUseId: string, reason?: string): Promise<void>

  // 会话管理
  listSessions(): Promise<Session[]>
  loadSession(sessionId: string): Promise<Session>
  deleteSession(sessionId: string): Promise<void>

  // 连接状态
  isConnected(): boolean
  disconnect(): void
}
```

### 6.2 实现

```typescript
// DirectClient - CLI/VSCode/Desktop 主进程用
export class DirectClient implements KodeClient {
  private engine: Engine

  async *sendMessage(message: string): AsyncGenerator<AgentEvent> {
    yield* this.engine.query(message)
  }
}

// HttpClient - Web/远程连接用
export class HttpClient implements KodeClient {
  private ws: WebSocket | null = null

  async *sendMessage(message: string): AsyncGenerator<AgentEvent> {
    // 通过 WebSocket 流式传输
  }
}
```

---

## 七、server 与 web 的关系

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     server 与 web 的关系                                 │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   apps/server/               apps/web/                                  │
│   ├── src/                   ├── src/                                   │
│   │   ├── server.ts          │   ├── App.tsx                           │
│   │   ├── routes/            │   ├── pages/                            │
│   │   └── handlers/          │   └── components/                       │
│   └── static/ ◀────────────── └── dist/ (构建产物)                      │
│                                                                         │
│   开发时：                                                               │
│   ┌─────────────┐           ┌─────────────┐                            │
│   │   server    │ ◀──API──▶ │    web      │                            │
│   │  :3000      │           │   :5173     │                            │
│   └─────────────┘           └─────────────┘                            │
│   (两个进程，Vite 代理 API 到 server)                                   │
│                                                                         │
│   生产时：                                                               │
│   ┌─────────────────────────────────────┐                              │
│   │              server                  │                              │
│   │   ├── API routes                     │                              │
│   │   └── static/ (托管 web 构建产物)    │                              │
│   └─────────────────────────────────────┘                              │
│   (一个进程，kode --web)                                                │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

**构建流程**：

```bash
# 开发
pnpm --filter @kode/server dev   # 终端 1
pnpm --filter @kode/web dev      # 终端 2（Vite HMR）

# 构建
pnpm build:web                   # 产物 → apps/web/dist/
cp -r apps/web/dist apps/server/static/
pnpm build:server

# 使用
kode --web                       # 启动 server，托管 static/
```

---

## 八、代码质量标准

### 8.1 文件大小限制

| 类型 | 最大行数 |
|-----|---------|
| 组件 | 300 |
| 服务 | 400 |
| 工具 | 300 |
| 入口 | 100 |

### 8.2 禁止事项

```typescript
// 禁止
// @ts-nocheck
// @ts-ignore
const x = foo as any

// 必须
import type { ... } from '@kode/protocol'  // 使用具体类型
```

### 8.3 必须事项

- 所有公共 API 有 JSDoc
- 所有工具有完整 Schema
- 所有错误有明确类型

---

## 九、从当前结构迁移

### 9.1 迁移映射

```yaml
当前:                              目标:
─────────────────────────────────────────────────────────────────
apps/kode/src/entrypoints/cli.tsx  →  apps/cli/src/index.ts
apps/kode/src/entrypoints/daemon.ts → apps/server/src/index.ts
apps/kode/src/entrypoints/acp.ts   →  删除（合并到 server）
apps/kode/src/entrypoints/mcp.ts   →  合并到 packages/core/mcp/

packages/host-cli/                 →  合并到 apps/cli/
packages/host-acp/                 →  删除
packages/host-mcp/                 →  合并到 packages/core/mcp/
packages/daemon/                   →  apps/server/
packages/core/                     →  packages/core/（重构拆分）
packages/tools-builtin/            →  packages/tools/
packages/config/                   →  packages/config/
packages/protocol/                 →  packages/protocol/
packages/runtime/                  →  packages/runtime/
packages/runtime-node/             →  合并到 packages/runtime/node.ts

ui/ink/                            →  合并到 apps/cli/src/ui/
ui/web/                            →  apps/web/

(新增)                             →  packages/client/
(新增)                             →  apps/vscode/
(新增)                             →  apps/desktop/
```

### 9.2 分阶段执行

#### Phase 1: 基础重组（Week 1）

```yaml
Day 1-2: 创建新目录结构
  - [ ] 创建 apps/cli, apps/server, apps/web
  - [ ] 移动 packages/daemon → apps/server
  - [ ] 移动 ui/web → apps/web
  - [ ] 合并 ui/ink → apps/cli/src/ui

Day 3-4: 合并 host-*
  - [ ] 合并 packages/host-cli → apps/cli
  - [ ] 删除 packages/host-acp, packages/host-mcp
  - [ ] 更新入口点

Day 5: 验证
  - [ ] CLI 正常工作
  - [ ] Server + Web 正常工作
  - [ ] 所有测试通过
```

#### Phase 2: 创建 @kode/client（Week 2）

```yaml
Day 1-2: 实现 Client SDK
  - [ ] 创建 packages/client
  - [ ] 实现 KodeClient 接口
  - [ ] 实现 DirectClient
  - [ ] 实现 HttpClient

Day 3-4: 迁移 apps 使用 Client
  - [ ] apps/cli 使用 DirectClient
  - [ ] apps/web 使用 HttpClient

Day 5: 测试
  - [ ] Client SDK 单元测试
  - [ ] 集成测试
```

#### Phase 3: 拆分大文件（Week 3）

```yaml
重点文件:
  - [ ] packages/core/engine（从 query/index.ts 拆分）
  - [ ] apps/server（从 daemon/server.ts 拆分）
  - [ ] packages/core/permissions（拆分权限引擎）
```

#### Phase 4: 新端开发（Week 4+）

```yaml
VSCode 扩展:
  - [ ] 创建 apps/vscode 基础结构
  - [ ] 实现扩展入口
  - [ ] 实现 Webview UI

Desktop:
  - [ ] 创建 apps/desktop 基础结构
  - [ ] 实现 Electron 主进程
  - [ ] 实现渲染进程 UI
```

---

## 十、构建与发布

### 10.1 开发流程

```bash
# 安装依赖
pnpm install

# 开发 CLI
pnpm --filter @kode/cli dev

# 开发 Web（前后端分离）
pnpm --filter @kode/server dev  # 终端 1
pnpm --filter @kode/web dev     # 终端 2

# 开发 VSCode 扩展
pnpm --filter @kode/vscode dev
# F5 启动扩展开发宿主

# 开发 Desktop
pnpm --filter @kode/desktop dev

# 测试
pnpm test

# 类型检查
pnpm typecheck
```

### 10.2 发布策略

| 产物 | 发布渠道 | 触发条件 |
|-----|---------|---------|
| npm 包 | npmjs.com | git tag `v*` |
| CLI 二进制 | GitHub Releases | git tag `v*` |
| VSCode 扩展 | VS Marketplace | git tag `vscode-v*` |
| Desktop | GitHub Releases | git tag `desktop-v*` |

---

## 十一、产品矩阵

```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│                           Kode 产品矩阵                                  │
│                                                                         │
│   ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐     │
│   │   CLI   │  │   Web   │  │ VSCode  │  │ Desktop │  │   SDK   │     │
│   │         │  │         │  │         │  │         │  │         │     │
│   │ kode    │  │ browser │  │ ext     │  │ app     │  │ npm     │     │
│   └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘     │
│        │            │            │            │            │           │
│        └────────────┴────────────┴────────────┴────────────┘           │
│                                  │                                      │
│                           @kode/core                                    │
│                     (AI 编程助手核心引擎)                                 │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 总结

| 决策 | 选择 |
|-----|------|
| 仓库策略 | **单仓库** |
| UI 策略 | **各端独立实现** |
| server/web 关系 | **分离开发，构建时合并** |
| SDK 定位 | **核心资产，对外开放** |

核心原则：
1. **单仓库** - 一个 Star，一个社区，一个产品线
2. **SDK 优先** - @kode/core 是核心资产
3. **各端独立** - UI 不共享，各端自己实现
4. **依赖清晰** - 下层不依赖上层，无循环

---

*最后更新: 2024-12-31*
